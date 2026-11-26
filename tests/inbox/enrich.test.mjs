// Smart help for captured payments: account matching, suggestions, duplicates, transfers and learned rules.
import { afterEach, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { findTwin, matchAccount, normalizeSpend, pairTransfers, sameBank, spendDate, suggest, toPrefill } from '../../src/finance/inbox/enrich.js'
import {
  merchantKey,
  payeeName,
  readRules,
  resetRulesCache,
  ruleFor,
  ruleFromEntry,
  updateRules,
  withAlias,
  withoutRule,
  withRule,
} from '../../src/finance/inbox/rules.js'
import { installWindow, makeCtx } from '../helpers/ctx.mjs'

const AT = new Date(2026, 10, 10, 13, 5).getTime()
const EMPTY = { rules: {}, aliases: {} }

export function spend(fields = {}) {
  return normalizeSpend({ id: 'sp_1', status: 'unfiled', amountPaise: 50000, direction: 'out', at: AT, sources: ['sms'], ...fields })
}

let restore
beforeEach(() => {
  restore = installWindow()
  resetRulesCache()
})
afterEach(() => restore())

test('accounts match by their last digits, then by a remembered alias', () => {
  const { state } = makeCtx()
  assert.equal(matchAccount(spend({ account: '4821', bank: 'HDFC Bank' }), state.accounts).account.id, 'sa_hdfc')
  assert.equal(matchAccount(spend({ account: '0937', bank: 'SBI' }), state.accounts).how, 'digits')
  assert.equal(matchAccount(spend({ account: '9999' }), state.accounts).account, null)
  const aliased = matchAccount(spend({ account: '9999' }), state.accounts, { 9999: 'sa_sbi' })
  assert.deepEqual([aliased.account.id, aliased.how], ['sa_sbi', 'alias'])
})

test('the account picked in Gullak (a statement import) wins over digits and aliases', () => {
  const { state } = makeCtx()
  const chosen = matchAccount(spend({ accountId: 'sa_sbi', account: '4821' }), state.accounts, { 4821: 'sa_hdfc' })
  assert.deepEqual([chosen.account.id, chosen.how], ['sa_sbi', 'chosen'])
  assert.equal(matchAccount(spend({ accountId: 'gone', account: '4821' }), state.accounts).account.id, 'sa_hdfc')
  assert.equal(spend({ accountId: '  ' }).accountId, null)
})

test('a card spend without digits goes to the one card of that bank', () => {
  const { state } = makeCtx()
  assert.equal(matchAccount(spend({ bank: 'ICICI Bank', channel: 'card' }), state.accounts).account.id, 'sa_icici')
  assert.equal(matchAccount(spend({ bank: 'ICICI Bank', channel: 'upi' }), state.accounts).account, null)
})

test('bank names match the way messages and accounts write them', () => {
  assert.equal(sameBank('SBI', 'State Bank of India'), true)
  assert.equal(sameBank('HDFC Bank', 'HDFC'), true)
  assert.equal(sameBank('Bank of Baroda', 'BOB'), true)
  assert.equal(sameBank('HDFC Bank', 'ICICI Bank'), false)
  assert.equal(sameBank('', 'ICICI Bank'), false)
})

test('suggestions: a learned rule wins, then the payee and the reply note against the keyword list', () => {
  const { state } = makeCtx()
  const swiggy = spend({ party: 'SWIGGY', account: '4821' })
  const plain = suggest(swiggy, { book: EMPTY, accounts: state.accounts })
  assert.deepEqual(plain, { type: 'expense', category: 'food', note: 'Swiggy', accountId: 'sa_hdfc', ruled: false })

  const book = withRule(EMPTY, 'swiggy', { type: 'expense', category: 'groceries', note: 'Instamart', label: 'Swiggy' })
  const ruled = suggest(swiggy, { book, accounts: state.accounts })
  assert.deepEqual([ruled.category, ruled.note, ruled.ruled], ['groceries', 'Instamart', true])

  const noted = suggest(spend({ vpa: 'ramesh.k@okaxis', hint: 'groceries from the corner shop' }), { book: EMPTY, accounts: state.accounts })
  assert.deepEqual([noted.category, noted.note], ['groceries', 'groceries from the corner shop'])

  const income = suggest(spend({ direction: 'in', party: 'ACME CORP SALARY NOV' }), { book: EMPTY, accounts: state.accounts })
  assert.deepEqual([income.type, income.category], ['income', 'salary'])
})

test('a prefill carries the amount, local date, account and note', () => {
  const s = spend({ amountPaise: 123450, party: 'Uber', account: '4821' })
  const { state } = makeCtx()
  const prefill = toPrefill(s, suggest(s, { book: EMPTY, accounts: state.accounts }))
  assert.deepEqual(prefill, { type: 'expense', amount: 1234.5, date: '2026-11-10', note: 'Uber', category: 'transport', accountId: 'sa_hdfc' })
  assert.equal(spendDate(s), '2026-11-10')
})

test('an entry already in the book is found: same amount, a day apart at most, same direction and account', () => {
  const ctx = makeCtx()
  const lunch = { id: 't_lunch', type: 'expense', amount: 500, date: '2026-11-09', note: 'Lunch', category: 'food', accountId: 'sa_hdfc', toAccountId: '', personId: '', loanId: '', createdAt: 1 }
  const txns = [...ctx.state.transactions, lunch]
  assert.equal(findTwin(spend(), txns, 'sa_hdfc')?.id, 't_lunch')
  assert.equal(findTwin(spend(), txns, 'sa_sbi'), null)
  assert.equal(findTwin(spend({ direction: 'in' }), [lunch], ''), null)
  assert.equal(findTwin(spend({ at: new Date(2026, 10, 13).getTime() }), [lunch], ''), null)
  assert.equal(findTwin(spend(), [lunch], '', new Set(['t_lunch'])), null)
})

test('a debit and a credit of the same amount between own accounts pair up as one transfer', () => {
  const { state } = makeCtx()
  const out = spend({ id: 'a', amountPaise: 500000, account: '4821' })
  const into = spend({ id: 'b', direction: 'in', amountPaise: 500000, account: '0937', at: AT + 60_000 })
  const other = spend({ id: 'c', direction: 'in', amountPaise: 500000, account: '4821' })
  const pairs = pairTransfers([out, into, other], state.accounts)
  assert.equal(pairs.length, 1)
  assert.deepEqual([pairs[0].from.id, pairs[0].to.id, pairs[0].fromAccount.id, pairs[0].toAccount.id], ['a', 'b', 'sa_hdfc', 'sa_sbi'])
})

test('payee keys and names read the same however the payee was written', () => {
  assert.equal(merchantKey({ party: 'SWIGGY' }), 'swiggy')
  assert.equal(merchantKey({ vpa: 'swiggy@icici' }), 'swiggy')
  assert.equal(merchantKey({ party: 'Blue Tokai Coffee Pvt Ltd' }), 'blue tokai coffee')
  assert.equal(payeeName({ party: 'RENT HOUSE OWNER' }), 'Rent House Owner')
  assert.equal(payeeName({ vpa: 'chai.stall@ybl' }), 'Chai Stall')
  assert.equal(payeeName({ party: 'ATM S1', channel: 'atm' }), 'ATM')
})

test('rules: filing teaches the category, Undo can remove it, and they persist on this device only', () => {
  const s = spend({ party: 'SWIGGY' })
  const rule = ruleFromEntry({ type: 'expense', category: 'food', note: 'Dinner' }, s)
  assert.deepEqual(rule, { type: 'expense', category: 'food', note: 'Dinner', label: 'Swiggy' })
  assert.equal(ruleFromEntry({ type: 'lend', amount: 5 }, s), null)
  // The answer to "what was it for?" belongs to that one payment: the category is learned, the note isn't.
  const answered = { ...s, hint: 'dinner with Ravi' }
  assert.deepEqual(ruleFromEntry({ type: 'expense', category: 'food', note: 'dinner with Ravi' }, answered), {
    type: 'expense',
    category: 'food',
    note: '',
    label: 'Swiggy',
  })

  updateRules((book) => withRule(book, merchantKey(s), rule))
  updateRules((book) => withAlias(book, '9999', 'sa_sbi'))
  resetRulesCache()
  const stored = readRules()
  assert.equal(ruleFor(stored, s).category, 'food')
  assert.equal(stored.aliases['9999'], 'sa_sbi')
  assert.equal(JSON.parse(window.localStorage.getItem('gullak:inbox:rules')).rules.swiggy.uses, 1)

  const gone = withoutRule(stored, 'swiggy')
  assert.equal(ruleFor(gone, s), null)
})

test('spends from the plugin are normalised; bad ones are dropped', () => {
  assert.equal(normalizeSpend({ id: 'x', amountPaise: 0 }), null)
  assert.equal(normalizeSpend(null), null)
  const s = normalizeSpend({ id: 'x', amountPaise: 1050, direction: 'sideways', sources: ['sms', 3], balancePaise: 5000, hint: '  ' })
  assert.deepEqual([s.direction, s.sources, s.balance, s.hint, s.status], ['out', ['sms'], 50, null, 'unfiled'])
})
