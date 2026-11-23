import { afterEach, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { backoff, createSyncEngine } from '../../src/finance/cloud/engine.js'
import { changedKeys, MONTH_DOC, pushOps, readBook, txnMonths, uploadOps } from '../../src/finance/cloud/layout.js'
import { ackOutbox, addToOutbox, readOutbox } from '../../src/finance/cloud/outbox.js'
import { buildSample } from '../../src/finance/lib/sample.js'
import { SCHEMA_VERSION } from '../../src/finance/lib/schema.js'
import { reducer } from '../../src/finance/store/reducer.js'
import { installWindow, memoryStorage, TODAY } from '../helpers/ctx.mjs'
import { applyOps, FakeCloud, fakeTimers, settle } from '../helpers/cloud.mjs'

let restore
beforeEach(() => {
  restore = installWindow()
})
afterEach(() => restore())

function book() {
  const state = buildSample(TODAY)
  return { ...state, settings: { ...state.settings, name: 'Asha', pinHash: 'hash', onboarded: true }, meta: { sample: false } }
}

const upload = (state) => applyOps(new Map(), uploadOps(state))
const stored = (item) => Object.fromEntries(Object.entries(item).filter(([key]) => key !== 'id'))
const status = (dev) => {
  const { status: name, detail } = dev.engine.snapshot()
  return detail ? `${name}/${detail}` : name
}
const findTxn = (state, id) => state.transactions.find((t) => t.id === id)

// The same book whichever order its entries happen to be in, with the device-only switch ignored.
const comparable = (state) => ({
  ...state,
  settings: { ...state.settings, privacy: false },
  transactions: [...state.transactions].sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1)),
})

/** One browser: its book, its engine, and the statuses the engine reported. */
function device({ state, cloud, outbox } = {}) {
  const dev = { state, applied: 0, statuses: [], cloud, timers: fakeTimers() }
  dev.engine = createSyncEngine({
    adapter: cloud,
    bridge: {
      getState: () => dev.state,
      applyRemote: (next) => {
        dev.state = next
        dev.applied += 1
      },
    },
    onChange: (snapshot) => dev.statuses.push(snapshot),
    timers: dev.timers,
    ...(outbox ? { outbox } : {}),
  })
  dev.edit = (action) => {
    const prev = dev.state
    dev.state = reducer(prev, action)
    const keys = changedKeys(prev, dev.state)
    dev.engine.record(keys, txnMonths(prev, keys))
    return keys
  }
  return dev
}

async function linked(state = book(), docs = upload(state)) {
  const cloud = new FakeCloud(docs)
  const dev = device({ state, cloud })
  dev.engine.start()
  await settle()
  return dev
}

/** Another device, already up to date, edits the cloud book. */
function elsewhere(cloud, action) {
  const remote = readBook(cloud.server)
  const next = reducer(remote.state, action)
  cloud.remoteWrite(pushOps(changedKeys(remote.state, next), next, { loc: remote.loc, pos: remote.pos }).ops)
}

test('a device that already matches the cloud settles without writing or changing anything', async () => {
  const state = book()
  const dev = device({ state, cloud: new FakeCloud(upload(state)) })
  dev.engine.start()
  assert.equal(status(dev), 'connecting')

  await settle()
  assert.equal(status(dev), 'synced')
  assert.deepEqual(
    dev.statuses.map((s) => s.status),
    ['connecting', 'synced'],
  )
  assert.equal(dev.applied, 0)
  assert.equal(dev.state, state)
  assert.equal(dev.cloud.commits.length, 0)
  assert.deepEqual(dev.timers.waits, [])
})

test('local edits are gathered for a moment, then written field by field', async () => {
  const dev = await linked()
  const txn = dev.state.transactions[0]
  const month = txn.date.slice(0, 7)

  dev.edit({ type: 'txn/update', txn: { ...txn, note: 'Chai with Ravi' } })
  assert.equal(status(dev), 'syncing')
  assert.deepEqual(Object.keys(readOutbox()), [`txn:${txn.id}`])
  dev.timers.tick(200)
  dev.edit({ type: 'budget/set', id: 'food', amount: 9123 })
  dev.timers.tick(349)
  assert.equal(dev.cloud.commits.length, 0)

  dev.timers.tick(1)
  assert.deepEqual(dev.cloud.commits, [
    [
      { type: 'merge', doc: month, fields: [{ path: ['items', txn.id], value: stored({ ...txn, note: 'Chai with Ravi' }) }] },
      { type: 'merge', doc: 'core', fields: [{ path: ['budgets', 'food'], value: 9123 }] },
    ],
  ])
  assert.equal(dev.engine.snapshot().pending, 2)

  dev.cloud.ack()
  await settle()
  assert.equal(status(dev), 'synced')
  assert.equal(dev.engine.snapshot().pending, 0)
  assert.ok(dev.engine.snapshot().lastSyncedAt > 0)
  assert.deepEqual(readOutbox(), {})
  assert.equal(dev.cloud.doc(month).items[txn.id].note, 'Chai with Ravi')
  assert.equal(dev.cloud.doc('core').budgets.food, 9123)
  assert.equal(dev.applied, 0)
  assert.equal(dev.cloud.commits.length, 1)
})

test("another device's edits are folded in, reusing everything they did not touch, and not sent back", async () => {
  const dev = await linked()
  const before = dev.state
  const txn = before.transactions[5]

  elsewhere(dev.cloud, { type: 'txn/update', txn: { ...txn, amount: 4321 } })
  await settle()
  assert.equal(dev.applied, 1)
  assert.equal(findTxn(dev.state, txn.id).amount, 4321)
  assert.equal(dev.state.accounts, before.accounts)
  assert.equal(dev.state.budgets, before.budgets)
  assert.equal(dev.state.settings, before.settings)
  assert.equal(dev.state.transactions[0], before.transactions[0])

  dev.timers.tick(10_000)
  assert.equal(dev.cloud.commits.length, 0)
  assert.deepEqual(readOutbox(), {})
  assert.equal(status(dev), 'synced')
})

test('an edit that has not reached the cloud yet keeps its value, and ends up winning', async () => {
  const dev = await linked()
  const txn = dev.state.transactions[3]
  const month = txn.date.slice(0, 7)

  dev.edit({ type: 'txn/update', txn: { ...txn, note: 'mine' } })
  elsewhere(dev.cloud, { type: 'txn/update', txn: { ...txn, note: 'theirs' } })
  await settle()
  assert.equal(findTxn(dev.state, txn.id).note, 'mine')

  dev.timers.tick(350)
  assert.equal(dev.cloud.commits.length, 1)
  elsewhere(dev.cloud, { type: 'txn/update', txn: { ...txn, note: 'theirs again' } })
  await settle()
  assert.equal(findTxn(dev.state, txn.id).note, 'mine')

  dev.cloud.ack()
  await settle()
  assert.equal(findTxn(dev.state, txn.id).note, 'mine')
  assert.equal(dev.cloud.doc(month).items[txn.id].note, 'mine')
  assert.equal(status(dev), 'synced')

  // Once confirmed, the entry follows the cloud again.
  elsewhere(dev.cloud, { type: 'txn/update', txn: { ...txn, note: 'theirs at last' } })
  await settle()
  assert.equal(findTxn(dev.state, txn.id).note, 'theirs at last')
})

test('moving an entry to another month moves it between documents, and deleting it clears it', async () => {
  const dev = await linked()
  const txn = dev.state.transactions.find((t) => t.date.startsWith('2026-09'))
  const moved = { ...txn, date: '2026-10-05' }

  dev.edit({ type: 'txn/update', txn: moved })
  dev.timers.tick(350)
  assert.deepEqual(dev.cloud.commits[0], [
    { type: 'merge', doc: '2026-10', fields: [{ path: ['items', txn.id], value: stored(moved) }] },
    { type: 'merge', doc: '2026-09', fields: [{ path: ['items', txn.id], delete: true }] },
  ])
  dev.cloud.ack()
  await settle()
  assert.equal(dev.cloud.doc('2026-09').items[txn.id], undefined)
  assert.deepEqual(dev.cloud.doc('2026-10').items[txn.id], stored(moved))

  dev.edit({ type: 'txn/delete', id: txn.id })
  dev.timers.tick(350)
  assert.deepEqual(dev.cloud.commits[1], [{ type: 'merge', doc: '2026-10', fields: [{ path: ['items', txn.id], delete: true }] }])
  dev.cloud.ack()
  await settle()
  assert.equal(dev.cloud.doc('2026-10').items[txn.id], undefined)
  assert.equal(status(dev), 'synced')
  assert.equal(dev.applied, 0)
})

test('edits made offline wait in the outbox and go up as soon as the connection is back', async () => {
  const dev = await linked()
  dev.cloud.goOffline()
  await settle()
  assert.equal(status(dev), 'offline')

  dev.edit({ type: 'budget/set', id: 'food', amount: 7777 })
  dev.timers.tick(60_000)
  assert.equal(dev.cloud.commits.length, 0)
  assert.deepEqual(Object.keys(readOutbox()), ['budget:food'])
  assert.equal(dev.engine.snapshot().pending, 1)
  assert.equal(status(dev), 'offline')

  dev.cloud.goOnline()
  await settle()
  assert.equal(dev.cloud.commits.length, 1)
  assert.equal(status(dev), 'syncing')
  dev.cloud.ack()
  await settle()
  assert.equal(status(dev), 'synced')
  assert.equal(dev.cloud.doc('core').budgets.food, 7777)
  assert.equal(dev.state.budgets.food, 7777)
})

test('a device that starts without a connection says so, and catches up when it connects', async () => {
  const state = book()
  const docs = upload(state)
  const cloud = new FakeCloud(docs)
  cloud.goOffline()
  elsewhere(cloud, { type: 'settings/update', patch: { name: 'Asha Rao' } })
  const dev = device({ state, cloud })
  dev.engine.start()
  await settle()
  assert.equal(status(dev), 'offline')
  assert.equal(dev.applied, 0)

  cloud.goOnline()
  await settle()
  assert.equal(status(dev), 'synced')
  assert.equal(dev.state.settings.name, 'Asha Rao')
})

test('a write that fails for want of a connection is retried after growing waits', async () => {
  const dev = await linked()
  dev.edit({ type: 'budget/set', id: 'food', amount: 1234 })
  dev.timers.tick(350)
  dev.cloud.fail('unavailable')
  await settle()
  assert.equal(status(dev), 'error/network')
  assert.deepEqual(dev.timers.waits, [2000])
  assert.equal(dev.state.budgets.food, 1234)

  dev.timers.tick(1999)
  assert.equal(dev.cloud.commits.length, 1)
  dev.timers.tick(1)
  assert.equal(dev.cloud.commits.length, 2)
  dev.cloud.fail('unavailable')
  await settle()
  assert.deepEqual(dev.timers.waits, [4000])

  dev.timers.tick(4000)
  assert.equal(dev.cloud.commits.length, 3)
  dev.cloud.ack()
  await settle()
  assert.equal(status(dev), 'synced')
  assert.deepEqual(dev.timers.waits, [])
  assert.deepEqual(readOutbox(), {})
  assert.equal(dev.cloud.doc('core').budgets.food, 1234)
})

test('the wait between attempts doubles from two seconds up to five minutes', () => {
  assert.deepEqual(
    [0, 1, 2, 3, 8, 9, 20].map(backoff),
    [2000, 2000, 4000, 8000, 256_000, 300_000, 300_000],
  )
})

test('a write refused by the security rules stops syncing until retry()', async () => {
  const dev = await linked()
  dev.edit({ type: 'budget/set', id: 'food', amount: 1111 })
  dev.timers.tick(350)
  dev.cloud.fail('permission-denied')
  await settle()
  assert.equal(status(dev), 'denied')
  assert.deepEqual(dev.timers.waits, [])

  dev.edit({ type: 'settings/update', patch: { name: 'Asha R' } })
  dev.timers.tick(60_000)
  assert.equal(dev.cloud.commits.length, 1)
  assert.equal(status(dev), 'denied')
  assert.equal(dev.engine.snapshot().pending, 2)

  dev.engine.retry()
  assert.equal(dev.cloud.commits.length, 2)
  assert.deepEqual(dev.cloud.commits[1], [
    {
      type: 'merge',
      doc: 'core',
      fields: [
        { path: ['budgets', 'food'], value: 1111 },
        { path: ['settings', 'name'], value: 'Asha R' },
      ],
    },
  ])
  dev.cloud.ack()
  await settle()
  assert.equal(status(dev), 'synced')
})

test('a malformed write waits for retry(), and a spent quota waits ten minutes', async () => {
  const dev = await linked()
  dev.edit({ type: 'budget/set', id: 'food', amount: 2222 })
  dev.timers.tick(350)
  dev.cloud.fail('invalid-argument')
  await settle()
  assert.equal(status(dev), 'error/invalid')
  assert.deepEqual(dev.timers.waits, [])
  dev.edit({ type: 'budget/set', id: 'fuel', amount: 3333 })
  dev.timers.tick(60_000)
  assert.equal(dev.cloud.commits.length, 1)

  dev.engine.retry()
  assert.equal(dev.cloud.commits.length, 2)
  dev.cloud.fail('resource-exhausted')
  await settle()
  assert.equal(status(dev), 'error/quota')
  assert.deepEqual(dev.timers.waits, [600_000])
  dev.timers.tick(599_999)
  assert.equal(dev.cloud.commits.length, 2)
  dev.timers.tick(1)
  assert.equal(dev.cloud.commits.length, 3)
  dev.cloud.ack()
  await settle()
  assert.equal(status(dev), 'synced')
  assert.equal(dev.cloud.doc('core').budgets.fuel, 3333)
})

test('a dropped listener reconnects after a wait and picks up what changed meanwhile', async () => {
  const dev = await linked()
  dev.cloud.breakListener('unavailable')
  assert.equal(status(dev), 'error/network')
  assert.deepEqual(dev.timers.waits, [2000])

  elsewhere(dev.cloud, { type: 'budget/set', id: 'food', amount: 2468 })
  await settle()
  assert.equal(dev.applied, 0)

  dev.timers.tick(2000)
  assert.equal(dev.cloud.listens, 2)
  await settle()
  assert.equal(dev.applied, 1)
  assert.equal(dev.state.budgets.food, 2468)
  assert.equal(status(dev), 'synced')
})

test('a listener refused by the security rules reports denied, and retry() listens again', async () => {
  const dev = await linked()
  dev.cloud.breakListener('permission-denied')
  assert.equal(status(dev), 'denied')
  assert.deepEqual(dev.timers.waits, [])

  dev.engine.retry()
  assert.equal(dev.cloud.listens, 2)
  await settle()
  assert.equal(status(dev), 'synced')
})

test('without a readable book in the cloud nothing is read or written until it is back', async () => {
  const state = book()
  const docs = upload(state)
  const core = docs.get('core')
  docs.delete('core')
  const dev = await linked(state, docs)
  assert.equal(status(dev), 'paused/missing')

  dev.edit({ type: 'budget/set', id: 'food', amount: 3333 })
  dev.timers.tick(60_000)
  assert.equal(dev.cloud.commits.length, 0)

  dev.cloud.remoteWrite([{ type: 'replace', doc: 'core', data: { ...core, version: SCHEMA_VERSION + 1 } }])
  await settle()
  assert.equal(status(dev), 'paused/newer')
  assert.equal(dev.cloud.commits.length, 0)
  assert.equal(dev.applied, 0)

  dev.cloud.remoteWrite([{ type: 'replace', doc: 'core', data: core }])
  await settle()
  assert.equal(status(dev), 'syncing')
  assert.equal(dev.state.budgets.food, 3333)
  assert.deepEqual(dev.cloud.commits, [[{ type: 'merge', doc: 'core', fields: [{ path: ['budgets', 'food'], value: 3333 }] }]])
  dev.cloud.ack()
  await settle()
  assert.equal(status(dev), 'synced')
})

test('edits that never left survive a reload in the outbox, and still win', async () => {
  const first = await linked()
  first.edit({ type: 'budget/set', id: 'food', amount: 4444 })
  first.engine.stop()
  assert.deepEqual(Object.keys(readOutbox()), ['budget:food'])
  elsewhere(first.cloud, { type: 'budget/set', id: 'food', amount: 5555 })

  const second = device({ state: first.state, cloud: first.cloud })
  second.engine.start()
  assert.equal(second.engine.snapshot().pending, 1)
  await settle()
  assert.equal(second.state.budgets.food, 4444)
  assert.deepEqual(second.cloud.commits, [[{ type: 'merge', doc: 'core', fields: [{ path: ['budgets', 'food'], value: 4444 }] }]])
  second.cloud.ack()
  await settle()
  assert.equal(second.cloud.doc('core').budgets.food, 4444)
  assert.deepEqual(readOutbox(), {})
  assert.equal(status(second), 'synced')
})

test("another tab's unconfirmed edits are taken over once they have sat untouched for a while", async () => {
  const dev = await linked()
  // The other tab saved the book (which reached this tab through the storage event) and closed.
  dev.state = reducer(dev.state, { type: 'budget/set', id: 'food', amount: 6666 })
  addToOutbox(['budget:food'], 'other.1')
  dev.engine.noteOutbox()
  dev.timers.tick(10_000)
  // It was still alive: a newer edit restarts the wait.
  dev.state = reducer(dev.state, { type: 'budget/set', id: 'food', amount: 6667 })
  addToOutbox(['budget:food'], 'other.2')
  dev.engine.noteOutbox()
  dev.timers.tick(19_999)
  assert.equal(dev.cloud.commits.length, 0)
  assert.equal(status(dev), 'synced')

  dev.timers.tick(1)
  assert.deepEqual(dev.cloud.commits, [[{ type: 'merge', doc: 'core', fields: [{ path: ['budgets', 'food'], value: 6667 }] }]])
  dev.cloud.ack()
  await settle()
  assert.deepEqual(readOutbox(), {})
  assert.equal(status(dev), 'synced')
})

test('nothing is taken over when the other tab confirms its edits in time', async () => {
  const dev = await linked()
  addToOutbox(['budget:food'], 'other.1')
  dev.engine.noteOutbox()
  dev.timers.tick(5000)
  ackOutbox(new Map([['budget:food', 'other.1']]))
  dev.engine.noteOutbox()
  dev.timers.tick(60_000)
  assert.equal(dev.cloud.commits.length, 0)
  assert.equal(dev.engine.snapshot().pending, 0)
})

test('a copy left in the wrong month by an interrupted move is cleaned up on sight', async () => {
  const state = book()
  const docs = upload(state)
  const txn = state.transactions.find((t) => t.date.startsWith('2026-09'))
  docs.get('2026-10').items[txn.id] = stored({ ...txn, note: 'stale copy' })
  const dev = await linked(state, docs)

  assert.equal(dev.applied, 0)
  assert.deepEqual(dev.cloud.commits, [
    [
      { type: 'merge', doc: '2026-09', fields: [{ path: ['items', txn.id], value: stored(txn) }] },
      { type: 'merge', doc: '2026-10', fields: [{ path: ['items', txn.id], delete: true }] },
    ],
  ])
  dev.cloud.ack()
  await settle()
  assert.equal(dev.cloud.doc('2026-10').items[txn.id], undefined)
  assert.equal(status(dev), 'synced')
  assert.deepEqual(readOutbox(), {})
})

test('an edit made while the same entry is being written goes up right after, and stays parked until then', async () => {
  const dev = await linked()
  const txn = dev.state.transactions[2]
  const key = `txn:${txn.id}`
  dev.edit({ type: 'txn/update', txn: { ...txn, note: 'first' } })
  dev.timers.tick(350)
  dev.edit({ type: 'txn/update', txn: { ...txn, note: 'second' } })
  const token = readOutbox()[key]

  dev.cloud.ack()
  await settle()
  assert.deepEqual(readOutbox(), { [key]: token })
  assert.equal(findTxn(dev.state, txn.id).note, 'second')
  assert.equal(dev.cloud.commits.length, 2)
  assert.equal(dev.cloud.commits[1][0].fields[0].value.note, 'second')

  dev.cloud.ack()
  await settle()
  assert.deepEqual(readOutbox(), {})
  assert.equal(dev.cloud.doc(txn.date.slice(0, 7)).items[txn.id].note, 'second')
  assert.equal(status(dev), 'synced')
})

test('stop() lets go of everything, though a write already sent still clears its outbox entry', async () => {
  const dev = await linked()
  dev.edit({ type: 'budget/set', id: 'food', amount: 8888 })
  dev.timers.tick(350)
  dev.edit({ type: 'settings/update', patch: { name: 'Asha R' } })
  const reported = dev.statuses.length

  dev.engine.stop()
  assert.equal(dev.cloud.listener, null)
  assert.deepEqual(dev.timers.waits, [])
  dev.engine.record(['budget:fuel'])
  dev.engine.retry()
  dev.engine.noteOutbox()
  assert.deepEqual(dev.timers.waits, [])
  assert.deepEqual(Object.keys(readOutbox()).sort(), ['budget:food', 'settings:name'])

  dev.cloud.ack()
  await settle()
  assert.deepEqual(Object.keys(readOutbox()), ['settings:name'])
  assert.equal(dev.statuses.length, reported)
  assert.equal(dev.cloud.commits.length, 1)
})

// ── Two devices editing at once ──────────────────────────────────────────────────────────────

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** An outbox of the device's own: the real one, run against a separate localStorage. */
function ownOutbox() {
  const storage = memoryStorage()
  const using =
    (fn) =>
    (...args) => {
      const shared = window.localStorage
      window.localStorage = storage
      try {
        return fn(...args)
      } finally {
        window.localStorage = shared
      }
    }
  return { read: using(readOutbox), add: using(addToOutbox), ack: using(ackOutbox) }
}

/** Two clients of one server: whatever reaches the server shows up on both. */
function sharedServer(state) {
  const server = upload(state)
  const clouds = [new FakeCloud(server), new FakeCloud(server)]
  for (const [cloud, other] of [clouds, [...clouds].reverse()]) {
    const ack = cloud.ack.bind(cloud)
    cloud.ack = () => {
      ack()
      other.emit()
    }
  }
  return { server, clouds }
}

function strays(server) {
  const found = []
  const seen = new Set()
  for (const [id, data] of server) {
    if (!MONTH_DOC.test(id)) continue
    for (const [txnId, txn] of Object.entries(data.items)) {
      if (txn.date.slice(0, 7) !== id || seen.has(txnId)) found.push(`${id}/${txnId}`)
      seen.add(txnId)
    }
  }
  return found
}

async function playTwoDevices(seed) {
  const rand = mulberry32(seed)
  const pick = (list) => list[Math.floor(rand() * list.length)]
  const state = book()
  const { server, clouds } = sharedServer(state)
  const devices = clouds.map((cloud) => device({ state, cloud, outbox: ownOutbox() }))
  for (const dev of devices) dev.engine.start()
  await settle()

  let n = 0
  const dates = ['2026-08-03', '2026-09-14', '2026-10-21', '2026-11-02', '2026-12-01']
  const edits = [
    (dev) => {
      const txn = pick(dev.state.transactions)
      return txn && { type: 'txn/update', txn: { ...txn, note: `note ${(n += 1)}` } }
    },
    (dev) => {
      const txn = pick(dev.state.transactions)
      return txn && { type: 'txn/update', txn: { ...txn, date: pick(dates) } }
    },
    () => {
      n += 1
      return {
        type: 'txn/add',
        txn: { id: `fz${seed}_${n}`, type: 'expense', amount: n, date: pick(dates), category: 'food', createdAt: 2e12 + n },
      }
    },
    (dev) => {
      const txn = pick(dev.state.transactions)
      return txn && { type: 'txn/delete', id: txn.id }
    },
    () => ({ type: 'budget/set', id: pick(['food', 'fuel', 'books']), amount: rand() < 0.3 ? 0 : 100 + (n += 1) }),
    (dev) => {
      const account = pick(dev.state.accounts)
      return account && { type: 'account/update', account: { ...account, name: `Account ${(n += 1)}` } }
    },
    () => ({ type: 'account/add', account: { id: `acc_fz${seed}_${(n += 1)}`, name: 'Wallet', kind: 'cash' } }),
    () => ({ type: 'person/add', person: { id: `p_fz${seed}_${(n += 1)}`, name: `Friend ${n}` } }),
    () => ({ type: 'settings/update', patch: { name: `Asha ${(n += 1)}` } }),
  ]

  for (let step = 0; step < 250; step += 1) {
    const dev = pick(devices)
    const { cloud } = dev
    const roll = rand()
    if (roll < 0.4) {
      const action = pick(edits)(dev)
      if (action) dev.edit(action)
    } else if (roll < 0.6) dev.timers.tick(Math.floor(rand() * 900))
    else if (roll < 0.75) {
      if (cloud.online && cloud.waiting) cloud.ack()
    } else if (roll < 0.8) {
      if (cloud.online && cloud.waiting) cloud.fail('unavailable')
    } else if (roll < 0.87) {
      if (cloud.online) cloud.goOffline()
      else cloud.goOnline()
    } else if (roll < 0.9) {
      if (cloud.online && cloud.listener) cloud.breakListener('unavailable')
    }
    if (rand() < 0.6) await settle()
  }

  for (let round = 0; round < 40; round += 1) {
    for (const { cloud } of devices) if (!cloud.online) cloud.goOnline()
    await settle()
    for (const dev of devices) dev.timers.tick(600_000)
    await settle()
    for (const { cloud } of devices) {
      while (cloud.waiting) {
        cloud.ack()
        await settle()
      }
    }
    await settle()
    if (devices.every((dev) => !dev.engine.hasPending() && !dev.cloud.waiting && status(dev) === 'synced')) break
  }

  const inCloud = readBook(server)
  for (const [index, dev] of devices.entries()) {
    const label = `seed ${seed}, device ${index}`
    assert.equal(status(dev), 'synced', label)
    assert.deepEqual(comparable(dev.state), comparable(inCloud.state), label)
    // Both sides really wrote and really took in the other's edits.
    assert.ok(dev.cloud.commits.length > 0 && dev.applied > 0, label)
  }
  assert.deepEqual(strays(server), [], `seed ${seed}`)
}

test('two devices editing at once, through dropped writes and lost connections, end up with the same book as the cloud', async () => {
  for (let seed = 1; seed <= 12; seed += 1) await playTwoDevices(seed)
})
