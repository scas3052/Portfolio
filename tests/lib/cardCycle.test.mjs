import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cardBill, deriveAll, statementPeriods } from '../../src/finance/lib/selectors.js'
import { normalizeAccount } from '../../src/finance/lib/schema.js'
import { buildInsights } from '../../src/finance/lib/insights.js'

// A card billed on the 20th and due on the 5th of the next month, paid from a bank account.
const NO_CYCLE = { id: 'c1', name: 'HDFC Regalia', kind: 'credit', bank: '', last4: '', opening: 0, color: 'lilac' }
const CARD = { ...NO_CYCLE, statementDay: 20, dueDay: 5 }
const BANK = { id: 'b1', name: 'HDFC Salary', kind: 'savings', bank: '', last4: '', opening: 50000, color: 'mint' }

let seq = 0
const txn = (type, amount, date, accountId = 'c1', toAccountId = '') => ({
  id: `t${++seq}`,
  type,
  amount,
  date,
  accountId,
  toAccountId,
  personId: '',
  loanId: '',
  category: type === 'expense' ? 'shopping' : '',
  note: '',
  createdAt: 0,
})
const spend = (amount, date, card = 'c1') => txn('expense', amount, date, card)
const payCard = (amount, date, card = 'c1') => txn('transfer', amount, date, 'b1', card)
const book = (transactions, accounts = [CARD, BANK]) => ({ accounts, transactions, people: [], loans: [], goals: [], budgets: {} })

test('a spend after the bill date goes on the next bill, not the one already generated', () => {
  const transactions = [
    spend(4000, '2026-10-15'),
    payCard(4000, '2026-11-03'), // October's bill, paid in full
    spend(3000, '2026-11-10'),
    spend(2000, '2026-11-20'), // on the bill date: still on this bill
    spend(500, '2026-11-21'),
    spend(700, '2026-11-22'),
  ]
  assert.deepEqual(cardBill(CARD, transactions, '2026-11-22'), {
    statement: '2026-11-20',
    nextStatement: '2026-12-20',
    dueDate: '2026-12-05',
    billed: 5000,
    paidSince: 0,
    billDue: 5000,
    unbilled: 1200,
    totalDue: 6200,
    daysToDue: 13,
    overdue: false,
  })
})

test('before this month’s bill date, last month’s bill is the one due', () => {
  const transactions = [spend(1000, '2026-10-12'), spend(300, '2026-10-25')]
  const late = cardBill(CARD, transactions, '2026-11-10')
  assert.deepEqual(
    [late.statement, late.dueDate, late.nextStatement, late.billDue, late.unbilled, late.daysToDue, late.overdue],
    ['2026-10-20', '2026-11-05', '2026-11-20', 1000, 300, -5, true],
  )
  const dueToday = cardBill(CARD, transactions, '2026-11-05')
  assert.deepEqual([dueToday.daysToDue, dueToday.overdue], [0, false])

  // A bill day past the end of the month falls on its last day.
  const monthEnd = { ...CARD, statementDay: 31, dueDay: 20 }
  const december = cardBill(monthEnd, [], '2026-12-15')
  assert.deepEqual([december.statement, december.dueDate, december.nextStatement], ['2026-11-30', '2026-12-20', '2026-12-31'])
  const march = cardBill(monthEnd, [], '2027-03-10')
  assert.deepEqual([march.statement, march.dueDate, march.nextStatement], ['2027-02-28', '2027-03-20', '2027-03-31'])
})

test('payments after the bill date pay the bill down before newer spends', () => {
  const partly = cardBill(CARD, [spend(1000, '2026-11-15'), payCard(500, '2026-11-25'), spend(300, '2026-11-26')], '2026-11-28')
  assert.deepEqual([partly.billed, partly.paidSince, partly.billDue, partly.unbilled, partly.totalDue], [1000, 500, 500, 300, 800])

  const overpaid = cardBill(CARD, [spend(1000, '2026-11-15'), payCard(1200, '2026-11-25'), spend(500, '2026-11-26')], '2026-11-28')
  assert.deepEqual([overpaid.billDue, overpaid.unbilled, overpaid.totalDue], [0, 300, 300])

  // An unpaid bill carries into the next one.
  const carried = cardBill(CARD, [spend(1000, '2026-10-15'), spend(400, '2026-11-01')], '2026-11-22')
  assert.deepEqual([carried.billed, carried.billDue, carried.overdue], [1400, 1400, false])
})

test('only credit cards with both days keep a bill cycle', () => {
  assert.equal(cardBill(NO_CYCLE, [spend(100, '2026-11-01')], '2026-11-22'), null)
  assert.equal(cardBill({ ...NO_CYCLE, statementDay: 20 }, [], '2026-11-22'), null)
  assert.equal(cardBill({ ...BANK, statementDay: 20, dueDay: 5 }, [], '2026-11-22'), null)

  const days = ({ statementDay, dueDay }) => [statementDay, dueDay]
  assert.deepEqual(days(normalizeAccount({ ...CARD, statementDay: '20', dueDay: 5.4 }, 0)), [20, 5])
  assert.deepEqual(days(normalizeAccount({ ...CARD, statementDay: 32 }, 0)), [undefined, undefined])
  assert.deepEqual(days(normalizeAccount({ ...CARD, dueDay: '' }, 0)), [undefined, undefined])
  assert.deepEqual(days(normalizeAccount({ ...BANK, statementDay: 20, dueDay: 5 }, 0)), [undefined, undefined])
})

test('the book splits card dues into bills to pay and spends waiting for the next bill', () => {
  const noCycle = { ...NO_CYCLE, id: 'c2', name: 'Axis Ace', opening: -800 }
  const state = book([spend(3000, '2026-11-10'), spend(500, '2026-11-21'), spend(200, '2026-11-21', 'c2')], [CARD, noCycle, BANK])
  const { position, cardBills } = deriveAll(state, '2026-11-22')
  assert.deepEqual([...cardBills.keys()], ['c1'])
  // A card without bill days counts wholly as due.
  assert.deepEqual([position.credit, position.billDue, position.unbilled], [-4500, 4000, 500])
})

test('Overview reminds about a card bill in its last week and once it is overdue', () => {
  const remindersOn = (today, transactions) => {
    const state = book(transactions)
    return buildInsights(state, deriveAll(state, today), today).filter((card) => card.id.startsWith('card-'))
  }
  const spends = [spend(1000, '2026-11-15'), spend(500, '2026-11-21')]

  assert.deepEqual(remindersOn('2026-11-22', spends), [], 'nothing while the due date is a fortnight away')

  const [soon] = remindersOn('2026-11-30', spends)
  assert.deepEqual(
    [soon.id, soon.title, soon.body],
    ['card-soon-c1', 'HDFC Regalia: ₹1,000 due in 5 days', 'From the 20 Nov bill. The ₹500 spent since goes on the 20 Dec bill.'],
  )
  assert.deepEqual(soon.action, { label: 'Pay the bill', kind: 'paycard', accountId: 'c1', amount: 1000 })

  const [late] = remindersOn('2026-12-08', spends)
  assert.deepEqual([late.id, late.priority, late.action.amount], ['card-late-c1', 100, 1000])

  assert.deepEqual(remindersOn('2026-12-08', [...spends, payCard(1000, '2026-12-01')]), [], 'nothing once the bill is paid')
})

test('statements list the open one first, then each closed bill back to the first entry', () => {
  const transactions = [
    spend(4000, '2026-09-25'), // September 20 – October 20
    spend(1000, '2026-10-20'), // on the bill date: still October's bill
    payCard(5000, '2026-11-03'),
    spend(3000, '2026-11-10'),
    spend(700, '2026-11-22'),
  ]
  assert.deepEqual(statementPeriods(CARD, transactions, '2026-11-22'), [
    { start: '2026-11-21', end: '2026-12-20', closed: false, dueDate: '2027-01-05', billed: 0 },
    { start: '2026-10-21', end: '2026-11-20', closed: true, dueDate: '2026-12-05', billed: 3000 },
    { start: '2026-09-21', end: '2026-10-20', closed: true, dueDate: '2026-11-05', billed: 5000 },
  ])
  assert.deepEqual(statementPeriods(NO_CYCLE, transactions, '2026-11-22'), [])
  assert.equal(statementPeriods(CARD, [], '2026-11-22').length, 1, 'a card with no entries only has the open statement')
})
