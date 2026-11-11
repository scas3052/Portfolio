import { categoryMeta } from './categories'
import { addDays, addMonths, dateInMonth, daysInMonth, diffDays, monthDiff, monthOf, weekday } from './dates'
import { formatINR, round2 } from './format'

// How each transaction type moves the linked account (transfers handled separately).
export const ACCOUNT_SIGN = { expense: -1, emi: -1, lend: -1, repay: -1, income: 1, borrow: 1, collect: 1 }
// How each type moves a person's balance: positive = they owe you.
export const PERSON_SIGN = { lend: 1, repay: 1, borrow: -1, collect: -1 }

const EPS = 0.005

export function byNewest(a, b) {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1
  return b.createdAt - a.createdAt
}

export function sortTxns(list) {
  return [...list].sort(byNewest)
}

export function computeBalances(accounts, transactions) {
  const balances = new Map(accounts.map((account) => [account.id, account.opening]))
  for (const t of transactions) {
    if (t.type === 'transfer') {
      if (balances.has(t.accountId)) balances.set(t.accountId, balances.get(t.accountId) - t.amount)
      if (balances.has(t.toAccountId)) balances.set(t.toAccountId, balances.get(t.toAccountId) + t.amount)
    } else if (t.accountId && balances.has(t.accountId)) {
      balances.set(t.accountId, balances.get(t.accountId) + (ACCOUNT_SIGN[t.type] || 0) * t.amount)
    }
  }
  for (const [id, value] of balances) balances.set(id, round2(value))
  return balances
}

export function txnsInMonth(transactions, month) {
  return transactions.filter((t) => t.date.startsWith(month))
}

export function summarize(transactions) {
  const s = {
    income: 0,
    expense: 0,
    emi: 0,
    lent: 0,
    borrowed: 0,
    collected: 0,
    repaid: 0,
    transfers: 0,
    count: transactions.length,
    byCategory: {},
  }
  for (const t of transactions) {
    switch (t.type) {
      case 'income':
        s.income += t.amount
        break
      case 'expense': {
        const key = t.category || 'other'
        s.expense += t.amount
        s.byCategory[key] = (s.byCategory[key] || 0) + t.amount
        break
      }
      case 'emi':
        s.emi += t.amount
        s.byCategory.emi = (s.byCategory.emi || 0) + t.amount
        break
      case 'lend':
        s.lent += t.amount
        break
      case 'borrow':
        s.borrowed += t.amount
        break
      case 'collect':
        s.collected += t.amount
        break
      case 'repay':
        s.repaid += t.amount
        break
      default:
        s.transfers += t.amount
    }
  }
  for (const key of ['income', 'expense', 'emi', 'lent', 'borrowed', 'collected', 'repaid', 'transfers']) {
    s[key] = round2(s[key])
  }
  for (const key of Object.keys(s.byCategory)) s.byCategory[key] = round2(s.byCategory[key])
  s.spent = round2(s.expense + s.emi)
  s.saved = round2(s.income - s.spent)
  s.rate = s.income > 0 ? s.saved / s.income : null
  return s
}

export function categoryBreakdown(byCategory) {
  return Object.entries(byCategory)
    .filter(([, amount]) => amount > 0)
    .map(([id, amount]) => ({ id, amount, meta: categoryMeta(id) }))
    .sort((a, b) => b.amount - a.amount)
}

/** Spend per day of `month` (expenses, optionally EMIs). */
export function dailySpent(transactions, month, { includeEmi = true } = {}) {
  const days = new Array(daysInMonth(month)).fill(0)
  for (const t of transactions) {
    if (!t.date.startsWith(month)) continue
    if (t.type === 'expense' || (includeEmi && t.type === 'emi')) {
      days[Number(t.date.slice(8, 10)) - 1] += t.amount
    }
  }
  return days.map(round2)
}

export function cumulative(values) {
  let running = 0
  return values.map((value) => {
    running = round2(running + value)
    return running
  })
}

export function monthlySeries(transactions, endMonth, count = 6) {
  const months = Array.from({ length: count }, (_, i) => addMonths(endMonth, i - count + 1))
  const index = new Map(months.map((month, i) => [month, i]))
  const rows = months.map((month) => ({ month, income: 0, spent: 0 }))
  for (const t of transactions) {
    const i = index.get(t.date.slice(0, 7))
    if (i === undefined) continue
    if (t.type === 'income') rows[i].income += t.amount
    else if (t.type === 'expense' || t.type === 'emi') rows[i].spent += t.amount
  }
  return rows.map((row) => ({ ...row, income: round2(row.income), spent: round2(row.spent) }))
}

/** GitHub-style grid of daily (non-EMI) spending; the last column contains `today`. */
export function spendingHeatmap(transactions, today, weeks = 18) {
  const start = addDays(today, -(weeks - 1) * 7 - weekday(today))
  const totals = new Map()
  for (const t of transactions) {
    if (t.type !== 'expense' || t.date < start || t.date > today) continue
    totals.set(t.date, (totals.get(t.date) || 0) + t.amount)
  }
  let max = 0
  for (const value of totals.values()) max = Math.max(max, value)
  const cells = []
  for (let week = 0; week < weeks; week += 1) {
    for (let day = 0; day < 7; day += 1) {
      const date = addDays(start, week * 7 + day)
      const value = round2(totals.get(date) || 0)
      let level = 0
      if (date > today) level = -1
      else if (value > 0 && max > 0) level = Math.min(4, Math.max(1, Math.ceil(4 * Math.sqrt(value / max))))
      cells.push({ date, value, level, week, day })
    }
  }
  return { cells, max: round2(max), weeks, start }
}

export function computePeople(people, transactions) {
  const byId = new Map(
    people.map((person) => [
      person.id,
      { ...person, lent: 0, collected: 0, borrowed: 0, repaid: 0, net: 0, history: [], last: '', since: '' },
    ]),
  )
  const related = transactions
    .filter((t) => t.personId && PERSON_SIGN[t.type])
    .sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1))
  for (const t of related) {
    const p = byId.get(t.personId)
    if (!p) continue
    const before = p.net
    p.net = round2(p.net + PERSON_SIGN[t.type] * t.amount)
    if (t.type === 'lend') p.lent += t.amount
    if (t.type === 'collect') p.collected += t.amount
    if (t.type === 'borrow') p.borrowed += t.amount
    if (t.type === 'repay') p.repaid += t.amount
    p.history.push(t)
    p.last = t.date
    if (Math.abs(p.net) < EPS) p.since = ''
    else if (Math.abs(before) < EPS || Math.sign(before) !== Math.sign(p.net)) p.since = t.date
  }
  return [...byId.values()].map((p) => ({
    ...p,
    lent: round2(p.lent),
    collected: round2(p.collected),
    borrowed: round2(p.borrowed),
    repaid: round2(p.repaid),
    history: p.history.reverse(),
  }))
}

export function peopleTotals(list) {
  let receivable = 0
  let payable = 0
  let owesYou = 0
  let youOwe = 0
  for (const p of list) {
    if (p.net > EPS) {
      receivable += p.net
      owesYou += 1
    } else if (p.net < -EPS) {
      payable += -p.net
      youOwe += 1
    }
  }
  return { receivable: round2(receivable), payable: round2(payable), owesYou, youOwe }
}

export function loanStatus(loan, transactions, today) {
  const payments = transactions.filter((t) => t.type === 'emi' && t.loanId === loan.id).sort(byNewest)
  const paidViaApp = payments.reduce((sum, t) => sum + t.amount, 0)
  const paidCount = Math.min(loan.tenure, loan.paidBefore + payments.length)
  const total = round2(loan.emi * loan.tenure)
  const paidAmount = round2(loan.paidBefore * loan.emi + paidViaApp)
  const left = round2(Math.max(0, total - paidAmount))
  const remaining = Math.max(0, loan.tenure - paidCount)
  const done = remaining === 0
  const nextDue = done ? null : dateInMonth(addMonths(loan.startMonth, paidCount), loan.dueDay)
  const daysToDue = nextDue ? diffDays(today, nextDue) : null
  const thisMonth = monthOf(today)
  return {
    loan,
    payments,
    paidCount,
    paidAmount,
    total,
    left,
    remaining,
    done,
    nextDue,
    daysToDue,
    overdue: daysToDue !== null && daysToDue < 0,
    endMonth: addMonths(loan.startMonth, loan.tenure - 1),
    progress: total > 0 ? Math.min(1, paidAmount / total) : done ? 1 : 0,
    paidThisMonth: payments.some((t) => t.date.startsWith(thisMonth)),
  }
}

export function budgetStatus(budgets, byCategory) {
  return Object.entries(budgets)
    .map(([id, limit]) => {
      const spent = round2(byCategory[id] || 0)
      return { id, limit, spent, ratio: limit > 0 ? spent / limit : 0, over: spent > limit, left: round2(limit - spent), meta: categoryMeta(id) }
    })
    .sort((a, b) => b.ratio - a.ratio)
}

export function goalPlan(goal, today) {
  const remaining = round2(Math.max(0, goal.target - goal.saved))
  const progress = goal.target > 0 ? Math.min(1, goal.saved / goal.target) : 0
  const monthsLeft = goal.deadline ? monthDiff(monthOf(today), goal.deadline) + 1 : null
  const perMonth = monthsLeft && monthsLeft > 0 && remaining > 0 ? round2(remaining / monthsLeft) : null
  return {
    remaining,
    progress,
    monthsLeft,
    perMonth,
    done: goal.saved >= goal.target,
    late: Boolean(goal.deadline) && monthsLeft !== null && monthsLeft <= 0 && remaining > 0,
  }
}

export function frequentEntries(transactions, today, limit = 6) {
  const since = addDays(today, -90)
  const groups = new Map()
  for (const t of transactions) {
    if (t.type !== 'expense' || t.date < since || !t.note) continue
    const key = `${t.note.toLowerCase()}|${t.category}`
    const group = groups.get(key) || { key, note: t.note, category: t.category, amount: t.amount, accountId: t.accountId, count: 0, last: '' }
    group.count += 1
    if (t.date >= group.last) {
      group.last = t.date
      group.amount = t.amount
      group.accountId = t.accountId
      group.note = t.note
    }
    groups.set(key, group)
  }
  return [...groups.values()]
    .filter((group) => group.count >= 2)
    .sort((a, b) => b.count - a.count || (a.last < b.last ? 1 : -1))
    .slice(0, limit)
}

/** The account most recently used for any of `types`, else the first non-credit account. */
export function recentAccountId(sorted, accounts, types) {
  const ids = new Set(accounts.map((a) => a.id))
  const hit = sorted.find((t) => types.includes(t.type) && ids.has(t.accountId))
  return hit?.accountId || accounts.find((a) => a.kind !== 'credit')?.id || accounts[0]?.id || ''
}

export function describeTxn(t, lookups) {
  const account = lookups.accounts.get(t.accountId)
  const toAccount = lookups.accounts.get(t.toAccountId)
  const person = lookups.people.get(t.personId)
  const loan = lookups.loans.get(t.loanId)
  let title = t.note
  if (!title) {
    if (t.type === 'transfer') title = `${account?.name || 'Removed account'} → ${toAccount?.name || 'Removed account'}`
    else if (t.type === 'emi') title = loan ? `${loan.name} EMI` : 'EMI payment'
    else if (person && t.type === 'lend') title = `Lent to ${person.name}`
    else if (person && t.type === 'borrow') title = `Borrowed from ${person.name}`
    else if (person && t.type === 'collect') title = `${person.name} paid you back`
    else if (person && t.type === 'repay') title = `Paid back ${person.name}`
    else title = categoryMeta(t.category).label
  }
  const meta = []
  if (t.type === 'transfer') meta.push('Transfer')
  else if (t.type === 'emi') meta.push(loan?.lender || 'EMI')
  else if (person) meta.push(person.name)
  else meta.push(categoryMeta(t.category).short)
  if (t.type !== 'transfer') meta.push(account ? account.name : 'Not linked')
  return { title, meta: meta.join(' · ') }
}

export function searchText(t, lookups) {
  const { title, meta } = describeTxn(t, lookups)
  return `${title} ${meta} ${t.note} ${categoryMeta(t.category).label} ${t.type} ${t.amount} ${formatINR(t.amount)} ${t.date}`.toLowerCase()
}

export function signedAmount(t) {
  if (t.type === 'transfer') return t.amount
  return (ACCOUNT_SIGN[t.type] || 0) * t.amount
}

/** Splits newest-first transactions into day buckets with each day's net cash flow. */
export function groupByDay(sorted) {
  const groups = []
  let current = null
  for (const t of sorted) {
    if (!current || current.date !== t.date) {
      current = { date: t.date, items: [], net: 0 }
      groups.push(current)
    }
    current.items.push(t)
    if (t.type !== 'transfer') current.net = round2(current.net + signedAmount(t))
  }
  return groups
}

/** Money in/out of one account during `month` (transfers included). */
export function accountFlow(accountId, transactions, month) {
  let inflow = 0
  let outflow = 0
  for (const t of transactions) {
    if (!t.date.startsWith(month)) continue
    if (t.type === 'transfer') {
      if (t.accountId === accountId) outflow += t.amount
      if (t.toAccountId === accountId) inflow += t.amount
    } else if (t.accountId === accountId) {
      const sign = ACCOUNT_SIGN[t.type] || 0
      if (sign > 0) inflow += t.amount
      else if (sign < 0) outflow += t.amount
    }
  }
  return { inflow: round2(inflow), outflow: round2(outflow) }
}

export function deriveAll(state, today) {
  const balances = computeBalances(state.accounts, state.transactions)
  const people = computePeople(state.people, state.transactions)
  const owe = peopleTotals(people)
  const loans = state.loans.map((loan) => loanStatus(loan, state.transactions, today))
  let cash = 0
  let credit = 0
  for (const account of state.accounts) {
    const balance = balances.get(account.id) || 0
    if (account.kind === 'credit') credit += balance
    else cash += balance
  }
  const emiLeft = round2(loans.reduce((sum, status) => sum + status.left, 0))
  const position = {
    cash: round2(cash),
    credit: round2(credit),
    receivable: owe.receivable,
    payable: owe.payable,
    emiLeft,
    net: round2(cash + credit + owe.receivable - owe.payable - emiLeft),
  }
  const lookups = {
    accounts: new Map(state.accounts.map((a) => [a.id, a])),
    people: new Map(state.people.map((p) => [p.id, p])),
    loans: new Map(state.loans.map((l) => [l.id, l])),
  }
  const sorted = sortTxns(state.transactions)
  const firstMonth = sorted.length ? monthOf(sorted[sorted.length - 1].date) : monthOf(today)
  return { balances, people, owe, loans, position, lookups, sorted, firstMonth }
}
