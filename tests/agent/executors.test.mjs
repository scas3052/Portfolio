import { test } from 'node:test'
import assert from 'node:assert/strict'
import { executeTool, fitResult } from '../../src/finance/agent/executors.js'
import { buildSample } from '../../src/finance/lib/sample.js'
import { makeCtx, TODAY } from '../helpers/ctx.mjs'

const run = (name, args = {}, ctx = makeCtx()) => executeTool(name, typeof args === 'string' ? args : JSON.stringify(args), ctx)
const read = (name, args, ctx) => run(name, args, ctx).result
const NOTE = 'Shown to the user as draft cards. Nothing is saved until they confirm.'

test('executeTool never throws: bad JSON, unknown tools and crashes become errors', () => {
  assert.deepEqual(run('get_overview', '{oops'), {
    result: { ok: false, error: 'Arguments were not valid JSON. Send one JSON object.' },
    drafts: [],
  })
  assert.deepEqual(run('nope', {}), { result: { ok: false, error: 'Unknown tool nope' }, drafts: [] })
  assert.match(executeTool('get_overview', '{}', {}).result.error, /^Tool failed: /)

  // Empty arguments are fine, and a pre-parsed object works too.
  assert.equal(executeTool('get_people', '', makeCtx()).result.filter, 'all')
  assert.equal(executeTool('get_people', { filter: 'i_owe' }, makeCtx()).result.filter, 'i_owe')
})

test('fitResult halves the longest list until the result fits', () => {
  assert.equal(fitResult({ a: 1 }), '{"a":1}')
  assert.equal(fitResult(undefined), 'null')

  const big = { items: Array.from({ length: 200 }, (_, i) => ({ i, text: 'abcdefghij' })) }
  const text = fitResult(big, 300)
  assert.ok(text.length <= 300)
  const parsed = JSON.parse(text)
  assert.equal(parsed.truncated, true)
  assert.ok(parsed.items.length > 0 && parsed.items.length < 200)
  assert.equal(big.items.length, 200, 'the original value is not mutated')

  assert.ok(fitResult('x'.repeat(500), 100).endsWith('…'))
  assert.equal(fitResult('x'.repeat(500), 100).length, 100)
})

test('readers answer from the live book without writing anything', () => {
  const ctx = makeCtx()
  const overview = read('get_overview', {}, ctx)
  assert.equal(overview.month, '2026-11')
  assert.deepEqual(overview.positionNow, { cash: 229650, creditCardDue: 19937, owedToYou: 2300, youOwe: 1200, emiLeft: 119422, netWorth: 91391 })

  const people = read('get_people', { filter: 'owes_me' }, ctx)
  assert.deepEqual(people.people, [
    { name: 'Ravi', owesYou: 1500 },
    { name: 'Arjun', owesYou: 800 },
  ])
  assert.deepEqual(people.totals, { owedToYou: 2300, youOwe: 1200 })

  const loans = read('get_loans', {}, ctx)
  assert.deepEqual(loans.totals, { monthlyEmi: 10908, left: 119422, active: 2 })

  const budgets = read('get_budgets', {}, ctx)
  assert.deepEqual(budgets.budgets[0], { category: 'Shopping', id: 'shopping', limit: 4000, spent: 3765, left: 235, usedPct: 94 })

  assert.deepEqual(read('get_accounts', {}, ctx).totals, { cash: 229650, creditDue: 19937 })
  assert.equal(read('get_goals', {}, ctx).goals.length, 3)
  assert.deepEqual(ctx.actions, [])
})

test('with bill days set, readers split a card’s last bill from spends waiting for the next one', () => {
  const unset = read('get_accounts', {}).accounts.find((a) => a.kind === 'credit')
  assert.deepEqual([unset.billCycle, unset.lastBill], ['not set (Accounts → tap the card → Edit)', undefined])

  const sample = buildSample(TODAY)
  const state = { ...sample, accounts: sample.accounts.map((a) => (a.id === 'sa_icici' ? { ...a, statementDay: 20, dueDay: 5 } : a)) }
  const ctx = makeCtx({ state })
  const overview = read('get_overview', {}, ctx)
  assert.deepEqual(overview.cardBillsDue, [{ card: 'Amazon Pay ICICI', amount: 7424, due: '2026-11-05', overdue: true }])
  assert.deepEqual([overview.positionNow.creditCardDue, overview.positionNow.cardBillsDue, overview.positionNow.cardUnbilled], [19937, 7424, 12513])

  const accounts = read('get_accounts', {}, ctx)
  const card = accounts.accounts.find((a) => a.kind === 'credit')
  assert.deepEqual(
    [card.lastBill, card.unbilled, card.nextBillOn],
    [{ on: '2026-10-20', amount: 7424, leftToPay: 7424, payBy: '2026-11-05', overdue: true }, 12513, '2026-11-20'],
  )
  assert.deepEqual(accounts.totals, { cash: 229650, creditDue: 19937, cardBillsDue: 7424, unbilled: 12513 })
})

test('query_transactions filters, totals, groups and lists', () => {
  const food = read('query_transactions', { category: 'food', month: '2026-11' })
  assert.deepEqual(food.matched, { period: '2026-11', category: 'Food & dining' })
  assert.equal(food.count, 7)
  assert.equal(food.total, 1146)

  const ravi = read('query_transactions', { person: 'ravi' })
  assert.deepEqual(ravi.byType, { collect: 1000, lend: 2500 })

  const grouped = read('query_transactions', { month: '2026-11', type: 'expense', groupBy: 'category' })
  assert.deepEqual(grouped.groups[0], { key: 'Rent & home', count: 1, total: 14000 })
  assert.equal(grouped.total, 31660)

  const swiggy = read('query_transactions', { text: 'swiggy', limit: 2 })
  assert.ok(swiggy.count >= 1)
  assert.ok(swiggy.items.length <= 2)
  assert.ok(swiggy.items.every((item) => /swiggy/i.test(item.title)))

  assert.deepEqual(read('query_transactions', { person: 'zed' }), {
    ok: false,
    error: 'No person matches “zed”. People: Kiran, Ravi, Sneha, Arjun.',
  })
})

test('calculate does exact arithmetic and refuses anything else', () => {
  assert.deepEqual(read('calculate', { expression: '(51457 + 168640) * 0.1' }), { expression: '(51457 + 168640) * 0.1', result: 22009.7 })
  const refused = { ok: false, error: 'Couldn’t evaluate that. Use numbers with + - * / ( ) and %.' }
  assert.deepEqual(read('calculate', { expression: 'process.exit()' }), refused)
  assert.deepEqual(read('calculate', { expression: '1/0' }), refused)
})

test('propose_entries accepts a list, a JSON string or a single entry', () => {
  assert.deepEqual(run('propose_entries', {}).result, { ok: false, error: 'Pass entries: [{type, amount, …}].' })
  const one = { type: 'expense', amount: 50, category: 'food' }
  assert.equal(run('propose_entries', { entries: [one, one] }).drafts.length, 2)
  assert.equal(run('propose_entries', { entries: JSON.stringify([one]) }).drafts.length, 1)
  assert.equal(run('propose_entries', one).drafts.length, 1)
})

test('propose_budget drafts changes and explains no-ops', () => {
  assert.match(read('propose_budget', { category: 'spaceships', amount: 100 }).error, /^Unknown category “spaceships”\. Use one of: food, /)
  assert.deepEqual(read('propose_budget', { category: 'food', amount: 7000 }), { ok: false, error: 'Food & dining budget is already ₹7,000.' })

  const set = run('propose_budget', { category: 'food', amount: 8000 })
  assert.deepEqual(set.result, { ok: true, drafts: [{ ref: 'D1', summary: 'Budget · Food & dining · ₹8,000/month (was ₹7,000)' }], note: NOTE })
  assert.deepEqual(set.drafts[0].data, { category: 'food', amount: 8000, previous: 7000 })

  assert.equal(run('propose_budget', { category: 'health', amount: 2000 }).drafts[0].summary, 'Budget · Health & fitness · ₹2,000/month')
  assert.equal(run('propose_budget', { category: 'food', amount: 0 }).drafts[0].summary, 'Remove Food & dining budget (was ₹7,000)')
  assert.deepEqual(read('propose_budget', { category: 'health', amount: 0 }), { ok: false, error: 'There’s no Health & fitness budget to remove.' })
})

test('propose_goal_contribution adds or takes out, within what is saved', () => {
  assert.deepEqual(read('propose_goal_contribution', { goal: 'house', amount: 100 }), {
    ok: false,
    error: 'No goal matches “house”. Goals: Emergency fund, Goa trip, MacBook Air.',
  })
  const add = run('propose_goal_contribution', { goal: 'goa', amount: 5000 })
  assert.deepEqual(add.drafts[0].data, { goalId: 'sg_goa', amount: 5000, previousSaved: 18500 })
  assert.equal(add.drafts[0].summary, 'Add ₹5,000 to Goa trip · ₹23,500 of ₹30,000')

  assert.deepEqual(run('propose_goal_contribution', { goal: 'goa', amount: 11500 }).drafts[0].warnings, ['This reaches the ₹30,000 target'])
  assert.deepEqual(read('propose_goal_contribution', { goal: 'goa', amount: -20000 }), { ok: false, error: 'Goa trip only has ₹18,500 saved.' })
  assert.equal(run('propose_goal_contribution', { goal: 'mac', amount: -1000 }).drafts[0].summary, 'Take ₹1,000 from MacBook Air · ₹25,000 of ₹1,10,000')
})

test('propose_setup prefills the right form and asks for what is missing', () => {
  assert.deepEqual(read('propose_setup', { kind: 'pet', name: 'x' }), { ok: false, error: 'kind must be account, loan or goal.' })
  assert.deepEqual(read('propose_setup', { kind: 'goal' }), { ok: false, error: 'Give the goal a name.' })

  const card = run('propose_setup', { kind: 'account', name: 'Kotak credit card', balance: 2500, last4: '12345' }).drafts[0]
  assert.deepEqual(card.data, { setup: 'account', prefill: { name: 'Kotak credit card', kind: 'credit', bank: '', last4: '', opening: -2500 } })
  assert.deepEqual(card.warnings, ['Last 4 digits should be exactly 4 digits; left blank'])
  assert.equal(card.summary, 'New Credit card account · Kotak credit card · ₹2,500 due')

  // A debit card is a bank account, not a credit card.
  assert.equal(run('propose_setup', { kind: 'account', name: 'Kotak debit card' }).drafts[0].data.prefill.kind, 'savings')
  assert.deepEqual(run('propose_setup', { kind: 'account', name: 'SBI Savings', balance: 10 }).drafts[0].warnings, ['You already have an account called SBI Savings'])

  assert.equal(run('propose_setup', { kind: 'loan', name: 'Car loan' }).drafts[0].needsEdit, 'EMI amount? · Number of EMIs?')
  const loan = run('propose_setup', { kind: 'loan', name: 'Car loan', emi: 12000, months: 36, paidBefore: 3 }).drafts[0]
  assert.equal(loan.data.prefill.startMonth, '2026-08')
  assert.deepEqual(loan.warnings, ['Start month assumed Aug 2026; check it'])

  assert.equal(run('propose_setup', { kind: 'goal', name: 'House' }).drafts[0].needsEdit, 'Target amount?')
  const house = run('propose_setup', { kind: 'goal', name: 'House', target: 500000, deadline: 'march' }).drafts[0]
  assert.deepEqual(house.data.prefill, { name: 'House', target: 500000, saved: 0, deadline: '2027-03' })
})

test('propose_setup takes a card’s bill and due days only as a pair', () => {
  const card = run('propose_setup', { kind: 'account', name: 'HDFC credit card', statementDay: 20, dueDay: '5th' }).drafts[0]
  assert.deepEqual(card.data.prefill, { name: 'HDFC credit card', kind: 'credit', bank: '', last4: '', opening: 0, statementDay: 20, dueDay: 5 })
  assert.equal(card.summary, 'New Credit card account · HDFC credit card · ₹0 due · bill day 20, due day 5')

  const half = run('propose_setup', { kind: 'account', name: 'HDFC credit card', statementDay: 20 }).drafts[0]
  assert.deepEqual([half.data.prefill.statementDay, half.warnings], [undefined, ['Add the due day to track bills; left blank']])
  const bad = run('propose_setup', { kind: 'account', name: 'HDFC credit card', statementDay: 40, dueDay: 5 }).drafts[0]
  assert.deepEqual([bad.data.prefill.dueDay, bad.warnings], [undefined, ['Bill and due days should be 1–31; left blank']])
  assert.equal(run('propose_setup', { kind: 'account', name: 'Kotak savings', statementDay: 20, dueDay: 5 }).drafts[0].data.prefill.statementDay, undefined)
})

test('propose_update_entry and propose_delete_entry work from real ids', () => {
  assert.deepEqual(read('propose_update_entry', { id: 'nope', amount: 5 }), {
    ok: false,
    error: 'No entry with id nope. Find it with query_transactions first.',
  })
  assert.deepEqual(read('propose_update_entry', { id: 'st_228', amount: 800 }), { ok: false, error: 'Those changes match the entry as it is.' })

  const update = run('propose_update_entry', { id: 'st_228', amount: 900, note: 'Lunch + coffee' }).drafts[0]
  assert.equal(update.kind, 'update')
  assert.equal(update.summary, 'Change “Lunch” (2026-11-07): amount ₹800 → ₹900; note “Lunch” → “Lunch + coffee”')
  assert.equal(update.data.before.amount, 800)
  assert.equal(update.data.after.amount, 900)

  const remove = run('propose_delete_entry', { id: 'st_227' }).drafts[0]
  assert.equal(remove.summary, 'Delete · Borrowed · ₹1,200 · Cab + dinner split · 2026-11-02')

  const ctx = makeCtx()
  const emi = ctx.state.transactions.find((t) => t.type === 'emi' && t.loanId === 'sl_bike' && t.date.startsWith('2026-11'))
  assert.deepEqual(run('propose_delete_entry', { id: emi.id }, ctx).drafts[0].warnings, ['This EMI will count as unpaid again'])
})
