// Stand-ins for Firestore and timers, so the sync tests can play out every step by hand.

const clone = (value) => structuredClone(value)
const cloneDocs = (docs) => new Map([...docs].map(([id, data]) => [id, clone(data)]))

function setPath(data, path, value) {
  let node = data
  for (const name of path.slice(0, -1)) {
    if (!node[name] || typeof node[name] !== 'object') node[name] = {}
    node = node[name]
  }
  node[path[path.length - 1]] = clone(value)
}

function deletePath(data, path) {
  let node = data
  for (const name of path.slice(0, -1)) {
    node = node?.[name]
    if (!node || typeof node !== 'object') return
  }
  delete node[path[path.length - 1]]
}

/** Applies writes the way Firestore does: a replace swaps the whole document, a merge touches only its fields. */
export function applyOps(docs, ops) {
  for (const op of ops) {
    if (op.type === 'replace') {
      docs.set(op.doc, clone(op.data))
      continue
    }
    const data = docs.get(op.doc) ?? {}
    for (const field of op.fields) {
      if (field.delete) deletePath(data, field.path)
      else setPath(data, field.path, field.value)
    }
    docs.set(op.doc, data)
  }
  return docs
}

const serialize = (docs) => JSON.stringify([...docs].sort(([a], [b]) => (a < b ? -1 : 1)))

/**
 * One user's book in the cloud, as the sync engine sees it through its adapter. Snapshots show the
 * server's documents with this device's unconfirmed writes laid on top, like Firestore's
 * latency compensation, and arrive on a microtask. Commits wait until the test calls ack() or fail().
 */
export class FakeCloud {
  constructor(docs = new Map()) {
    this.server = docs
    this.queue = []
    this.commits = []
    this.listener = null
    this.listens = 0
    this.online = true
    this.shown = null
  }

  view() {
    const docs = cloneDocs(this.server)
    for (const { ops } of this.queue) applyOps(docs, ops)
    return docs
  }

  emit() {
    const listener = this.listener
    if (!listener) return
    const docs = this.view()
    const text = serialize(docs)
    const changed = text !== this.shown
    this.shown = text
    const snap = { fromCache: !this.online, changed, docs: () => cloneDocs(docs) }
    queueMicrotask(() => {
      if (this.listener === listener) listener.onSnap(snap)
    })
  }

  listen(onSnap, onError) {
    const listener = { onSnap, onError }
    this.listener = listener
    this.listens += 1
    // A new listener reports every document as added.
    this.shown = serialize(new Map())
    this.emit()
    return () => {
      if (this.listener === listener) this.listener = null
    }
  }

  commit(ops, onChunk) {
    this.commits.push(clone(ops))
    onChunk?.()
    return new Promise((resolve, reject) => {
      this.queue.push({ ops: clone(ops), resolve, reject })
      this.emit()
    })
  }

  get waiting() {
    return this.queue.length
  }

  /** The server accepts the oldest waiting commit. */
  ack() {
    const entry = this.queue.shift()
    applyOps(this.server, entry.ops)
    entry.resolve()
    this.emit()
  }

  /** The server rejects the oldest waiting commit, which drops out of the view again. */
  fail(code) {
    const entry = this.queue.shift()
    entry.reject(Object.assign(new Error(code), { code }))
    this.emit()
  }

  /** Another device writes. */
  remoteWrite(ops) {
    applyOps(this.server, ops)
    this.emit()
  }

  goOffline() {
    this.online = false
    this.emit()
  }

  goOnline() {
    this.online = true
    this.emit()
  }

  /** The listener dies with an error, as Firestore listeners do. */
  breakListener(code) {
    const listener = this.listener
    this.listener = null
    listener?.onError(Object.assign(new Error(code), { code }))
  }

  doc(id) {
    return this.server.get(id)
  }
}

/** Manual timers: nothing runs until tick() moves the clock past it. */
export function fakeTimers() {
  let now = 0
  let nextId = 1
  const timers = new Map()
  return {
    set(fn, ms) {
      const id = nextId
      nextId += 1
      timers.set(id, { fn, at: now + ms })
      return id
    },
    clear(id) {
      timers.delete(id)
    },
    /** How long until each waiting timer fires. */
    get waits() {
      return [...timers.values()].map((timer) => timer.at - now).sort((a, b) => a - b)
    },
    tick(ms) {
      const until = now + ms
      for (;;) {
        let next = null
        for (const [id, timer] of timers) if (timer.at <= until && (!next || timer.at < next.timer.at)) next = { id, timer }
        if (!next) break
        timers.delete(next.id)
        now = next.timer.at
        next.timer.fn()
      }
      now = until
    },
  }
}

/** Lets queued snapshots and promise callbacks run. */
export const settle = () => new Promise((resolve) => setImmediate(resolve))
