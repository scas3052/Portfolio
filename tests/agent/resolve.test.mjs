import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cleanName,
  guessCategory,
  kindText,
  norm,
  resolveAccount,
  resolveCategory,
  resolveGoal,
  resolveLoan,
  resolvePerson,
  similarity,
} from '../../src/finance/agent/resolve.js'
import { buildSample } from '../../src/finance/lib/sample.js'
import { TODAY } from '../helpers/ctx.mjs'

const sample = buildSample(TODAY)
const pick = (hit) => (hit ? hit.item.id : null)

test('norm folds case, accents, possessives and punctuation', () => {
  assert.equal(norm("Ravi's  Café!"), 'ravi cafe')
  assert.equal(norm('ÉMI'), 'emi')
  assert.equal(norm(null), '')
  assert.equal(kindText('Paid by Debit Card'), 'paid by debit')
})

test('similarity is a 0..1 edit-distance ratio', () => {
  assert.equal(similarity('ravi', 'ravi'), 1)
  assert.equal(similarity('ravi', 'rabi'), 0.75)
  assert.equal(similarity('', ''), 0)
})

test('resolveAccount matches names, banks, last four digits and kinds', () => {
  const cases = {
    hdfc: 'sa_hdfc',
    'HDFC Salary': 'sa_hdfc',
    4821: 'sa_hdfc',
    salary: 'sa_hdfc',
    sbi: 'sa_sbi',
    savings: 'sa_sbi',
    sa_sbi: 'sa_sbi',
    icici: 'sa_icici',
    amazon: 'sa_icici',
    card: 'sa_icici',
    cc: 'sa_icici',
    'icici card': 'sa_icici',
    'hdfc card': 'sa_hdfc',
    cash: 'sa_cash',
    wallet: 'sa_cash',
  }
  for (const [query, id] of Object.entries(cases)) assert.equal(pick(resolveAccount(query, sample.accounts)), id, query)
  for (const query of ['upi', 'paytm', 'kotak', 'gpay', '', null]) assert.equal(resolveAccount(query, sample.accounts), null, String(query))
  assert.equal(resolveAccount('sa_sbi', sample.accounts).score, 1)
})

test('a kind word always clears the account threshold', () => {
  // Regression: "credit card" scored 0.6000…01 and the +0.08 boost left it at 0.68, below 0.7.
  for (const query of ['credit card', 'my credit card', 'credit']) {
    const hit = resolveAccount(query, sample.accounts)
    assert.equal(pick(hit), 'sa_icici', query)
    assert.ok(hit.score >= 0.7, `${query} scored ${hit.score}`)
  }
})

test('a debit card is not mistaken for the credit card', () => {
  assert.equal(resolveAccount('debit card', sample.accounts), null)
})

test('resolveLoan matches by name and lender', () => {
  const cases = { bike: 'sl_bike', 'bike emi': 'sl_bike', iphone: 'sl_phone', bajaj: 'sl_phone', personal: 'sl_personal', 'kreditbee personal loan': 'sl_personal' }
  for (const [query, id] of Object.entries(cases)) assert.equal(pick(resolveLoan(query, sample.loans)), id, query)
  assert.equal(resolveLoan('car', sample.loans), null)
})

test('resolveGoal matches by name', () => {
  const cases = { goa: 'sg_goa', mac: 'sg_mac', macbook: 'sg_mac', emergency: 'sg_emergency' }
  for (const [query, id] of Object.entries(cases)) assert.equal(pick(resolveGoal(query, sample.goals)), id, query)
  assert.equal(resolveGoal('house', sample.goals), null)
})

test('cleanName tidies typed names', () => {
  assert.equal(cleanName('ravi kumar'), 'Ravi Kumar')
  assert.equal(cleanName('McDonald'), 'McDonald')
  assert.equal(cleanName('  ravi  '), 'Ravi')
  assert.equal(cleanName(''), '')
  assert.equal(cleanName('x'.repeat(50)).length, 40)
})

test('resolvePerson finds known people and flags new ones', () => {
  for (const query of ['ravi', 'Ravi', 'rav', 'ravi kumar']) assert.equal(pick(resolvePerson(query, sample.people)), 'sp_ravi', query)
  assert.equal(resolvePerson('ravi', sample.people).score, 1)
  assert.equal(pick(resolvePerson('Sneh', sample.people)), 'sp_sneha')
  assert.deepEqual(resolvePerson('raavi', sample.people), { isNew: true, name: 'Raavi', similar: ['Ravi'] })
  assert.deepEqual(resolvePerson('priya', sample.people), { isNew: true, name: 'Priya', similar: [] })
  assert.equal(resolvePerson('', sample.people), null)
})

test('guessCategory reads merchants and keywords', () => {
  const cases = [
    ['swiggy dinner', 'expense', 'food'],
    ['uber', 'expense', 'transport'],
    ['netflix', 'expense', 'subscriptions'],
    ['petrol', 'expense', 'fuel'],
    ['groceries from dmart', 'expense', 'groceries'],
    ['movie tickets', 'expense', 'entertainment'],
    ['electricity bill', 'expense', 'bills'],
    ['rent', 'expense', 'rent'],
    ['medicine', 'expense', 'health'],
    ['zzz', 'expense', ''],
    ['cashback', 'income', 'refund'],
    ['salary', 'income', 'salary'],
    ['freelance', 'income', 'freelance'],
  ]
  for (const [text, type, id] of cases) assert.equal(guessCategory(text, type), id, `${text} (${type})`)
})

test('resolveCategory accepts ids, labels and merchants per type', () => {
  const cases = [
    ['food', 'expense', 'food'],
    ['Food & dining', 'expense', 'food'],
    ['groceries', 'expense', 'groceries'],
    ['swiggy', 'expense', 'food'],
    ['gift', 'expense', 'gifts'],
    ['gift', 'income', 'gift_in'],
    ['other', 'income', 'other_in'],
    ['salary', 'income', 'salary'],
    ['xyz', 'expense', ''],
    ['', 'expense', ''],
  ]
  for (const [text, type, id] of cases) assert.equal(resolveCategory(text, type), id, `${text} (${type})`)
})
