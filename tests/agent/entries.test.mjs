import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildEntry, draftEntries, makeDraft, proposal, MAX_ENTRIES } from '../../src/finance/agent/entries.js'
import { makeCtx, TODAY } from '../helpers/ctx.mjs'

const build = (raw, ctx = makeCtx()) => buildEntry(raw, ctx)

test('buildEntry rejects unknown types and fills sensible defaults', () => {
  assert.match(build({ type: 'gift', amount: 5 }).error, /^type must be one of expense, income, transfer/)

  const lunch = build({ type: 'expense', amount: 250, category: 'food', note: 'lunch' })
  assert.deepEqual(lunch.data, {
    type: 'expense',
    amount: 250,
    date: TODAY,
    note: 'lunch',
    category: 'food',
    accountId: 'sa_icici',
    toAccountId: '',
    personId: '',
    personName: '',
    loanId: '',
  })
  assert.deepEqual(lunch.warnings, [])
  assert.deepEqual(lunch.needs, [])
})

test('buildEntry flags missing or implausible amounts instead of guessing', () => {
  assert.deepEqual(build({ type: 'expense', category: 'food' }).needs, ['Amount missing'])
  assert.ok(build({ type: 'expense', amount: 2e9, category: 'food' }).needs.includes('Amount looks too large'))
})

test('buildEntry files unknown categories under Other and says so', () => {
  const entry = build({ type: 'expense', amount: 100, category: 'spaceships' })
  assert.equal(entry.data.category, 'other')
  assert.deepEqual(entry.warnings, ['Unknown category “spaceships”; filed under Other'])
})

test('buildEntry warns about budgets, overdrafts and future dates', () => {
  const big = build({ type: 'expense', amount: 60000, category: 'shopping', account: 'hdfc' })
  assert.equal(big.data.accountId, 'sa_hdfc')
  assert.deepEqual(big.warnings, [
    'Crosses your Shopping budget by ₹59,765',
    'HDFC Salary would go below zero (balance ₹51,457)',
  ])

  // Credit cards are allowed to go negative.
  assert.deepEqual(build({ type: 'expense', amount: 300, category: 'groceries', account: 'credit card' }).warnings, [])
  assert.deepEqual(build({ type: 'expense', amount: 100, category: 'food', date: '2027-01-05' }).warnings, ['Dated in the future'])
})

test('buildEntry falls back to the usual account when the named one is unknown', () => {
  const entry = build({ type: 'expense', amount: 100, category: 'food', account: 'kotak' })
  assert.equal(entry.data.accountId, 'sa_icici')
  assert.deepEqual(entry.warnings, ['No account matches “kotak”; used Amazon Pay ICICI'])
})

test('buildEntry leaves the account unlinked when no account of the user was used', () => {
  const entry = build({ type: 'borrow', amount: 300, person: 'Ravi', account: 'none', note: 'Paid for lunch' })
  assert.equal(entry.data.accountId, '')
  assert.deepEqual(entry.warnings, [])
  assert.deepEqual(entry.needs, [])
})

test('buildEntry checks people and what they owe', () => {
  assert.deepEqual(build({ type: 'lend', amount: 100 }).needs, ['Who was it with?'])
  assert.deepEqual(build({ type: 'borrow', amount: 100, person: 'my friend' }).needs, ['Who was it? Tell me their name.'])

  const kiran = build({ type: 'collect', amount: 100, person: 'kiran' })
  assert.equal(kiran.data.personId, 'sp_kiran')
  assert.deepEqual(kiran.warnings, ['Kiran doesn’t owe you anything'])

  assert.deepEqual(build({ type: 'repay', amount: 5000, person: 'sneha' }).warnings, ['You only owe Sneha ₹1,200'])

  const ravi = build({ type: 'collect', person: 'Ravi' })
  assert.equal(ravi.data.amount, 1500)
  assert.deepEqual(ravi.needs, [])
})

test('buildEntry links EMIs to loans and checks the month and amount', () => {
  assert.deepEqual(build({ type: 'emi', loan: 'car' }).needs, ['No loan called “car”; pick one', 'Amount missing'])

  const repeat = build({ type: 'emi', loan: 'bike', amount: 4250 })
  assert.equal(repeat.data.loanId, 'sl_bike')
  assert.ok(repeat.warnings.includes('Bike loan EMI already logged for November 2026'), repeat.warnings.join(' | '))

  const odd = build({ type: 'emi', loan: 'bike', amount: 5000, date: '2026-12-05' })
  assert.deepEqual(odd.warnings, ['Dated in the future', 'EMI is usually ₹4,250'])
})

test('buildEntry needs two different accounts for a transfer', () => {
  const same = build({ type: 'transfer', amount: 100, account: 'hdfc', toAccount: 'hdfc' })
  assert.deepEqual(same.needs, ['Pick two different accounts'])

  const ok = build({ type: 'transfer', amount: 5000, account: 'hdfc', toAccount: 'sbi' })
  assert.equal(ok.data.toAccountId, 'sa_sbi')
  assert.deepEqual(ok.needs, [])
})

test('draftEntries lets drafts in one reply see each other', () => {
  const ctx = makeCtx()
  const budget = draftEntries(
    [
      { type: 'expense', amount: 3000, category: 'groceries' },
      { type: 'expense', amount: 3000, category: 'groceries' },
    ],
    ctx,
  )
  assert.deepEqual(budget.drafts.map((d) => d.warnings), [[], ['Crosses your Groceries budget by ₹1,694']])

  const priya = draftEntries([{ type: 'lend', amount: 100, person: 'priya' }, { type: 'collect', person: 'Priya' }], ctx)
  assert.deepEqual(
    priya.drafts.map((d) => [d.data.type, d.data.amount, d.data.personName]),
    [
      ['lend', 100, 'Priya'],
      ['collect', 100, 'Priya'],
    ],
  )
  assert.ok(priya.drafts[1].warnings.includes('Amount set to the full ₹100 Priya owes you'))

  const emis = draftEntries(
    [
      { type: 'emi', loan: 'bike', amount: 4250, date: '2026-12-05' },
      { type: 'emi', loan: 'bike', amount: 4250, date: '2026-12-06' },
    ],
    ctx,
  )
  assert.ok(!emis.drafts[0].warnings.some((w) => w.includes('already logged')))
  assert.ok(emis.drafts[1].warnings.includes('Bike loan EMI already logged for December 2026'), emis.drafts[1].warnings.join(' | '))

  // Nothing was written while drafting.
  assert.deepEqual(ctx.actions, [])
})

test('draftEntries caps the batch and reports bad entries by position', () => {
  const ctx = makeCtx()
  const many = Array.from({ length: MAX_ENTRIES + 2 }, (_, i) => ({ type: 'expense', amount: 10 + i, category: 'food' }))
  const capped = draftEntries(many, ctx)
  assert.equal(capped.drafts.length, MAX_ENTRIES)
  assert.deepEqual(capped.errors, ['Only 8 entries at a time; 2 skipped.'])

  const mixed = draftEntries([{ type: 'expense', amount: 10, category: 'food' }, 'oops', { type: 'nope' }], ctx)
  assert.equal(mixed.drafts.length, 1)
  assert.equal(mixed.errors[0], 'Entry 2: each entry must be an object.')
  assert.match(mixed.errors[1], /^Entry 3: type must be one of /)
})

test('drafts and proposals have the shape the panel and the model expect', () => {
  const draft = makeDraft('entry', { a: 1 }, { warnings: ['w'], needs: ['n1', 'n2'], summary: 'S' })
  assert.match(draft.id, /^dr/)
  assert.equal(draft.status, 'pending')
  assert.equal(draft.needsEdit, 'n1 · n2')

  assert.deepEqual(proposal([draft], ['e']).result, {
    ok: true,
    drafts: [{ ref: 'D1', summary: 'S', warnings: ['w'], needs: 'n1 · n2' }],
    errors: ['e'],
    note: 'Shown to the user as draft cards. Nothing is saved until they confirm.',
  })
  assert.deepEqual(proposal([], ['a.', 'b.']), { result: { ok: false, error: 'a. b.' }, drafts: [] })
  assert.deepEqual(proposal([]).result, { ok: false, error: 'Nothing to draft.' })

  const lunch = draftEntries([{ type: 'expense', amount: 250, category: 'food', note: 'lunch', date: '2026-11-09' }], makeCtx())
  assert.equal(lunch.drafts[0].summary, 'Spent · ₹250 · Food & dining · Amazon Pay ICICI · 2026-11-09 · “lunch”')
})
