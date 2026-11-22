// Read tools: compact JSON answers about the user's money, sized for a small model context.
import { categoryMeta, EXPENSE_CATEGORIES, INCOME_CATEGORIES, TYPE_META } from '../lib/categories'
import { addMonths, daysInMonth, monthOf } from '../lib/dates'
import { round2 } from '../lib/format'
import { accountFlow, budgetStatus, describeTxn, goalPlan, searchText, summarize, txnsInMonth } from '../lib/selectors'
import { norm, resolveAccount, resolveCategory, resolveLoan, resolvePerson } from './resolve'
import { ENTRY_TYPES } from './tools'
import { EPS } from './entries'
import { calculate, cleanText, monthArg, parseDate, parseMoney } from './parse'

const fail = (error) => ({ ok: false, error })
const given = (value) => value != null && String(value).trim() !== ''
const pct = (ratio) => Math.round(ratio * 100)
const names = (list) => list.map((item) => item.name).join(', ') || 'none yet'
const categoryOf = (t) => t.category || (t.type === 'income' ? 'other_in' : 'other')
const dayOf = (today) => Number(today.slice(8, 10))

function getOverview(args, { state, derived, today }) {
  const { month, error } = monthArg(args.month, today)
  if (error) return fail(error)
  const s = summarize(txnsInMonth(derived.sorted, month))
  const previous = summarize(txnsInMonth(derived.sorted, addMonths(month, -1)))
  const out = {
    month,
    income: s.income,
    spent: s.spent,
    expense: s.expense,
    emi: s.emi,
    saved: s.saved,
    savingsRate: s.rate == null ? null : pct(s.rate),
    entries: s.count,
    topCategories: Object.entries(s.byCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, amount]) => ({ category: categoryMeta(id).label, amount })),
    lastMonth: { month: addMonths(month, -1), income: previous.income, spent: previous.spent },
  }
  if (month === monthOf(today)) {
    const sameDay = `${addMonths(month, -1)}-${String(Math.min(dayOf(today), daysInMonth(addMonths(month, -1)))).padStart(2, '0')}`
    out.dailyAverage = round2(s.expense / dayOf(today))
    out.lastMonthByThisDay = summarize(txnsInMonth(derived.sorted, addMonths(month, -1)).filter((t) => t.date <= sameDay)).spent
    out.emisDue = derived.loans
      .filter((l) => !l.done && !l.paidThisMonth && l.nextDue && monthOf(l.nextDue) <= month)
      .map((l) => ({ loan: l.loan.name, emi: l.loan.emi, due: l.nextDue }))
    if (derived.cardBills.size) {
      out.cardBillsDue = [...derived.cardBills]
        .filter(([, bill]) => bill.billDue > 0)
        .map(([id, bill]) => ({ card: derived.lookups.accounts.get(id).name, amount: bill.billDue, due: bill.dueDate, ...(bill.overdue ? { overdue: true } : {}) }))
    }
  }
  out.accountsNow = state.accounts.map((a) => ({ name: a.name, kind: a.kind, balance: round2(derived.balances.get(a.id) || 0) }))
  const p = derived.position
  out.positionNow = { cash: p.cash, creditCardDue: round2(Math.max(0, -p.credit)), owedToYou: p.receivable, youOwe: p.payable, emiLeft: p.emiLeft, netWorth: p.net }
  // With bill cycles, card dues split into generated bills and spends waiting for the next bill.
  if (derived.cardBills.size) Object.assign(out.positionNow, { cardBillsDue: p.billDue, cardUnbilled: p.unbilled })
  out.budgetsAtRisk = budgetStatus(state.budgets, s.byCategory)
    .filter((b) => b.ratio >= 0.8)
    .map((b) => ({ category: b.meta.label, limit: b.limit, spent: b.spent }))
  return out
}

function readPeriod(args, today) {
  const raw = String(args.month ?? '').trim()
  let from = ''
  let to = ''
  let label = 'all time'
  if (/^\d{4}$/.test(raw)) [from, to, label] = [`${raw}-01-01`, `${raw}-12-31`, raw]
  else if (raw) {
    const { month, error } = monthArg(raw, today)
    if (error) return { error }
    ;[from, to, label] = [`${month}-01`, `${month}-${daysInMonth(month)}`, month]
  }
  for (const key of ['from', 'to']) {
    if (!given(args[key])) continue
    const read = parseDate(args[key], today)
    if (read.unread) return { error: 'from/to must be dates like YYYY-MM-DD.' }
    if (key === 'from') from = read.date
    else to = read.date
  }
  if (given(args.from) || given(args.to)) label = `${from || 'start'} to ${to || 'now'}`
  return { from, to, label }
}

function resolveFilters(args, { state }, matched) {
  const filters = { types: null, category: '', accountId: '', personId: '', loanId: '' }
  const type = String(args.type ?? '').trim().toLowerCase()
  if (type === 'spending') filters.types = ['expense', 'emi']
  else if (type) {
    if (!ENTRY_TYPES.includes(type)) return { error: `type must be spending or one of ${ENTRY_TYPES.join(', ')}.` }
    filters.types = [type]
  }
  const category = cleanText(args.category, 40)
  if (category) {
    const q = norm(category)
    if (q === 'emi' || q === 'emis' || q.includes('loan')) {
      filters.types = ['emi']
      matched.category = categoryMeta('emi').label
    } else {
      const kinds = (filters.types || ['expense', 'income']).filter((t) => t === 'expense' || t === 'income')
      if (!kinds.length) return { error: 'Categories only apply to expense and income entries.' }
      const kind = kinds.find((k) => resolveCategory(category, k))
      if (!kind) {
        const ids = (list) => list.map((c) => c.id).join(', ')
        return { error: `Unknown category “${category}”. Expense: ${ids(EXPENSE_CATEGORIES)}. Income: ${ids(INCOME_CATEGORIES)}.` }
      }
      filters.category = resolveCategory(category, kind)
      filters.types = [kind]
      matched.category = categoryMeta(filters.category).label
    }
  }
  const lookup = (key, resolver, list, plural) => {
    const q = cleanText(args[key], 60)
    if (!q || filters.error) return ''
    const hit = resolver(q, list)
    if (hit && !hit.isNew) {
      matched[key] = hit.item.name
      return hit.item.id
    }
    const similar = hit?.similar?.length ? ` Did you mean ${hit.similar.join(' or ')}?` : ''
    filters.error = `No ${key} matches “${q}”.${similar} ${plural}: ${names(list)}.`
    return ''
  }
  filters.accountId = lookup('account', resolveAccount, state.accounts, 'Accounts')
  filters.personId = lookup('person', resolvePerson, state.people, 'People')
  filters.loanId = lookup('loan', resolveLoan, state.loans, 'Loans')
  return filters
}

function txnItem(t, lookups) {
  const item = { id: t.id, date: t.date, type: t.type, amount: t.amount, title: describeTxn(t, lookups).title }
  if (t.type === 'expense' || t.type === 'income') item.category = categoryMeta(categoryOf(t)).label
  const account = lookups.accounts.get(t.accountId)?.name
  if (t.type === 'transfer') item.account = `${account || '?'} → ${lookups.accounts.get(t.toAccountId)?.name || '?'}`
  else if (account) item.account = account
  const person = lookups.people.get(t.personId)?.name
  if (person) item.person = person
  return item
}

const GROUP_KEYS = {
  category: (t) => (t.type === 'expense' || t.type === 'income' || t.type === 'emi' ? categoryMeta(t.type === 'emi' ? 'emi' : categoryOf(t)).label : TYPE_META[t.type].label),
  type: (t) => TYPE_META[t.type].label,
  account: (t, lookups) => lookups.accounts.get(t.accountId)?.name || 'No account',
  person: (t, lookups) => lookups.people.get(t.personId)?.name || '',
  month: (t) => t.date.slice(0, 7),
  day: (t) => t.date,
}
const SORTS = ['newest', 'oldest', 'largest', 'smallest']

function groupRows(list, groupBy, lookups, out) {
  const groups = new Map()
  for (const t of list) {
    const key = GROUP_KEYS[groupBy](t, lookups)
    if (!key) continue
    const group = groups.get(key) || { key, count: 0, total: 0 }
    group.count += 1
    group.total = round2(group.total + t.amount)
    groups.set(key, group)
  }
  let rows = [...groups.values()]
  if (groupBy === 'month' || groupBy === 'day') {
    const keep = groupBy === 'month' ? 36 : 62
    rows.sort((a, b) => (a.key < b.key ? -1 : 1))
    if (rows.length > keep) {
      rows = rows.slice(-keep)
      out.groupsTruncated = true
    }
  } else rows.sort((a, b) => b.total - a.total)
  return rows
}

function queryTransactions(args, ctx) {
  const { derived, today } = ctx
  const period = readPeriod(args, today)
  if (period.error) return fail(period.error)
  const matched = { period: period.label }
  const f = resolveFilters(args, ctx, matched)
  if (f.error) return fail(f.error)
  const groupBy = String(args.groupBy ?? '').trim().toLowerCase()
  if (groupBy && !GROUP_KEYS[groupBy]) return fail(`groupBy must be one of ${Object.keys(GROUP_KEYS).join(', ')}.`)
  const sort = String(args.sort ?? '').trim().toLowerCase() || 'newest'
  if (!SORTS.includes(sort)) return fail(`sort must be one of ${SORTS.join(', ')}.`)
  const words = norm(args.text).split(' ').filter(Boolean)
  if (words.length) matched.text = words.join(' ')
  const min = given(args.minAmount) ? parseMoney(args.minAmount) : NaN
  const max = given(args.maxAmount) ? parseMoney(args.maxAmount) : NaN
  const { lookups } = derived
  const list = derived.sorted.filter(
    (t) =>
      (!period.from || t.date >= period.from) &&
      (!period.to || t.date <= period.to) &&
      (!f.types || f.types.includes(t.type)) &&
      (!f.category || categoryOf(t) === f.category) &&
      (!f.accountId || t.accountId === f.accountId || t.toAccountId === f.accountId) &&
      (!f.personId || t.personId === f.personId) &&
      (!f.loanId || t.loanId === f.loanId) &&
      (!Number.isFinite(min) || t.amount >= min - EPS) &&
      (!Number.isFinite(max) || t.amount <= max + EPS) &&
      (!words.length || words.every((w) => ` ${norm(searchText(t, lookups))} `.includes(w))),
  )
  const out = { matched, count: list.length }
  const total = round2(list.reduce((sum, t) => sum + t.amount, 0))
  if (f.types) out.total = total
  else {
    out.byType = {}
    for (const t of list) out.byType[t.type] = round2((out.byType[t.type] || 0) + t.amount)
    if (Object.keys(out.byType).length === 1) out.total = total
  }
  if (groupBy) out.groups = groupRows(list, groupBy, lookups, out)
  let items = list
  if (sort === 'oldest') items = [...list].reverse()
  else if (sort === 'largest') items = [...list].sort((a, b) => b.amount - a.amount)
  else if (sort === 'smallest') items = [...list].sort((a, b) => a.amount - b.amount)
  let limit = given(args.limit) ? Math.round(parseMoney(args.limit)) : NaN
  if (!Number.isFinite(limit)) limit = groupBy ? 5 : 10
  limit = Math.min(25, Math.max(0, limit))
  out.items = items.slice(0, limit).map((t) => txnItem(t, lookups))
  if (list.length > limit) out.more = list.length - limit
  return out
}

function runCalculate(args) {
  const result = calculate(args.expression)
  return result == null ? fail('Couldn’t evaluate that. Use numbers with + - * / ( ) and %.') : { expression: cleanText(args.expression, 200), result }
}

function getAccounts(args, { state, derived, today }) {
  if (!state.accounts.length) return { accounts: [], note: 'No accounts yet.' }
  const month = monthOf(today)
  const accounts = state.accounts.map((a) => {
    const balance = round2(derived.balances.get(a.id) || 0)
    const flow = accountFlow(a.id, derived.sorted, month)
    const row = { name: a.name, kind: a.kind }
    if (a.bank) row.bank = a.bank
    if (a.last4) row.last4 = a.last4
    row.balance = balance
    if (a.kind === 'credit') {
      row.due = round2(Math.max(0, -balance))
      const bill = derived.cardBills.get(a.id)
      if (bill) {
        row.lastBill = { on: bill.statement, amount: bill.billed, leftToPay: bill.billDue, payBy: bill.dueDate }
        if (bill.overdue) row.lastBill.overdue = true
        row.unbilled = bill.unbilled
        row.nextBillOn = bill.nextStatement
      } else {
        row.billCycle = 'not set (Accounts → tap the card → Edit)'
      }
    }
    return { ...row, inThisMonth: flow.inflow, outThisMonth: flow.outflow }
  })
  const totals = { cash: derived.position.cash, creditDue: round2(Math.max(0, -derived.position.credit)) }
  if (derived.cardBills.size) Object.assign(totals, { cardBillsDue: derived.position.billDue, unbilled: derived.position.unbilled })
  return { month, accounts, totals }
}

function personRow(p) {
  const row = { name: p.name }
  if (p.net > EPS) row.owesYou = p.net
  else if (p.net < -EPS) row.youOwe = round2(-p.net)
  else row.settled = true
  return row
}

const PEOPLE_FILTERS = {
  all: () => true,
  owes_me: (p) => p.net > EPS,
  i_owe: (p) => p.net < -EPS,
  settled: (p) => Math.abs(p.net) <= EPS,
}

function getPeople(args, { state, derived }) {
  if (!state.people.length) return { people: [], note: 'No people yet; they appear with lend/borrow entries.' }
  const q = cleanText(args.name, 60)
  if (q) {
    const hit = resolvePerson(q, state.people)
    if (!hit || hit.isNew) {
      const similar = hit?.similar?.length ? ` Did you mean ${hit.similar.join(' or ')}?` : ''
      return fail(`No one called “${q}”.${similar} People: ${names(state.people)}.`)
    }
    const p = derived.people.find((x) => x.id === hit.item.id)
    const history = p.history.slice(0, 8).map((t) => ({ id: t.id, date: t.date, type: t.type, amount: t.amount, ...(t.note ? { note: t.note } : {}) }))
    return { ...personRow(p), lent: p.lent, collected: p.collected, borrowed: p.borrowed, repaid: p.repaid, ...(p.since ? { since: p.since } : {}), history }
  }
  const filter = String(args.filter ?? '').trim().toLowerCase() || 'all'
  if (!PEOPLE_FILTERS[filter]) return fail('filter must be all, owes_me, i_owe or settled.')
  const people = derived.people
    .filter(PEOPLE_FILTERS[filter])
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
    .map(personRow)
  return { filter, people, totals: { owedToYou: derived.owe.receivable, youOwe: derived.owe.payable } }
}

function loanRow(s, lookups) {
  const l = s.loan
  const row = { name: l.name, ...(l.lender ? { lender: l.lender } : {}), emi: l.emi, tenure: l.tenure }
  Object.assign(row, { paidEmis: s.paidCount, emisLeft: s.remaining, paid: s.paidAmount, left: s.left, total: s.total })
  if (s.done) row.done = true
  else Object.assign(row, { nextDue: s.nextDue, daysToDue: s.daysToDue, overdue: s.overdue, paidThisMonth: s.paidThisMonth })
  row.ends = s.endMonth
  if (l.rate) row.rate = l.rate
  if (l.principal) row.principal = l.principal
  const account = lookups.accounts.get(l.accountId)?.name
  if (account) row.account = account
  return row
}

function getLoans(args, { state, derived }) {
  if (!state.loans.length) return { loans: [], note: 'No loans set up.' }
  let list = derived.loans
  const q = cleanText(args.name, 60)
  if (q) {
    const hit = resolveLoan(q, state.loans)
    if (!hit) return fail(`No loan matches “${q}”. Loans: ${names(state.loans)}.`)
    list = list.filter((s) => s.loan.id === hit.item.id)
  }
  const active = derived.loans.filter((s) => !s.done)
  const totals = { monthlyEmi: round2(active.reduce((sum, s) => sum + s.loan.emi, 0)), left: derived.position.emiLeft, active: active.length }
  return { loans: list.map((s) => loanRow(s, derived.lookups)), totals }
}

function getBudgets(args, { state, derived, today }) {
  const { month, error } = monthArg(args.month, today)
  if (error) return fail(error)
  const rows = budgetStatus(state.budgets, summarize(txnsInMonth(derived.sorted, month)).byCategory)
  if (!rows.length) return { month, budgets: [], note: 'No budgets set. Draft one with propose_budget.' }
  const budgets = rows.map((b) => ({ category: b.meta.label, id: b.id, limit: b.limit, spent: b.spent, left: b.left, usedPct: pct(b.ratio), ...(b.over ? { over: true } : {}) }))
  const limit = round2(rows.reduce((sum, b) => sum + b.limit, 0))
  const spent = round2(rows.reduce((sum, b) => sum + b.spent, 0))
  const out = { month, budgets, totals: { limit, spent, left: round2(limit - spent) } }
  if (month === monthOf(today)) out.daysLeft = daysInMonth(month) - dayOf(today) + 1
  return out
}

function getGoals(args, { state, today }) {
  if (!state.goals.length) return { goals: [], note: 'No goals yet. Draft one with propose_setup kind goal.' }
  const goals = state.goals.map((g) => {
    const plan = goalPlan(g, today)
    const row = { name: g.name, target: g.target, saved: g.saved, remaining: plan.remaining, progressPct: pct(plan.progress) }
    if (g.deadline) Object.assign(row, { deadline: g.deadline, monthsLeft: plan.monthsLeft })
    if (plan.perMonth) row.perMonth = plan.perMonth
    if (plan.done) row.done = true
    if (plan.late) row.late = true
    return row
  })
  return { goals }
}

export const READERS = {
  get_overview: getOverview,
  query_transactions: queryTransactions,
  calculate: runCalculate,
  get_accounts: getAccounts,
  get_people: getPeople,
  get_loans: getLoans,
  get_budgets: getBudgets,
  get_goals: getGoals,
}
