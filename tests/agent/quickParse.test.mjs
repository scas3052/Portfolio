import { test } from 'node:test'
import assert from 'node:assert/strict'
import { quickParse } from '../../src/finance/agent/quickParse.js'
import { makeCtx } from '../helpers/ctx.mjs'

const ctx = makeCtx({})
const parse = (text) => quickParse(text, ctx)
const only = (text) => {
  const result = parse(text)
  assert.equal(result.confident, true, `${text} → ${result.reason}`)
  assert.equal(result.drafts.length, 1, text)
  return result.drafts[0]
}

test('plain spends become expense drafts on the usual card', () => {
  const draft = only('spent 250 on lunch yesterday')
  assert.equal(draft.kind, 'entry')
  assert.equal(draft.status, 'pending')
  assert.deepEqual(
    { type: draft.data.type, amount: draft.data.amount, category: draft.data.category, account: draft.data.accountId, date: draft.data.date, note: draft.data.note },
    { type: 'expense', amount: 250, category: 'food', account: 'sa_icici', date: '2026-11-09', note: 'lunch' },
  )
  assert.equal(draft.summary, 'Spent · ₹250 · Food & dining · Amazon Pay ICICI · 2026-11-09 · “lunch”')
  assert.equal(only('swiggy 340').data.category, 'food')
  assert.equal(only('recharged phone 299').data.category, 'bills')
})

test('named accounts, short amounts and day numbers are read', () => {
  const salary = only('got salary 72k in HDFC')
  assert.deepEqual([salary.data.type, salary.data.amount, salary.data.category, salary.data.accountId], ['income', 72000, 'salary', 'sa_hdfc'])
  assert.equal(only('paid 1200 for groceries by credit card').data.accountId, 'sa_icici')
  assert.equal(only('spent 300 on lunch in cash').data.accountId, 'sa_cash')
  assert.equal(only('spent 450 on dinner from sbi').data.accountId, 'sa_sbi')
  const shoes = only('spent 2.5k on shoes on 5th')
  assert.deepEqual([shoes.data.amount, shoes.data.category, shoes.data.date], [2500, 'shopping', '2026-11-05'])
  assert.deepEqual(shoes.warnings, ['Crosses your Shopping budget by ₹2,265'])
})

test('people entries pick the right direction', () => {
  const lend = only('lent 500 to Ravi')
  assert.deepEqual([lend.data.type, lend.data.personId, lend.data.accountId], ['lend', 'sp_ravi', 'sa_cash'])
  const borrow = only('borrowed 2000 from Priya')
  assert.deepEqual([borrow.data.type, borrow.data.personId, borrow.data.personName], ['borrow', '', 'Priya'])
  assert.deepEqual(borrow.warnings, ['New person: Priya'])
  assert.equal(only('Ravi returned 1500').data.type, 'collect')
  assert.equal(only('got 1500 from ravi').data.type, 'collect')
  assert.equal(only('paid back Sneha 1200').data.type, 'repay')
  assert.deepEqual(only('lent 300 to raavi').warnings, ['New person: Raavi (did you mean Ravi?)'])
})

test('someone paying on the user’s behalf is a borrow that touches no account', () => {
  const notes = {
    'Ravi paid 300 for my lunch': 'Paid for lunch',
    'ravi paid on behalf of me 300 for food': 'Paid for food',
    'Ravi paid for me 300': 'Paid for me',
    'Ravi paid 300 for my lunch at Dominos': 'Paid for lunch at Dominos',
    'Ravi ordered food for me 300': 'Paid for food',
    'Ravi ne mere liye 300 diye': 'Paid for me',
    'Ravi ne mere lunch ke liye 300 diye': 'Paid for lunch',
    'ravi ne mere liye 300 pay kar diye': 'Paid for me',
  }
  for (const [text, note] of Object.entries(notes)) {
    const draft = only(text)
    assert.deepEqual([draft.data.type, draft.data.amount, draft.data.personId, draft.data.accountId, draft.data.note], ['borrow', 300, 'sp_ravi', '', note], text)
    assert.deepEqual(draft.warnings, [], text)
  }
  const priya = only('Priya ne mere liye 250 ka khana order kiya')
  assert.deepEqual([priya.data.type, priya.data.personName, priya.data.accountId, priya.data.note], ['borrow', 'Priya', '', 'Paid for khana'])

  const reasons = {
    'Ravi paid 300 for lunch': 'direction',
    'Ravi sent 300 for my lunch': 'direction',
    'Ravi paid for my lunch': 'amount',
    'Ravi paid 300 for my lunch in cash': 'unlinked',
    'Ravi paid 300 cash for my lunch': 'unlinked',
    'my friend paid 300 for my lunch': 'vague',
    'borrowed 100 from my friend': 'vague',
    'mere dost ne mere liye 300 diye': 'vague',
    'Ravi ne mujhe 300 diye': 'hindi',
    'Ravi ne 300 diye lunch ke liye': 'hindi',
    'maine Ravi ko 200 diye lunch ke liye': 'hindi',
  }
  for (const [text, reason] of Object.entries(reasons)) assert.equal(parse(text).reason, reason, text)
})

test('settling fills in the full amount owed', () => {
  const draft = only('settled with ravi')
  assert.deepEqual([draft.data.type, draft.data.amount, draft.data.personId], ['collect', 1500, 'sp_ravi'])
  assert.deepEqual(draft.warnings, ['Amount set to the full ₹1,500 Ravi owes you'])
  assert.equal(parse('settle up with kiran').reason, 'settled')
})

test('EMIs find the loan and warn when this month is already paid', () => {
  for (const text of ['paid bike emi', 'paid 4250 bike emi']) {
    const draft = only(text)
    assert.deepEqual([draft.data.type, draft.data.amount, draft.data.loanId, draft.data.category], ['emi', 4250, 'sl_bike', 'emi'], text)
    assert.deepEqual(draft.warnings, ['Bike loan EMI already logged for November 2026'])
  }
  assert.equal(only('paid iphone 16 emi').data.loanId, 'sl_phone')
})

test('transfers and withdrawals move money between accounts', () => {
  const transfer = only('transferred 5000 from hdfc to sbi')
  assert.deepEqual([transfer.data.type, transfer.data.accountId, transfer.data.toAccountId], ['transfer', 'sa_hdfc', 'sa_sbi'])
  assert.equal(transfer.summary, 'Transfer · ₹5,000 · HDFC Salary → SBI Savings · 2026-11-10')
  const withdraw = only('withdrew 2000 from sbi')
  assert.deepEqual([withdraw.data.accountId, withdraw.data.toAccountId], ['sa_sbi', 'sa_cash'])
})

test('several clauses share the date and become separate drafts', () => {
  const result = parse('spent 80 on chai yesterday and 40 on snacks')
  assert.equal(result.confident, true)
  assert.deepEqual(result.drafts.map((d) => [d.data.amount, d.data.date]), [[80, '2026-11-09'], [40, '2026-11-09']])
  const mixed = parse('spent 100 on tea and lent 200 to Ravi')
  assert.deepEqual(mixed.drafts.map((d) => d.data.type), ['expense', 'lend'])
})

test('questions, management and unclear text go to the model', () => {
  const reasons = {
    'how much did i spend on food?': 'question',
    'what is my balance': 'question',
    'set food budget to 8000': 'manage',
    'add a new account': 'manage',
    ['x'.repeat(400)]: 'length',
    '': 'length',
    'spent on food': 'amount',
    250: 'category',
    'gave 300 to raavi': 'to',
    'paid 1500 to ravi': 'to',
    'sneha paid me 1200': 'owes',
    'spent 99 on netflix from 4821': 'numbers',
    'spent 100 on tea, 200 on lunch, 300 on cab, 400 on movie, 500 on dinner, 600 on shoes, 700 on rent, 800 on gift, 900 on books': 'clauses',
  }
  for (const [text, reason] of Object.entries(reasons)) {
    const result = parse(text)
    assert.equal(result.confident, false, text)
    assert.equal(result.reason, reason, text)
    assert.deepEqual(result.drafts, [])
  }
})

test('an account it cannot place keeps the draft but is not confident', () => {
  for (const text of ['spent 120 on coffee via gpay', 'paid by debit card 300 for petrol', 'spent 250 at dmart by upi']) {
    const result = parse(text)
    assert.equal(result.confident, false, text)
    assert.equal(result.reason, 'account', text)
    assert.equal(result.drafts.length, 1, text)
  }
  assert.equal(parse('paid 500 for dinner with friends').confident, true)
})
