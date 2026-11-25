// The weekly balance check: which accounts are due, what unfiled spends explain, and the adjusting entry.
import { afterEach, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  adjustmentEntry,
  balanceGap,
  cleanChecks,
  dueChecks,
  pendingFor,
  readChecks,
  resetChecksCache,
  updateChecks,
  withCheck,
} from '../../src/finance/inbox/balance.js'
import { installWindow } from '../helpers/ctx.mjs'

const ACCOUNTS = [
  { id: 'a1', name: 'slice savings', kind: 'savings' },
  { id: 'a2', name: 'HDFC', kind: 'savings' },
  { id: 'a3', name: 'Cash', kind: 'cash' },
]

let restore
beforeEach(() => {
  restore = installWindow()
  resetChecksCache()
})
afterEach(() => {
  restore?.()
  resetChecksCache()
})

test('stored settings are cleaned: bad weekdays, duplicate ids and broken checks are dropped', () => {
  const clean = cleanChecks({
    enabled: 1,
    weekday: 9,
    accounts: ['a1', 'a1', 3, ''],
    last: { a1: { date: '2026-11-20', actual: 100.456, book: 90 }, a2: { date: 'yesterday', actual: 1, book: 1 } },
  })
  assert.deepEqual(clean, { enabled: true, weekday: 0, accounts: ['a1'], last: { a1: { date: '2026-11-20', actual: 100.46, book: 90 } } })
})

test('accounts are due when switched on and unchecked for a week; cash never is', () => {
  const checks = { enabled: true, weekday: 0, accounts: ['a1', 'a2', 'a3'], last: { a2: { date: '2026-11-20', actual: 0, book: 0 } } }
  assert.deepEqual(
    dueChecks(checks, ACCOUNTS, '2026-11-25').map((a) => a.id),
    ['a1'],
  )
  assert.deepEqual(
    dueChecks(checks, ACCOUNTS, '2026-11-27').map((a) => a.id),
    ['a1', 'a2'],
  )
  assert.deepEqual(dueChecks({ ...checks, enabled: false }, ACCOUNTS, '2026-11-27'), [])
})

test('unfiled spends on the account explain part of the gap', () => {
  const spends = [
    { id: 's1', status: 'unfiled', direction: 'out', amountPaise: 50000 },
    { id: 's2', status: 'unfiled', direction: 'in', amountPaise: 10000 },
    { id: 's3', status: 'filed', direction: 'out', amountPaise: 99900 },
    { id: 's4', status: 'unfiled', direction: 'out', amountPaise: 7000 },
  ]
  const accountOf = (spend) => (spend.id === 's4' ? { id: 'a2' } : { id: 'a1' })
  const pending = pendingFor('a1', spends, accountOf)
  assert.equal(pending, -400)
  assert.deepEqual(balanceGap({ actual: 8360, book: 10000, pending }), { gap: -1640, pending: -400, unexplained: -1240, square: false })
  assert.equal(balanceGap({ actual: 9600.4, book: 10000, pending }).square, true)
})

test('the adjusting entry is an expense for missing money and income for extra money', () => {
  assert.deepEqual(adjustmentEntry({ id: 'a1' }, -1240, '2026-11-25'), {
    type: 'expense',
    amount: 1240,
    date: '2026-11-25',
    category: 'other',
    note: 'Unaccounted (balance check)',
    accountId: 'a1',
  })
  assert.equal(adjustmentEntry({ id: 'a1' }, 300, '2026-11-25').category, 'other_in')
  assert.equal(adjustmentEntry({ id: 'a1' }, 0, '2026-11-25'), null)
})

test('checks are stored on this device and read back', () => {
  updateChecks((c) => withCheck({ ...c, enabled: true, accounts: ['a1'] }, 'a1', { date: '2026-11-25', actual: 8360, book: 10000 }))
  resetChecksCache()
  assert.deepEqual(readChecks(), {
    enabled: true,
    weekday: 0,
    accounts: ['a1'],
    last: { a1: { date: '2026-11-25', actual: 8360, book: 10000 } },
  })
})
