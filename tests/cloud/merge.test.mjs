import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readBook, uploadOps } from '../../src/finance/cloud/layout.js'
import { decideLink, hasUserData, mergeBooks } from '../../src/finance/cloud/merge.js'
import { buildSample } from '../../src/finance/lib/sample.js'
import { emptyState } from '../../src/finance/lib/schema.js'
import { reducer } from '../../src/finance/store/reducer.js'
import { TODAY } from '../helpers/ctx.mjs'
import { applyOps } from '../helpers/cloud.mjs'

const sample = () => buildSample(TODAY)
const fresh = () => reducer(emptyState(), { type: 'onboard/fresh', name: 'Asha' })
const mine = () => ({ ...sample(), meta: { sample: false } })
const inCloud = (state) => readBook(applyOps(new Map(), uploadOps(state)))

test('only a book the user made counts as their data', () => {
  assert.equal(hasUserData(emptyState()), false)
  assert.equal(hasUserData(fresh()), false)
  assert.equal(hasUserData(sample()), false)
  assert.equal(hasUserData(mine()), true)
  assert.equal(hasUserData(reducer(fresh(), { type: 'budget/set', id: 'food', amount: 500 })), true)
  assert.equal(hasUserData(reducer(fresh(), { type: 'person/add', person: { id: 'p1', name: 'Ravi' } })), true)
  // A book that never finished onboarding has nothing worth keeping.
  assert.equal(hasUserData({ ...mine(), settings: { ...mine().settings, onboarded: false } }), false)
})

test('the first link keeps whichever side has data, and asks when both do', () => {
  const missing = { status: 'missing' }
  assert.equal(decideLink(mine(), missing), 'upload')
  assert.equal(decideLink(emptyState(), missing), 'upload')
  assert.equal(decideLink(mine(), { status: 'newer' }), 'newer')
  assert.equal(decideLink(emptyState(), { status: 'newer' }), 'newer')

  assert.equal(decideLink(mine(), inCloud(mine())), 'ask')
  assert.equal(decideLink(mine(), inCloud(sample())), 'upload')
  assert.equal(decideLink(mine(), inCloud(fresh())), 'upload')
  assert.equal(decideLink(emptyState(), inCloud(mine())), 'adopt')
  assert.equal(decideLink(sample(), inCloud(mine())), 'adopt')
  assert.equal(decideLink(fresh(), inCloud(fresh())), 'adopt')
  assert.equal(decideLink(emptyState(), inCloud(emptyState())), 'upload')
})

test('merging keeps everything from both books and prefers the cloud where they overlap', () => {
  const base = mine()
  const [shared] = base.transactions
  const [account] = base.accounts

  let local = { ...base, settings: { ...base.settings, name: '', privacy: true, pinHash: 'local-pin' } }
  local = reducer(local, { type: 'txn/add', txn: { ...shared, id: 'only-here', createdAt: 1 } })
  local = reducer(local, { type: 'txn/update', txn: { ...shared, note: 'local note' } })
  local = reducer(local, { type: 'budget/set', id: 'food', amount: 1 })
  local = reducer(local, { type: 'budget/set', id: 'pets', amount: 900 })

  let remote = { ...base, settings: { ...base.settings, name: 'Asha', privacy: false, pinHash: null } }
  remote = reducer(remote, { type: 'txn/add', txn: { ...shared, id: 'only-there', createdAt: 2 } })
  remote = reducer(remote, { type: 'txn/update', txn: { ...shared, note: 'cloud note' } })
  remote = reducer(remote, { type: 'account/update', account: { ...account, name: 'Cloud name' } })
  remote = reducer(remote, { type: 'budget/set', id: 'food', amount: 2 })

  const merged = mergeBooks(local, remote)
  const ids = new Set(merged.transactions.map((t) => t.id))
  assert.equal(merged.transactions.length, base.transactions.length + 2)
  assert.ok(ids.has('only-here') && ids.has('only-there'))
  assert.equal(merged.transactions.find((t) => t.id === shared.id).note, 'cloud note')
  assert.equal(merged.accounts.find((a) => a.id === account.id).name, 'Cloud name')
  assert.equal(merged.accounts.length, base.accounts.length)
  assert.equal(merged.budgets.food, 2)
  assert.equal(merged.budgets.pets, 900)
  assert.deepEqual(merged.settings, { name: 'Asha', privacy: true, pinHash: 'local-pin', onboarded: true })
  assert.deepEqual(merged.meta, { sample: false })

  const named = mergeBooks({ ...local, settings: { ...local.settings, name: 'Device' } }, { ...remote, settings: { ...remote.settings, name: '', pinHash: 'cloud-pin' } })
  assert.equal(named.settings.name, 'Device')
  assert.equal(named.settings.pinHash, 'cloud-pin')
})
