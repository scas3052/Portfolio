import { test } from 'node:test'
import assert from 'node:assert/strict'
import { voucherView } from '../../src/finance/components/agent/voucher.js'
import { executeTool } from '../../src/finance/agent/executors.js'
import { makeCtx } from '../helpers/ctx.mjs'

const ctx = makeCtx()
const view = (name, args) => voucherView(executeTool(name, JSON.stringify(args), ctx).drafts[0], ctx)
const entry = (args) => view('propose_entries', { entries: [args] })

test('entry cards show the type, the amount and only the rows that apply', () => {
  assert.deepEqual(entry({ type: 'expense', amount: 250, category: 'food', note: 'lunch' }), {
    title: 'Spent',
    tone: 'peach',
    amount: 250,
    caption: '',
    was: null,
    rows: [['Category', 'Food & dining'], ['Account', 'Amazon Pay ICICI'], ['Date', 'Today'], ['Note', '“lunch”']],
  })
  assert.deepEqual(entry({ type: 'transfer', amount: 5000, account: 'hdfc', toAccount: 'sbi', date: '2026-11-03' }).rows, [
    ['From', 'HDFC Salary'],
    ['To', 'SBI Savings'],
    ['Date', 'Tue, 3 Nov'],
  ])
  const emi = entry({ type: 'emi', loan: 'bike', amount: 4250 })
  assert.deepEqual([emi.title, emi.tone, emi.rows[0]], ['EMI', 'coral', ['Loan', 'Bike loan']])
})

test('people rows tell a known person from a new one, or show a gap to fill', () => {
  const person = (args) => entry({ type: 'lend', amount: 300, ...args }).rows[0]
  assert.deepEqual(person({ person: 'Ravi' }), ['Person', 'Ravi'])
  assert.deepEqual(person({ person: 'Priya' }), ['Person', 'Priya (new)'])
  assert.deepEqual(person({}), ['Person', '—'])
  assert.deepEqual(entry({ type: 'lend', amount: 300, person: 'Priya', date: '2026-11-09' }).rows.at(-1), ['Date', 'Yesterday'])
})

test('edit cards list only what changes, with the old amount alongside', () => {
  assert.deepEqual(view('propose_update_entry', { id: 'st_228', amount: 900, note: 'Lunch + coffee' }), {
    title: 'Edit entry',
    tone: 'sky',
    amount: 900,
    caption: 'Lunch',
    was: 800,
    rows: [['Note', '“Lunch” → “Lunch + coffee”']],
  })
  const retyped = view('propose_update_entry', { id: 'st_228', type: 'borrow' })
  assert.deepEqual([retyped.was, retyped.rows], [null, [['Type', 'Lent → Borrowed']]])
  assert.deepEqual(view('propose_update_entry', { id: 'st_228', date: '2026-11-08' }).rows, [['Date', 'Sat, 7 Nov → Sun, 8 Nov']])
})

test('delete cards describe the entry that will go', () => {
  assert.deepEqual(view('propose_delete_entry', { id: 'st_227' }), {
    title: 'Delete entry',
    tone: 'rose',
    amount: 1200,
    caption: 'Cab + dinner split',
    was: null,
    rows: [['Type', 'Borrowed'], ['Date', 'Mon, 2 Nov'], ['Note', '“Cab + dinner split”']],
  })
})

test('budget cards show the change from the current budget', () => {
  assert.deepEqual(view('propose_budget', { category: 'food', amount: 8000 }), {
    title: 'Monthly budget',
    tone: 'lilac',
    amount: 8000,
    caption: 'a month',
    was: 7000,
    rows: [['Category', 'Food & dining'], ['Before', '₹7,000']],
  })
  const fresh = view('propose_budget', { category: 'education', amount: 2000 })
  assert.deepEqual([fresh.was, fresh.rows[1]], [null, ['Before', 'No budget']])
  const removal = view('propose_budget', { category: 'food', amount: 0 })
  assert.deepEqual([removal.title, removal.amount, removal.was], ['Remove budget', null, 7000])
})

test('jar cards show the balance moving in either direction', () => {
  assert.deepEqual(view('propose_goal_contribution', { goal: 'goa', amount: 2000 }), {
    title: 'Into the jar',
    tone: 'sky',
    amount: 2000,
    caption: 'Goa trip',
    was: null,
    rows: [['Jar', 'Goa trip'], ['Saved', '₹18,500 → ₹20,500'], ['Target', '₹30,000']],
  })
  const out = view('propose_goal_contribution', { goal: 'goa', amount: -500 })
  assert.deepEqual([out.title, out.amount, out.rows[1]], ['Out of the jar', 500, ['Saved', '₹18,500 → ₹18,000']])
})

test('setup cards preview the new account, loan or jar', () => {
  const setup = (args) => view('propose_setup', args)
  assert.deepEqual(setup({ kind: 'account', name: 'Kotak savings', balance: 1000, bank: 'Kotak', last4: '1234' }), {
    was: null,
    title: 'New account',
    tone: 'butter',
    amount: 1000,
    caption: 'opening balance',
    rows: [['Name', 'Kotak savings'], ['Kind', 'Savings'], ['Bank', 'Kotak'], ['Ends in', '1234']],
  })
  const card = setup({ kind: 'account', name: 'HDFC Millennia', accountKind: 'credit', balance: -2500 })
  assert.deepEqual([card.amount, card.caption, card.rows[1]], [2500, 'due on the card', ['Kind', 'Credit card']])

  assert.deepEqual(setup({ kind: 'loan', name: 'Car loan', emi: 12000, tenure: 60, lender: 'HDFC', startMonth: '2026-12', dueDay: 5, account: 'hdfc' }).rows, [
    ['Name', 'Car loan'],
    ['Lender', 'HDFC'],
    ['EMIs', '0 of 60 paid'],
    ['Starts', 'Dec 2026'],
    ['Due day', '5 of each month'],
    ['Pays from', 'HDFC Salary'],
  ])
  const bare = setup({ kind: 'loan', name: 'Car loan' })
  assert.deepEqual([bare.amount, bare.rows.find(([label]) => label === 'EMIs')], [null, ['EMIs', '—']])

  assert.deepEqual(setup({ kind: 'goal', name: 'House', target: 500000, deadline: '2027-03' }).rows, [['Name', 'House'], ['Saved', '₹0'], ['By', 'Mar 2027']])
  assert.deepEqual(setup({ kind: 'goal', name: 'Bike' }).rows.at(-1), ['By', 'No deadline'])
})

test('anything unrecognised falls back to a plain card', () => {
  const plain = { title: 'Draft', tone: 'gray', amount: null, caption: '', was: null, rows: [] }
  assert.deepEqual(voucherView({ kind: 'mystery', summary: 'Something' }, ctx), { ...plain, caption: 'Something' })
  assert.deepEqual(voucherView(null, ctx), plain)
  assert.deepEqual(voucherView({ kind: 'update', data: {} }, ctx), plain)
})
