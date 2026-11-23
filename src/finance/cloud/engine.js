// Keeps the local book and the cloud book in step once a device is linked.
//
// Local edits are recorded as flat keys (see layout.js), parked in the outbox and pushed in small
// debounced batches. Cloud snapshots are folded back into the local book, except for keys that
// still have an edit on its way up: those keep the local value until the cloud confirms it.
//
// The engine knows nothing about Firebase. `adapter` provides:
//   listen(onSnapshot, onError) → unsubscribe, where a snapshot is
//     { fromCache, changed, docs: () => Map<docId, data> }
//   commit(ops, onChunk) → Promise, calling onChunk() as each batch is sent
// and `bridge` connects it to the book: { getState(), applyRemote(state) }.
// `outbox` ({ read, add, ack }) defaults to the localStorage one in outbox.js.
import { mergeRemote, monthDoc, pushOps, readBook, shallowEqual } from './layout'
import { ackOutbox, addToOutbox, newToken, readOutbox } from './outbox'

const realTimers = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) }
const localOutbox = { read: readOutbox, add: addToOutbox, ack: ackOutbox }

// Another tab's outbox entries are taken over once they have sat untouched this long.
const STALE_OUTBOX_MS = 20_000
const QUOTA_BACKOFF_MS = 10 * 60_000

export const backoff = (attempt) => Math.min(5 * 60_000, 2000 * 2 ** Math.max(0, attempt - 1))

export function createSyncEngine({
  adapter,
  bridge,
  onChange = () => {},
  timers = realTimers,
  outbox = localOutbox,
  debounceMs = 350,
}) {
  const dirty = new Set()
  // key → token of the newest edit this tab is responsible for.
  const mine = new Map()
  let inflight = null
  // Where each transaction sits in the cloud (key → Set of month docs) and each entity's position.
  let loc = new Map()
  let pos = new Map()

  let unsubscribe = null
  let listenGen = 0
  let stopped = false
  let gotServerSnapshot = false
  let offline = false
  let denied = false
  let paused = null
  let error = null
  let failures = 0
  let listenFailures = 0
  let listenBroken = false
  // The first snapshot of every listener is read in full, even if it reports no changes.
  let resync = true
  let lastRemote = null
  let snapshotSeq = 0
  let lastSyncedAt = null

  let flushTimer = null
  let retryTimer = null
  let relistenTimer = null
  let staleTimer = null
  let staleSeen = null
  let last = null

  const clearTimer = (id) => {
    if (id !== null) timers.clear(id)
    return null
  }

  function status() {
    if (denied) return { status: 'denied', detail: null }
    if (paused) return { status: 'paused', detail: paused }
    if (!gotServerSnapshot) {
      if (offline) return { status: 'offline', detail: null }
      if (listenBroken) return { status: 'error', detail: 'network' }
      return { status: 'connecting', detail: null }
    }
    if (offline) return { status: 'offline', detail: null }
    if (error || listenBroken) return { status: 'error', detail: error || 'network' }
    if (inflight || dirty.size) return { status: 'syncing', detail: null }
    return { status: 'synced', detail: null }
  }

  function snapshot() {
    const waiting = new Set(dirty)
    if (inflight) for (const key of inflight.keys.keys()) waiting.add(key)
    return { ...status(), pending: waiting.size, lastSyncedAt }
  }

  function emit() {
    if (stopped) return
    const next = snapshot()
    if (last && shallowEqual(last, next)) return
    last = next
    onChange(next)
  }

  /** Every key with a local edit the cloud has not confirmed, from this tab or any other. */
  function pendingKeys() {
    const keys = new Set(dirty)
    if (inflight) for (const key of inflight.keys.keys()) keys.add(key)
    for (const key of Object.keys(outbox.read())) keys.add(key)
    return keys
  }

  function listen() {
    if (stopped || unsubscribe) return
    listenGen += 1
    const gen = listenGen
    resync = true
    let failed = false
    const onError = (err) => {
      if (gen !== listenGen) return
      failed = true
      onListenError(err)
    }
    let stop = null
    try {
      stop = adapter.listen((snap) => {
        if (gen === listenGen && !stopped) onSnapshot(snap)
      }, onError)
    } catch (err) {
      onError(err)
    }
    // The error callback can fire before listen() returns; the listener is already dead then.
    if (failed) stop?.()
    else unsubscribe = stop
  }

  function onSnapshot(snap) {
    if (snap.fromCache) {
      // Only happens while the connection is down; the cached data may be partial, so it is not read.
      offline = true
      emit()
      return
    }
    const wasOffline = offline || !gotServerSnapshot
    offline = false
    listenBroken = false
    listenFailures = 0
    snapshotSeq += 1
    if (!lastRemote || snap.changed || wasOffline || paused || resync) decode(snap.docs())
    resync = false
    gotServerSnapshot = true
    emit()
    if (dirty.size) flush()
  }

  function decode(docs) {
    const book = readBook(docs)
    if (book.status !== 'ok') {
      paused = book.status
      lastRemote = null
      return
    }
    paused = null
    lastRemote = book
    const pending = pendingKeys()

    const nextLoc = new Map()
    for (const [key, months] of book.loc) nextLoc.set(key, new Set(months))
    // An edit still on its way may move or delete a transaction; keep its old spot so it is cleared.
    for (const key of pending) {
      const known = loc.get(key)
      if (!known) continue
      if (!nextLoc.has(key)) nextLoc.set(key, new Set())
      for (const month of known) nextLoc.get(key).add(month)
    }
    loc = nextLoc

    const nextPos = new Map(book.pos)
    for (const key of pending) if (!nextPos.has(key) && pos.has(key)) nextPos.set(key, pos.get(key))
    pos = nextPos

    reconcile(pending)
    cleanup(pending)
  }

  function reconcile(pending = pendingKeys()) {
    if (!lastRemote) return
    const local = bridge.getState()
    const next = mergeRemote(local, lastRemote, pending, pos)
    if (next !== local) bridge.applyRemote(next)
  }

  // An interrupted move can leave a transaction in two month docs, or in the wrong one; rewrite it.
  function cleanup(pending) {
    const stray = []
    for (const [key, months] of lastRemote.loc) {
      if (pending.has(key)) continue
      const txn = lastRemote.flat.get(key)
      if (txn && (months.size > 1 || !months.has(monthDoc(txn)))) stray.push(key)
    }
    if (stray.length) record(stray)
  }

  function schedule() {
    flushTimer = clearTimer(flushTimer)
    flushTimer = timers.set(() => {
      flushTimer = null
      flush()
    }, debounceMs)
  }

  /**
   * Notes local edits. `hints` maps transaction keys to the month they were in before the edit,
   * so a move or delete also reaches a spot this tab has not seen in a snapshot yet.
   */
  function record(keys, hints) {
    if (stopped || !keys.length) return
    const token = newToken()
    outbox.add(keys, token)
    for (const key of keys) {
      dirty.add(key)
      mine.set(key, token)
    }
    if (hints) {
      for (const [key, month] of hints) {
        if (!loc.has(key)) loc.set(key, new Set())
        loc.get(key).add(month)
      }
    }
    schedule()
    emit()
  }

  async function flush() {
    if (stopped || !gotServerSnapshot || offline || denied || paused || error === 'invalid') return
    if (inflight || retryTimer !== null || !dirty.size) return
    flushTimer = clearTimer(flushTimer)

    const keys = [...dirty]
    dirty.clear()
    const sent = new Map(keys.map((key) => [key, mine.get(key)]))
    const current = { keys: sent, issuedAt: snapshotSeq, placed: new Map() }
    inflight = current

    try {
      const { ops, placed, posUpdates } = pushOps(keys, bridge.getState(), { loc, pos })
      current.placed = placed
      for (const [key, value] of posUpdates) pos.set(key, value)
      emit()
      if (ops.length) {
        await adapter.commit(ops, () => {
          if (inflight === current) current.issuedAt = snapshotSeq
        })
      }
    } catch (err) {
      if (inflight === current) onFail(err)
      return
    }
    outbox.ack(sent)
    if (!stopped && inflight === current) onAck()
  }

  function onAck() {
    const { keys: sent, placed, issuedAt } = inflight
    inflight = null
    for (const [key, token] of sent) if (mine.get(key) === token && !dirty.has(key)) mine.delete(key)
    for (const [key, month] of placed) {
      if (month) loc.set(key, new Set([month]))
      else loc.delete(key)
    }
    lastSyncedAt = Date.now()
    error = null
    failures = 0
    // Snapshots that arrived while these keys were on their way skipped them; catch up now, but
    // only from a snapshot taken after the write went out, so it cannot undo the write.
    if (snapshotSeq > issuedAt) reconcile()
    emit()
    if (dirty.size) flush()
  }

  function armRetry(ms) {
    retryTimer = clearTimer(retryTimer)
    retryTimer = timers.set(() => {
      retryTimer = null
      flush()
    }, ms)
  }

  function onFail(err) {
    const sent = inflight.keys
    inflight = null
    if (stopped) return
    for (const key of sent.keys()) dirty.add(key)
    const code = err?.code || ''
    if (code === 'permission-denied') denied = true
    else if (code === 'resource-exhausted') {
      error = 'quota'
      armRetry(QUOTA_BACKOFF_MS)
    } else if (code === 'invalid-argument') error = 'invalid'
    else {
      if (!code) console.warn('Gullak sync:', err)
      error = 'network'
      failures += 1
      armRetry(backoff(failures))
    }
    emit()
  }

  function onListenError(err) {
    unsubscribe = null
    if (stopped) return
    if (err?.code === 'permission-denied') {
      denied = true
      emit()
      return
    }
    listenBroken = true
    listenFailures += 1
    relistenTimer = clearTimer(relistenTimer)
    relistenTimer = timers.set(() => {
      relistenTimer = null
      listen()
    }, backoff(listenFailures))
    emit()
  }

  function adopt(entries) {
    for (const [key, token] of Object.entries(entries)) {
      dirty.add(key)
      mine.set(key, token)
    }
  }

  return {
    start() {
      if (stopped) return
      adopt(outbox.read())
      listen()
      emit()
    },
    record,
    flush,
    /** Clears errors and tries again now. */
    retry() {
      if (stopped) return
      denied = false
      error = null
      failures = 0
      retryTimer = clearTimer(retryTimer)
      if (!unsubscribe) {
        relistenTimer = clearTimer(relistenTimer)
        listenFailures = 0
        listen()
      }
      emit()
      flush()
    },
    /**
     * Called when another tab touches the outbox. Edits it parked and never confirmed (the tab was
     * closed, say) are taken over once the outbox has been quiet for a while.
     */
    noteOutbox() {
      if (stopped) return
      staleSeen = outbox.read()
      staleTimer = clearTimer(staleTimer)
      staleTimer = timers.set(() => {
        staleTimer = null
        const now = outbox.read()
        const orphaned = {}
        for (const [key, token] of Object.entries(now)) {
          if (staleSeen[key] !== token || mine.get(key) === token) continue
          if (inflight && inflight.keys.get(key) === token) continue
          orphaned[key] = token
        }
        if (!Object.keys(orphaned).length) return
        adopt(orphaned)
        emit()
        flush()
      }, STALE_OUTBOX_MS)
    },
    stop() {
      stopped = true
      unsubscribe?.()
      unsubscribe = null
      flushTimer = clearTimer(flushTimer)
      retryTimer = clearTimer(retryTimer)
      relistenTimer = clearTimer(relistenTimer)
      staleTimer = clearTimer(staleTimer)
    },
    hasPending: () => dirty.size > 0 || inflight !== null,
    snapshot,
  }
}
