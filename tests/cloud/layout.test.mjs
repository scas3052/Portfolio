import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  changedKeys,
  chunkOps,
  esc,
  mergeRemote,
  pushOps,
  readBook,
  txnMonths,
  unesc,
  uploadOps,
} from '../../src/finance/cloud/layout.js'
import { buildSample } from '../../src/finance/lib/sample.js'
import { SCHEMA_VERSION } from '../../src/finance/lib/schema.js'
import { reducer } from '../../src/finance/store/reducer.js'
import { TODAY } from '../helpers/ctx.mjs'
import { applyOps } from '../helpers/cloud.mjs'

/** The sample book as a real user's: named, PIN-locked and with amounts hidden on this device. */
function book() {
  const state = buildSample(TODAY)
  return {
    ...state,
    settings: { ...state.settings, name: 'Asha', privacy: true, pinHash: 'hash', onboarded: true },
    meta: { sample: false },
  }
}

// What the cloud should hand back: privacy stays on the device, entries come sorted by creation.
function expected(state) {
  const transactions = [...state.transactions].sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1))
  return { ...state, settings: { ...state.settings, privacy: false }, transactions }
}

const upload = (state) => applyOps(new Map(), uploadOps(state))
const stored = (item) => Object.fromEntries(Object.entries(item).filter(([key]) => key !== 'id'))

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

test('a whole book makes the round trip through the cloud, apart from the privacy switch', () => {
  const state = book()
  const docs = upload(state)

  const months = [...new Set(state.transactions.map((t) => t.date.slice(0, 7)))].sort()
  assert.deepEqual([...docs.keys()].filter((id) => id !== 'core').sort(), months)
  assert.equal(docs.get('core').version, SCHEMA_VERSION)
  assert.deepEqual(docs.get('core').settings, { name: 'Asha', pinHash: 'hash', onboarded: true })

  const back = readBook(docs)
  assert.equal(back.status, 'ok')
  assert.deepEqual(back.state, expected(state))
})

test('an upload writes the months first, empties months left over from before, and the core last', () => {
  const state = book()
  const ops = uploadOps(state, ['2019-01', 'core', '2026-11'])

  assert.ok(ops.every((op) => op.type === 'replace'))
  assert.equal(ops.at(-1).doc, 'core')
  assert.deepEqual(
    ops.find((op) => op.doc === '2019-01'),
    { type: 'replace', doc: '2019-01', data: { items: {} } },
  )
  assert.equal(ops.filter((op) => op.doc === '2026-11').length, 1)
})

test('names Firestore would reject are escaped on the way up and restored on the way down', () => {
  for (const name of ['', '~', '~x', '__x__', '____']) assert.notEqual(esc(name), name)
  for (const name of ['', '~', '~x', '__x__', 'a.b', 'with space', '__x', 'x__', 'food']) assert.equal(unesc(esc(name)), name)
  assert.equal(esc('food'), 'food')

  const state = book()
  state.accounts = [...state.accounts, { ...state.accounts[0], id: '__odd__', name: 'Odd' }]
  state.budgets = { ...state.budgets, '~misc': 500, 'a.b': 100 }
  state.transactions = [...state.transactions, { ...state.transactions[0], id: '~t.1', createdAt: 9e12 }]
  const docs = upload(state)

  assert.ok(Object.hasOwn(docs.get('core').accounts, '~__odd__'))
  assert.ok(Object.hasOwn(docs.get('core').budgets, '~~misc'))
  assert.deepEqual(readBook(docs).state, expected(state))
})

test('changedKeys lists exactly the synced values an action touched', () => {
  const state = book()
  const [txn] = state.transactions
  const keysAfter = (action) => changedKeys(state, reducer(state, action)).sort()

  assert.deepEqual(changedKeys(state, state), [])
  assert.deepEqual(keysAfter({ type: 'txn/update', txn: { ...txn, amount: txn.amount + 1 } }), [`txn:${txn.id}`])
  assert.deepEqual(keysAfter({ type: 'txn/update', txn }), [])
  assert.deepEqual(keysAfter({ type: 'txn/delete', id: txn.id }), [`txn:${txn.id}`])
  assert.deepEqual(keysAfter({ type: 'settings/update', patch: { privacy: false } }), [])
  assert.deepEqual(keysAfter({ type: 'settings/update', patch: { name: 'Ravi', pinHash: null } }), [
    'settings:name',
    'settings:pinHash',
  ])
  assert.deepEqual(keysAfter({ type: 'budget/set', id: 'brand-new', amount: 300 }), ['budget:brand-new'])

  const budget = Object.keys(state.budgets)[0]
  assert.ok(budget)
  assert.deepEqual(keysAfter({ type: 'budget/set', id: budget, amount: 0 }), [`budget:${budget}`])

  const account = state.accounts[0]
  const touched = [
    `account:${account.id}`,
    ...state.transactions.filter((t) => t.accountId === account.id || t.toAccountId === account.id).map((t) => `txn:${t.id}`),
    ...state.loans.filter((loan) => loan.accountId === account.id).map((loan) => `loan:${loan.id}`),
  ].sort()
  assert.ok(touched.length > 1)
  assert.deepEqual(keysAfter({ type: 'account/delete', id: account.id }), touched)

  const fresh = reducer(state, { type: 'data/clear' })
  assert.ok(changedKeys(fresh, reducer(fresh, { type: 'onboard/sample', today: TODAY })).includes('meta:sample'))
})

test('txnMonths remembers which month each transaction sat in', () => {
  const state = book()
  const [a, b] = state.transactions
  const months = txnMonths(state, [`txn:${a.id}`, `txn:${b.id}`, 'txn:gone', 'budget:food'])
  assert.deepEqual([...months], [
    [`txn:${a.id}`, a.date.slice(0, 7)],
    [`txn:${b.id}`, b.date.slice(0, 7)],
  ])
  assert.equal(txnMonths(state, ['settings:name']).size, 0)
})

test('moving an entry to another month writes it there and deletes it from the old month', () => {
  const state = book()
  const docs = upload(state)
  const remote = readBook(docs)
  const txn = state.transactions.find((t) => t.date.startsWith('2026-11'))
  const next = reducer(state, { type: 'txn/update', txn: { ...txn, date: '2026-10-05', note: 'moved' } })
  const key = `txn:${txn.id}`

  const { ops, placed } = pushOps([key], next, { loc: remote.loc, pos: remote.pos })
  assert.deepEqual(ops, [
    { type: 'merge', doc: '2026-10', fields: [{ path: ['items', txn.id], value: stored(next.transactions.find((t) => t.id === txn.id)) }] },
    { type: 'merge', doc: '2026-11', fields: [{ path: ['items', txn.id], delete: true }] },
  ])
  assert.equal(placed.get(key), '2026-10')

  applyOps(docs, ops)
  assert.equal(docs.get('2026-11').items[txn.id], undefined)
  assert.deepEqual(readBook(docs).state, expected(next))
})

test('a deleted entry is removed from every month it was seen in', () => {
  const state = book()
  const [txn] = state.transactions
  const key = `txn:${txn.id}`
  const next = reducer(state, { type: 'txn/delete', id: txn.id })
  const loc = new Map([[key, new Set(['2026-01', txn.date.slice(0, 7)])]])

  const { ops, placed } = pushOps([key], next, { loc })
  assert.deepEqual(
    ops.map((op) => [op.doc, op.fields]),
    [...loc.get(key)].map((month) => [month, [{ path: ['items', txn.id], delete: true }]]),
  )
  assert.deepEqual([...placed], [[key, null]])
})

test('new accounts, loans, people and goals are placed after the last stored position', () => {
  const state = book()
  const remote = readBook(upload(state))
  const next = reducer(state, { type: 'person/add', person: { id: 'p_new', name: 'Meera' } })

  const { ops, posUpdates } = pushOps(['person:p_new'], next, { loc: remote.loc, pos: remote.pos })
  assert.deepEqual([...posUpdates], [['person:p_new', state.people.length]])
  assert.deepEqual(ops, [
    { type: 'merge', doc: 'core', fields: [{ path: ['people', 'p_new'], value: { name: 'Meera', pos: state.people.length } }] },
  ])
})

test('settings, budgets and the sample flag are written field by field into the core', () => {
  const state = book()
  const budget = Object.keys(state.budgets)[0]
  let next = reducer(state, { type: 'settings/update', patch: { pinHash: null, name: 'Ravi' } })
  next = reducer(next, { type: 'budget/set', id: budget, amount: 0 })

  assert.deepEqual(pushOps(changedKeys(state, next), next).ops, [
    {
      type: 'merge',
      doc: 'core',
      fields: [
        { path: ['budgets', budget], delete: true },
        { path: ['settings', 'name'], value: 'Ravi' },
        { path: ['settings', 'pinHash'], value: null },
      ],
    },
  ])
  assert.deepEqual(pushOps(['meta:sample'], { ...state, meta: {} }).ops[0].fields, [{ path: ['meta', 'sample'], value: false }])
})

test('any run of edits, pushed key by key, leaves the cloud holding the same book', () => {
  const rand = mulberry32(7)
  const pick = (list) => list[Math.floor(rand() * list.length)]
  const day = (min) => String(min + Math.floor(rand() * 9)).padStart(2, '0')
  const months = ['2026-08', '2026-09', '2026-10', '2026-11', '2026-12']
  let state = book()
  let n = 0
  const actions = [
    () => ({ type: 'txn/add', txn: { ...pick(state.transactions), id: `tx${(n += 1)}`, date: `${pick(months)}-${day(1)}`, createdAt: 2e12 + n } }),
    () => {
      const txn = pick(state.transactions)
      return { type: 'txn/update', txn: { ...txn, date: `${pick(months)}-${day(10)}`, amount: txn.amount + 1 } }
    },
    () => ({ type: 'txn/delete', id: pick(state.transactions)?.id }),
    () => ({ type: 'account/add', account: { id: `ac${(n += 1)}`, name: `Account ${n}`, kind: 'savings', opening: 100 } }),
    () => ({ type: 'account/delete', id: pick(state.accounts)?.id }),
    () => ({ type: 'person/add', person: { id: `pp${(n += 1)}`, name: `Person ${n}` } }),
    () => ({ type: 'person/delete', id: pick(state.people)?.id }),
    () => ({ type: 'goal/contribute', id: pick(state.goals)?.id, amount: 50 }),
    () => ({ type: 'budget/set', id: pick(['food', 'travel', 'shopping', 'odd.one']), amount: rand() < 0.3 ? 0 : 100 + Math.round(rand() * 5000) }),
    () => ({ type: 'settings/update', patch: { name: `Name ${(n += 1)}` } }),
    () => ({ type: 'settings/update', patch: { privacy: rand() < 0.5 } }),
  ]

  const docs = upload(state)
  const { loc, pos } = readBook(docs)
  for (let round = 0; round < 80; round += 1) {
    const before = state
    const count = 1 + Math.floor(rand() * 4)
    for (let i = 0; i < count; i += 1) state = reducer(state, pick(actions)())

    const keys = changedKeys(before, state)
    for (const [key, month] of txnMonths(before, keys)) {
      if (!loc.has(key)) loc.set(key, new Set())
      loc.get(key).add(month)
    }
    const { ops, placed, posUpdates } = pushOps(keys, state, { loc, pos })
    applyOps(docs, ops)
    for (const [key, month] of placed) {
      if (month) loc.set(key, new Set([month]))
      else loc.delete(key)
    }
    for (const [key, value] of posUpdates) pos.set(key, value)

    const read = readBook(docs)
    assert.deepEqual(read.state, expected(state), `after round ${round}`)
    // No stray copies are left behind, and the tracked locations match the cloud.
    assert.deepEqual(loc, read.loc, `after round ${round}`)
    for (const months of read.loc.values()) assert.equal(months.size, 1)
  }
})

test('readBook copes with a missing, newer or messy book', () => {
  assert.deepEqual(readBook(new Map()), { status: 'missing' })
  assert.deepEqual(readBook(new Map([['core', { settings: {} }]])), { status: 'missing' })
  assert.deepEqual(readBook(new Map([['core', { version: SCHEMA_VERSION + 1 }]])), { status: 'newer' })

  const messy = readBook(
    new Map([
      ['core', { version: SCHEMA_VERSION, accounts: 'nope', budgets: { food: 'x', rent: 9000 }, people: { p1: { name: 'A' }, p2: 5 } }],
      ['2026-11', { items: 'nope' }],
      ['notes', { items: { x: { amount: 5 } } }],
    ]),
  )
  assert.equal(messy.status, 'ok')
  assert.deepEqual(messy.state.accounts, [])
  assert.deepEqual(messy.state.budgets, { rent: 9000 })
  assert.deepEqual(messy.state.people, [{ id: 'p1', name: 'A' }])
  assert.deepEqual(messy.state.transactions, [])
})

test('a transaction left in two months is read from the month of its date', () => {
  const txn = {
    type: 'expense',
    amount: 120,
    date: '2026-11-03',
    note: 'right',
    category: 'food',
    accountId: '',
    toAccountId: '',
    personId: '',
    loanId: '',
    createdAt: 1,
  }
  const read = readBook(
    new Map([
      ['core', { version: SCHEMA_VERSION }],
      ['2026-10', { items: { t1: { ...txn, note: 'stale' } } }],
      ['2026-11', { items: { t1: txn, t3: { ...txn, createdAt: 3 } } }],
      ['2026-12', { items: { t2: { ...txn, note: 'only copy', createdAt: 2 }, t3: { ...txn, note: 'stale', createdAt: 3 } } }],
    ]),
  )
  assert.deepEqual(
    read.state.transactions.map((t) => [t.id, t.note]),
    [
      ['t1', 'right'],
      ['t2', 'only copy'],
      ['t3', 'right'],
    ],
  )
  assert.deepEqual(read.loc.get('txn:t1'), new Set(['2026-10', '2026-11']))
  assert.deepEqual(read.loc.get('txn:t2'), new Set(['2026-12']))
  assert.deepEqual(read.loc.get('txn:t3'), new Set(['2026-11', '2026-12']))
})

test('mergeRemote follows the cloud, except for keys still on their way up', () => {
  const state = book()
  const same = readBook(upload(state))
  assert.equal(mergeRemote(state, same, new Set(), same.pos), state)

  const [account] = state.accounts
  const [t1, , t3] = state.transactions
  const added = { ...t1, id: 't_new', note: 'from phone', createdAt: t1.createdAt + 1 }
  let theirs = reducer(state, { type: 'account/update', account: { ...account, name: 'Renamed' } })
  theirs = reducer(theirs, { type: 'txn/delete', id: t1.id })
  theirs = reducer(theirs, { type: 'txn/add', txn: added })
  theirs = reducer(theirs, { type: 'txn/update', txn: { ...t3, note: 'their note' } })
  const remote = readBook(upload(theirs))

  let mine = reducer(state, { type: 'txn/update', txn: { ...t3, note: 'my note' } })
  mine = reducer(mine, { type: 'person/add', person: { id: 'p_local', name: 'Local' } })
  const merged = mergeRemote(mine, remote, new Set([`txn:${t3.id}`, 'person:p_local']), remote.pos)

  assert.equal(merged.accounts.find((a) => a.id === account.id).name, 'Renamed')
  assert.equal(merged.transactions.some((t) => t.id === t1.id), false)
  assert.equal(merged.transactions.find((t) => t.id === 't_new').note, 'from phone')
  assert.equal(merged.transactions.find((t) => t.id === t3.id).note, 'my note')
  assert.equal(merged.people.at(-1).id, 'p_local')
  assert.equal(merged.settings, mine.settings)
  assert.equal(merged.goals, mine.goals)
  assert.equal(merged.settings.privacy, true)
})

test('mergeRemote orders accounts, loans, people and goals by their stored position', () => {
  const state = book()
  const [a, b] = state.accounts
  const docs = upload(state)
  const core = docs.get('core')
  core.accounts[a.id] = { ...core.accounts[a.id], name: 'Moved last', pos: 99 }
  core.accounts[b.id].pos = -1
  const remote = readBook(docs)

  const merged = mergeRemote(state, remote, new Set(), remote.pos)
  const order = [b, ...state.accounts.filter((x) => x !== a && x !== b), a].map((x) => x.id)
  assert.deepEqual(merged.accounts.map((x) => x.id), order)
  assert.deepEqual(remote.state.accounts.map((x) => x.id), order)
  assert.equal(merged.accounts.at(-1).name, 'Moved last')
  assert.equal(merged.loans, state.loans)
})

test('chunkOps splits writes into batches Firestore accepts, keeping their order', () => {
  const ops = Array.from({ length: 5 }, (_, i) => ({ type: 'replace', doc: `d${i}`, data: { n: i } }))
  const docsOf = (chunks) => chunks.map((chunk) => chunk.map((op) => op.doc))

  assert.deepEqual(docsOf(chunkOps(ops, { maxOps: 2 })), [['d0', 'd1'], ['d2', 'd3'], ['d4']])
  assert.deepEqual(chunkOps(ops, { maxChars: JSON.stringify(ops[0]).length * 2 }).map((chunk) => chunk.length), [2, 2, 1])
  assert.deepEqual(chunkOps(ops, { maxChars: 1 }).map((chunk) => chunk.length), [1, 1, 1, 1, 1])
  assert.deepEqual(chunkOps(ops), [ops])
  assert.deepEqual(chunkOps([]), [])
})
