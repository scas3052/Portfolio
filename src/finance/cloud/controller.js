// Links this device to a Google account and runs cloud sync while it is linked.
//
// A device is linked when the marker (marker.js) names a Google account. While that account is
// signed in here, the sync engine keeps the local book and the cloud book in step; while it is
// not, edits wait in the outbox until it signs in again. The book itself always lives in
// localStorage first, so nothing here can lose an edit by being slow or offline.
//
// Firebase is loaded lazily: on a linked device at start-up, otherwise only once someone opens
// the sign-in sheet. `loadApi` resolves to the object firebase.js connect() returns.
import { emptyState } from '../lib/schema'
import { createSyncEngine } from './engine'
import { authMessage } from './errors'
import { changedKeys, mergeRemote, readBook, shallowEqual, txnMonths, uploadOps } from './layout'
import { clearMarker, MARKER_KEY, noteSynced, readMarker, SYNCED_KEY, writeMarker } from './marker'
import { decideLink, mergeBooks } from './merge'
import { addToOutbox, clearOutbox, newToken, OUTBOX_KEY, readOutbox } from './outbox'

const UNLINKED = { linked: false, email: '', status: 'off', detail: null, pending: 0, lastSyncedAt: null }

const NEWER =
  'Your cloud book was saved by a newer version of Gullak. Reload this page to get the latest version, then try again.'
const SIGN_IN_FAILED = 'Sign-in didn’t finish. Please try again.'
const UNREACHABLE = 'Couldn’t reach your cloud book. Check your connection and try again.'

const noop = () => {}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const outboxSize = () => Object.keys(readOutbox()).length
const pendingSet = () => new Set(Object.keys(readOutbox()))
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`

/** What a book holds, so the two books can be told apart when both have data. */
export function summarize(state) {
  let latest = null
  for (const txn of state.transactions) if (!latest || txn.date > latest) latest = txn.date
  return {
    name: state.settings.name,
    entries: state.transactions.length,
    accounts: state.accounts.length,
    loans: state.loans.length,
    people: state.people.length,
    goals: state.goals.length,
    budgets: Object.keys(state.budgets).length,
    latest,
    pin: Boolean(state.settings.pinHash),
  }
}

/**
 * `bridge` is the book store's bridge ({ getState, applyRemote, subscribeLocal }) and `dispatch`
 * its dispatch. `wait`, `now`, `settleMs` and `timers` are there for the tests.
 */
export function createCloudController({
  available,
  loadApi,
  bridge,
  dispatch,
  wait = pause,
  now = Date.now,
  settleMs = 5000,
  timers,
}) {
  const views = new Set()
  let ui = { openSheet: noop, closeSheet: noop, toast: noop, unlock: noop, forgetDevice: noop }
  let api = null
  let loading = null
  let running = false
  // Bumped whenever what this device should be doing may have changed, so a stale check gives up.
  let gen = 0
  // The running engine and the account it syncs: { uid, engine }.
  let engine = null
  let stopUser = null
  let stopEdits = null
  // The "which book?" question while it waits for an answer: { resolve, shown, remote }.
  let choice = null
  let sheetKind = null

  const boot = readMarker()
  let snap = {
    available,
    ...UNLINKED,
    ...(boot && {
      linked: true,
      email: boot.email,
      status: available ? 'connecting' : 'off',
      pending: outboxSize(),
      lastSyncedAt: boot.lastSyncedAt,
    }),
    linking: null,
    sdk: 'idle',
    notice: null,
  }

  function set(patch) {
    const next = { ...snap, ...patch }
    if (shallowEqual(next, snap)) return
    snap = next
    for (const view of views) view()
  }

  /** Loads Firebase once, and waits until it knows who is signed in. */
  function load() {
    if (!available) return Promise.reject(new Error('Cloud sync is not set up for this site.'))
    if (!loading) {
      set({ sdk: 'loading' })
      loading = Promise.resolve()
        .then(loadApi)
        .then(async (loaded) => {
          await loaded.authReady()
          api = loaded
          set({ sdk: 'ready' })
          watchUser()
          return loaded
        })
        .catch((err) => {
          loading = null
          set({ sdk: 'failed' })
          console.warn('Gullak sync: could not load Firebase', err)
          throw err
        })
    }
    return loading
  }

  function watchUser() {
    if (running && api && !stopUser) stopUser = api.onUser(() => void evaluate())
  }

  function quietSignOut() {
    return Promise.resolve()
      .then(() => api?.signOut())
      .catch((err) => console.warn('Gullak sync:', err))
  }

  function showUnlinked() {
    stopEngine()
    set(UNLINKED)
  }

  function showLinked(mark) {
    const patch = { linked: true, email: mark.email, lastSyncedAt: mark.lastSyncedAt }
    if (!engine) {
      patch.status = snap.status === 'signedOut' ? 'signedOut' : 'connecting'
      patch.detail = null
      patch.pending = outboxSize()
    }
    set(patch)
  }

  /** Works out what this device should be doing from the marker and who is signed in, and does it. */
  async function evaluate() {
    if (!running) return
    if (!available) {
      // Built without a Firebase config: a linked device keeps its edits parked for a build that has one.
      const mark = readMarker()
      set(
        mark
          ? { linked: true, email: mark.email, status: 'off', detail: null, pending: outboxSize(), lastSyncedAt: mark.lastSyncedAt }
          : UNLINKED,
      )
      return
    }
    gen += 1
    const mine = gen
    const mark = readMarker()
    if (!mark) {
      // Someone may be signed in half-way through linking; that is not this check's business.
      showUnlinked()
      return
    }
    showLinked(mark)

    let loaded
    try {
      loaded = await load()
    } catch {
      if (mine === gen && running) {
        stopEngine()
        const offline = typeof navigator !== 'undefined' && navigator.onLine === false
        set(offline ? { status: 'offline', detail: null } : { status: 'error', detail: 'load' })
      }
      return
    }
    if (mine !== gen || !running) return

    const fresh = readMarker()
    if (!fresh) {
      showUnlinked()
      return
    }
    showLinked(fresh)
    const user = loaded.currentUser()
    if (user && user.uid === fresh.uid) {
      startEngine(loaded, fresh.uid)
      return
    }
    stopEngine()
    // A different account is signed in (another tab tried one): it has no business here.
    if (user && !snap.linking) void quietSignOut()
    set({ status: 'signedOut', detail: null, pending: outboxSize() })
  }

  function startEngine(loaded, uid) {
    if (engine?.uid === uid) return
    stopEngine()
    let adapter
    try {
      adapter = loaded.book(uid)
    } catch (err) {
      console.warn('Gullak sync:', err)
      set({ status: 'error', detail: 'network' })
      return
    }
    // If another tab signs this device out, this engine must not touch either book again.
    const owns = () => readMarker()?.uid === uid
    const current = { uid, engine: null }
    current.engine = createSyncEngine({
      adapter: {
        listen: (onSnap, onError) => adapter.listen(onSnap, onError),
        commit: (ops, onChunk) =>
          owns()
            ? adapter.commit(ops, onChunk)
            : Promise.reject(Object.assign(new Error('This device was signed out.'), { code: 'cancelled' })),
      },
      bridge: {
        getState: bridge.getState,
        applyRemote: (next) => {
          if (engine === current && owns()) bridge.applyRemote(next)
        },
      },
      onChange: (next) => onEngine(current, next),
      ...(timers && { timers }),
    })
    engine = current
    current.engine.start()
  }

  function onEngine(current, next) {
    if (engine !== current) return
    const patch = { status: next.status, detail: next.detail, pending: next.pending }
    // In step with the cloud right now, or until just now.
    if (next.status === 'synced' || snap.status === 'synced') {
      const at = now()
      noteSynced(current.uid, at)
      patch.lastSyncedAt = at
    }
    set(patch)
  }

  function stopEngine() {
    const current = engine
    if (!current) return
    engine = null
    if (snap.status === 'synced' && readMarker()?.uid === current.uid) {
      const at = now()
      noteSynced(current.uid, at)
      set({ lastSyncedAt: at })
    }
    current.engine.stop()
  }

  function onEdit(prev, next) {
    const keys = changedKeys(prev, next)
    if (!keys.length) return
    if (engine) {
      engine.engine.record(keys, txnMonths(prev, keys))
      return
    }
    // The book is about to be wiped from this device.
    if (snap.linking === 'signout') return
    // Signed out, still loading, or half-way through linking: park the edit until sync runs.
    if (snap.linking || readMarker()) {
      addToOutbox(keys, newToken())
      if (snap.linked) set({ pending: outboxSize() })
    }
  }

  /** Edits another tab made while this one was busy uploading wait in the outbox like any other. */
  function parkEditsSince(base) {
    addToOutbox(changedKeys(base, bridge.getState()), newToken())
  }

  function fail(message) {
    if (!message) return
    if (sheetKind === 'cloudSignIn') {
      set({ notice: message })
      return
    }
    if (sheetKind === 'cloudLink') ui.closeSheet()
    ui.toast(message, { tone: 'rose', duration: 8000 })
  }

  function closeOwnSheet() {
    if (sheetKind === 'cloudSignIn' || sheetKind === 'cloudLink') ui.closeSheet()
  }

  function ask(local, remote, email) {
    set({ linking: 'choosing' })
    return new Promise((resolve) => {
      choice = { resolve, shown: false, remote }
      ui.openSheet('cloudLink', { here: summarize(local), cloud: summarize(remote), email })
    })
  }

  function chooseLink(value) {
    const pending = choice
    if (!pending) return
    choice = null
    pending.resolve(value)
  }

  async function link() {
    let ok = false
    let user = null
    let fallback = SIGN_IN_FAILED
    set({ linking: 'signin', notice: null })
    clearOutbox()
    try {
      // Runs before the first await, so the popup still counts as opened by the click.
      user = await api.signIn()
      const email = user.email || ''
      fallback = UNREACHABLE
      set({ linking: 'checking' })
      const adapter = api.book(user.uid)
      const docs = await adapter.fetchAll()
      const ids = [...docs.keys()]
      const remote = readBook(docs)
      const local = bridge.getState()
      let plan = decideLink(local, remote)
      if (plan === 'newer') {
        await quietSignOut()
        fail(NEWER)
        return
      }
      if (plan === 'ask') {
        plan = await ask(local, remote.state, email)
        if (plan === 'cancel') {
          await quietSignOut()
          ui.toast('Sync stays off. Nothing was changed.')
          return
        }
      }

      set({ linking: 'saving' })
      const base = bridge.getState()
      if (plan === 'adopt' || plan === 'keep') {
        bridge.applyRemote(mergeRemote(base, remote, pendingSet(), remote.pos))
      } else if (plan === 'merge') {
        const ops = uploadOps(mergeBooks(base, remote.state), ids)
        await adapter.commit(ops)
        parkEditsSince(base)
        const written = readBook(new Map(ops.map((op) => [op.doc, op.data])))
        bridge.applyRemote(mergeRemote(bridge.getState(), written, pendingSet(), written.pos))
      } else {
        await adapter.commit(uploadOps(base, ids))
        parkEditsSince(base)
      }

      if (!writeMarker({ uid: user.uid, email })) {
        await quietSignOut()
        fail('This browser’s storage is full or blocked, so sync stays off.')
        return
      }
      noteSynced(user.uid, now())
      ok = true
      await evaluate()
      closeOwnSheet()
      ui.toast(email ? `Sync is on for ${email}.` : 'Sync is on.', { tone: 'mint' })
    } catch (err) {
      if (user) await quietSignOut()
      fail(authMessage(err, fallback))
    } finally {
      // Edits parked for a link that never happened would otherwise be pushed by the next one.
      if (!ok) clearOutbox()
      choice = null
      set({ linking: null })
    }
  }

  async function signInAgain(mark) {
    set({ linking: 'signin', notice: null })
    try {
      const user = await api.signIn()
      if (user.uid !== mark.uid) {
        await quietSignOut()
        fail(
          `This device syncs with ${mark.email || 'another Google account'}. Sign in with that account, or sign this device out first.`,
        )
        return
      }
      closeOwnSheet()
      ui.toast('Signed in. Syncing again.', { tone: 'mint' })
    } catch (err) {
      fail(authMessage(err, SIGN_IN_FAILED))
    } finally {
      set({ linking: null })
      void evaluate()
    }
  }

  /** Opens the Google popup, so call it straight from a click handler. */
  function startLink() {
    if (!available || !api || snap.linking) return Promise.resolve()
    const mark = readMarker()
    return mark ? signInAgain(mark) : link()
  }

  function unsentCount() {
    return Math.max(outboxSize(), engine ? engine.engine.snapshot().pending : 0)
  }

  /** Forgets the book on this device. The cloud copy is left as it is. */
  async function finish() {
    if (snap.linking && snap.linking !== 'signout') return
    set({ linking: 'signout' })
    gen += 1
    stopEngine()
    clearMarker()
    clearOutbox()
    ui.forgetDevice()
    ui.unlock()
    bridge.applyRemote(emptyState())
    set({ ...UNLINKED, notice: null })
    if (api) {
      try {
        await api.signOut()
      } catch (err) {
        console.warn('Gullak sync:', err)
      }
      try {
        await api.terminate()
      } catch (err) {
        console.warn('Gullak sync:', err)
      }
    }
    set({ linking: null })
    ui.toast('Signed out. Your book is safe in the cloud.', { tone: 'mint' })
  }

  /** Gives edits still on their way a few seconds to land, then signs out (asking again if some did not). */
  async function leave(warned) {
    if (snap.linking) return
    set({ linking: 'signout' })
    const current = engine
    if (current) {
      const unsent = () => outboxSize() > 0 || current.engine.hasPending()
      current.engine.retry()
      let waited = 0
      while (unsent() && waited < settleMs && engine === current) {
        await wait(250)
        waited += 250
      }
    }
    const left = unsentCount()
    if (left > 0 && !warned) {
      set({ linking: null })
      ui.openSheet('confirm', {
        title: 'Some edits haven’t reached the cloud',
        body: `${plural(left, 'edit is', 'edits are')} still only on this device, and signing out now loses ${left === 1 ? 'it' : 'them'}. Cancel and try again once you’re back online to keep ${left === 1 ? 'it' : 'them'}.`,
        confirmLabel: 'Sign out anyway',
        hold: true,
        onConfirm: () => void finish(),
      })
      return
    }
    await finish()
  }

  /** Asks first (unless `confirmed`), then signs this device out. */
  function signOutDevice({ confirmed = false } = {}) {
    const mark = readMarker()
    if (!mark || snap.linking) return
    if (confirmed) {
      void leave(true)
      return
    }
    const count = unsentCount()
    // Signed out here, so parked edits cannot be sent before the book is forgotten.
    const stuck = !engine && count > 0
    ui.openSheet('confirm', {
      title: 'Sign out of this device?',
      body: stuck
        ? `${plural(count, 'edit hasn’t', 'edits haven’t')} reached the cloud yet and will be lost if you sign out now. Sign in again first to keep ${count === 1 ? 'it' : 'them'}.`
        : `Your book stays in the cloud${mark.email ? ` (${mark.email})` : ''}. This browser forgets its copy, along with Munshi’s chat. Sign in again any time to bring the book back.`,
      confirmLabel: 'Sign out',
      hold: count > 0,
      onConfirm: () => void leave(stuck),
    })
  }

  /** For a forgotten PIN: signing in as the owner proves who you are, and clears the PIN everywhere. */
  function confirmWithGoogle() {
    const mark = readMarker()
    if (!mark || !api) return Promise.resolve({ ok: false, message: 'Sync is still starting. Try again in a moment.' })
    let pending
    try {
      // Called straight from the click, before any await, so the popup is allowed.
      pending = api.currentUser()?.uid === mark.uid ? api.reauth() : api.signIn()
    } catch (err) {
      pending = Promise.reject(err)
    }
    return pending.then(
      async (user) => {
        if (user?.uid !== mark.uid) {
          await quietSignOut()
          return { ok: false, message: `That’s not the account this device syncs with${mark.email ? ` (${mark.email})` : ''}.` }
        }
        dispatch({ type: 'settings/update', patch: { pinHash: null } })
        ui.unlock()
        ui.toast('PIN removed on every device. Set a new one in Settings.', { tone: 'mint' })
        void evaluate()
        return { ok: true }
      },
      (err) => ({ ok: false, message: authMessage(err, 'Couldn’t confirm with Google. Please try again.') }),
    )
  }

  /** Puts this device's book back after the cloud copy went missing (deleted in the console, say). */
  async function reupload() {
    const current = engine
    if (!current || !api || snap.linking || readMarker()?.uid !== current.uid) return
    set({ linking: 'saving' })
    try {
      const adapter = api.book(current.uid)
      const docs = await adapter.fetchAll()
      if (engine !== current) return
      const remote = readBook(docs)
      if (remote.status === 'newer') {
        fail(NEWER)
        return
      }
      if (remote.status === 'missing') await adapter.commit(uploadOps(bridge.getState(), [...docs.keys()]))
      current.engine.retry()
      ui.toast('Your book is back in the cloud.', { tone: 'mint' })
    } catch (err) {
      fail(authMessage(err, 'Couldn’t upload your book. Check your connection and try again.'))
    } finally {
      set({ linking: null })
    }
  }

  function retry() {
    if (engine) engine.engine.retry()
    else void evaluate()
  }

  /** The sheet now showing (or null). Closing the "which book?" sheet counts as cancelling. */
  function noteSheet(kind) {
    sheetKind = kind
    if (choice) {
      if (kind === 'cloudLink') choice.shown = true
      else if (choice.shown) chooseLink('cancel')
    }
    // A freshly opened sign-in sheet starts without the last attempt's message.
    if (kind === 'cloudSignIn' && snap.notice) set({ notice: null })
  }

  /** Another tab changed localStorage (`key` null means it was cleared). */
  function noteStorage(key) {
    if (!running) return
    if (key === null || key === MARKER_KEY) void evaluate()
    if (key === null || key === OUTBOX_KEY) {
      if (engine) engine.engine.noteOutbox()
      else if (snap.linked) set({ pending: outboxSize() })
    }
    if (key === SYNCED_KEY && snap.linked) set({ lastSyncedAt: readMarker()?.lastSyncedAt ?? null })
  }

  function noteOnline() {
    if (running && !engine && readMarker()) void evaluate()
  }

  function flush() {
    void engine?.engine.flush()
  }

  function start() {
    if (running) return stop
    running = true
    stopEdits = bridge.subscribeLocal(onEdit)
    if (available) watchUser()
    void evaluate()
    return stop
  }

  function stop() {
    if (!running) return
    running = false
    gen += 1
    stopEdits?.()
    stopEdits = null
    stopUser?.()
    stopUser = null
    stopEngine()
    chooseLink('cancel')
  }

  const actions = {
    /** Starts loading Firebase, so the sign-in button can open its popup straight from the click. */
    prepare: () => {
      if (available) load().catch(noop)
    },
    startLink,
    chooseLink,
    /** The cloud's book while the owner is choosing which book to keep (for a backup), else null. */
    cloudCopy: () => choice?.remote ?? null,
    retry,
    reupload: () => void reupload(),
    signOutDevice,
    confirmWithGoogle,
  }

  return {
    subscribe(view) {
      views.add(view)
      return () => {
        views.delete(view)
      }
    },
    getSnapshot: () => snap,
    actions,
    start,
    stop,
    setUi(next) {
      ui = { ...ui, ...next }
    },
    noteSheet,
    noteStorage,
    noteOnline,
    flush,
  }
}
