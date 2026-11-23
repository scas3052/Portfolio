// Write tools. Each one checks the model's arguments and returns draft cards for the
// user to confirm; nothing is saved here.
import { ACCOUNT_KINDS, accountKindLabel, categoryMeta, EXPENSE_CATEGORIES, TYPE_META } from '../lib/categories'
import { addMonths, monthLabel, monthOf } from '../lib/dates'
import { formatINR, round2 } from '../lib/format'
import { describeTxn, summarize, txnsInMonth } from '../lib/selectors'
import { cleanName, KIND_WORDS, kindText, norm, resolveCategory, resolveGoal } from './resolve'
import { ambiguity, buildEntry, draftEntries, EPS, makeDraft, MAX_AMOUNT, newBatch, pickAccount, proposal } from './entries'
import { cleanText, monthArg, parseJSON, parseMoney } from './parse'

const ENTRY_KEYS = ['type', 'amount', 'category', 'account', 'toAccount', 'person', 'loan', 'date', 'note']
const fail = (error) => ({ result: { ok: false, error }, drafts: [] })
const given = (value) => value != null && String(value).trim() !== ''

function asList(value) {
  const parsed = typeof value === 'string' ? parseJSON(value) : value
  if (Array.isArray(parsed)) return parsed
  return parsed && typeof parsed === 'object' ? [parsed] : []
}

function proposeEntries(args, ctx) {
  let list = asList(args.entries)
  if (!list.length && args.type) list = [args]
  if (!list.length) return fail('Pass entries: [{type, amount, …}].')
  const { drafts, errors } = draftEntries(list, ctx)
  return proposal(drafts, errors)
}

function findTxn(args, ctx) {
  const id = String(args.id ?? '').trim()
  const txn = ctx.state.transactions.find((t) => t.id === id)
  return txn ? { txn } : { error: `No entry with id ${id || '(none)'}. Find it with query_transactions first.` }
}

const categoryLabel = (d) =>
  d.type === 'expense' || d.type === 'income' ? categoryMeta(d.category || (d.type === 'income' ? 'other_in' : 'other')).label : '—'

function entryDiffs(before, after, lookups) {
  const name = (map, id) => (id && map.get(id)?.name) || '—'
  const diffs = []
  const add = (field, a, b) => a !== b && diffs.push(`${field} ${a} → ${b}`)
  add('type', TYPE_META[before.type].label, TYPE_META[after.type].label)
  if (Math.abs(before.amount - after.amount) >= EPS) add('amount', formatINR(before.amount), formatINR(after.amount))
  add('date', before.date, after.date)
  add('category', categoryLabel(before), categoryLabel(after))
  if (before.accountId !== after.accountId) add('account', name(lookups.accounts, before.accountId), name(lookups.accounts, after.accountId))
  if ((before.type === 'transfer' || after.type === 'transfer') && before.toAccountId !== after.toAccountId) {
    add('to', name(lookups.accounts, before.toAccountId), name(lookups.accounts, after.toAccountId))
  }
  if (before.personId !== after.personId || (!after.personId && after.personName)) {
    add('person', name(lookups.people, before.personId), after.personName ? `${after.personName}${after.personId ? '' : ' (new)'}` : '—')
  }
  if (before.loanId !== after.loanId) add('loan', name(lookups.loans, before.loanId), name(lookups.loans, after.loanId))
  if ((before.note || '') !== after.note) add('note', `“${before.note || ''}”`, `“${after.note}”`)
  return diffs
}

function proposeUpdate(args, ctx) {
  const { txn, error } = findTxn(args, ctx)
  if (error) return fail(error)
  let changes = typeof args.changes === 'string' ? parseJSON(args.changes) : args.changes
  if (!changes || typeof changes !== 'object' || Array.isArray(changes) || !Object.keys(changes).length) {
    changes = Object.fromEntries(ENTRY_KEYS.filter((key) => given(args[key])).map((key) => [key, args[key]]))
  }
  const { lookups } = ctx.derived
  const keep = (map, id) => (id && map.has(id) ? id : '')
  const raw = {
    type: txn.type,
    amount: txn.amount,
    date: txn.date,
    note: txn.note,
    category: txn.category,
    account: keep(lookups.accounts, txn.accountId),
    toAccount: keep(lookups.accounts, txn.toAccountId),
    person: keep(lookups.people, txn.personId),
    loan: keep(lookups.loans, txn.loanId),
  }
  for (const key of ENTRY_KEYS) if (changes[key] != null) raw[key] = changes[key]
  if (raw.type !== txn.type && changes.category == null) raw.category = ''
  const built = buildEntry(raw, ctx, { excludeId: txn.id, original: txn, batch: newBatch() })
  if (built.error) return fail(built.error)
  const diffs = entryDiffs(txn, built.data, lookups)
  if (!diffs.length) return fail('Those changes match the entry as it is.')
  const title = describeTxn(txn, lookups).title
  const summary = `Change “${title}” (${txn.date}): ${diffs.join('; ')}`
  return proposal([makeDraft('update', { id: txn.id, before: txn, after: built.data }, { ...built, summary })])
}

function proposeDelete(args, ctx) {
  const { txn, error } = findTxn(args, ctx)
  if (error) return fail(error)
  const warnings = txn.type === 'emi' && txn.loanId ? ['This EMI will count as unpaid again'] : []
  const title = describeTxn(txn, ctx.derived.lookups).title
  const summary = `Delete · ${TYPE_META[txn.type].label} · ${formatINR(txn.amount)} · ${title} · ${txn.date}`
  return proposal([makeDraft('delete', { id: txn.id, before: txn }, { warnings, summary })])
}

function proposeBudget(args, ctx) {
  const query = cleanText(args.category, 40)
  const category = resolveCategory(query, 'expense')
  if (!category) return fail(`Unknown category “${query}”. Use one of: ${EXPENSE_CATEGORIES.map((c) => c.id).join(', ')}.`)
  const amount = parseMoney(args.amount)
  if (!Number.isFinite(amount) || amount < 0 || amount >= MAX_AMOUNT) return fail('amount must be a monthly rupee limit (0 removes the budget).')
  const label = categoryMeta(category).label
  const previous = ctx.state.budgets[category] || 0
  if (!amount && !previous) return fail(`There’s no ${label} budget to remove.`)
  if (Math.abs(amount - previous) < EPS) return fail(`${label} budget is already ${formatINR(previous)}.`)
  const warnings = []
  const spent = round2(summarize(txnsInMonth(ctx.derived.sorted, monthOf(ctx.today))).byCategory[category] || 0)
  if (amount && spent > amount) warnings.push(`You’ve already spent ${formatINR(spent)} on ${label} this month`)
  const was = previous ? ` (was ${formatINR(previous)})` : ''
  const summary = amount ? `Budget · ${label} · ${formatINR(amount)}/month${was}` : `Remove ${label} budget${was}`
  return proposal([makeDraft('budget', { category, amount: round2(amount), previous }, { warnings, summary })])
}

function proposeContribution(args, ctx) {
  const goals = ctx.state.goals
  if (!goals.length) return fail('No goals yet; draft one with propose_setup kind goal.')
  const query = cleanText(args.goal, 60)
  const hit = query ? resolveGoal(query, goals) : null
  if (!hit) return fail(`No goal matches “${query}”. Goals: ${goals.map((g) => g.name).join(', ')}.`)
  const amount = parseMoney(args.amount)
  if (!Number.isFinite(amount) || Math.abs(amount) < EPS || Math.abs(amount) >= MAX_AMOUNT) {
    return fail('amount must be a non-zero rupee amount (negative takes money out).')
  }
  const goal = hit.item
  const saved = goal.saved || 0
  if (amount < 0 && -amount > saved + EPS) return fail(`${goal.name} only has ${formatINR(saved)} saved.`)
  const warnings = hit.ambiguous.length ? [ambiguity(query, hit)] : []
  const after = round2(Math.max(0, saved + amount))
  if (amount > 0 && saved >= goal.target) warnings.push(`${goal.name} is already at its target`)
  else if (amount > 0 && after >= goal.target) warnings.push(`This reaches the ${formatINR(goal.target)} target`)
  const move = amount > 0 ? `Add ${formatINR(amount)} to` : `Take ${formatINR(-amount)} from`
  const summary = `${move} ${goal.name} · ${formatINR(after)} of ${formatINR(goal.target)}`
  return proposal([makeDraft('contribution', { goalId: goal.id, amount: round2(amount), previousSaved: saved }, { warnings, summary })])
}

const KIND_ORDER = ['credit', 'cash', 'salary', 'current', 'wallet', 'savings']

function guessKind(text) {
  const padded = ` ${kindText(text)} `
  return KIND_ORDER.find((kind) => KIND_WORDS[kind].some((word) => padded.includes(` ${word} `))) || 'savings'
}

const duplicate = (list, name) => list.some((item) => norm(item.name) === norm(name))

/** 20, "20" or "20th" → 20; anything that isn't a day of the month → 0. */
function dayArg(value) {
  const day = Math.round(parseMoney(String(value ?? '').replace(/(\d)\s*(?:st|nd|rd|th)\b/gi, '$1')))
  return day >= 1 && day <= 31 ? day : 0
}

/** A credit card's bill cycle needs both days; half of one is dropped with a warning. */
function cardCycle(args, warnings) {
  if (!given(args.statementDay) && !given(args.dueDay)) return null
  const statementDay = dayArg(args.statementDay)
  const dueDay = dayArg(args.dueDay)
  if (statementDay && dueDay) return { statementDay, dueDay }
  if ((given(args.statementDay) && !statementDay) || (given(args.dueDay) && !dueDay)) {
    warnings.push('Bill and due days should be 1–31; left blank')
  } else {
    warnings.push(`Add the ${statementDay ? 'due' : 'bill'} day to track bills; left blank`)
  }
  return null
}

function setupAccount(args, ctx, name, warnings, needs) {
  const asked = cleanText(args.accountKind, 20).toLowerCase()
  const bank = cleanText(args.bank, 40)
  const kind = ACCOUNT_KINDS.some((k) => k.id === asked) ? asked : guessKind(`${name} ${bank} ${asked}`)
  let last4 = String(args.last4 ?? '').replace(/\D/g, '')
  if (last4 && last4.length !== 4) {
    warnings.push('Last 4 digits should be exactly 4 digits; left blank')
    last4 = ''
  }
  let balance = given(args.balance) ? parseMoney(args.balance) : 0
  if (!Number.isFinite(balance)) {
    warnings.push('Couldn’t read the balance; set to ₹0')
    balance = 0
  }
  if (kind === 'credit') balance = Math.abs(balance)
  if (Math.abs(balance) >= 1e10) needs.push('Balance looks too large')
  if (duplicate(ctx.state.accounts, name)) warnings.push(`You already have an account called ${name}`)
  const cash = kind === 'cash'
  // Same shape as a saved account: a credit card's opening balance is what you owe, negated.
  const prefill = { name, kind, bank: cash ? '' : bank, last4: cash ? '' : last4, opening: round2(kind === 'credit' ? -balance : balance) || 0 }
  const cycle = kind === 'credit' ? cardCycle(args, warnings) : null
  if (cycle) Object.assign(prefill, cycle)
  const shown = kind === 'credit' ? `${formatINR(balance)} due` : `balance ${formatINR(balance)}`
  const days = cycle ? ` · bill day ${cycle.statementDay}, due day ${cycle.dueDay}` : ''
  return { prefill, summary: `New ${accountKindLabel(kind)} account · ${name}${prefill.bank ? ` (${prefill.bank})` : ''} · ${shown}${days}` }
}

function setupLoan(args, ctx, name, warnings, needs) {
  const emi = parseMoney(args.emi)
  if (!(emi > 0)) needs.push('EMI amount?')
  else if (emi >= MAX_AMOUNT) needs.push('EMI looks too large')
  const tenure = Math.round(parseMoney(args.tenure))
  const tenureOk = tenure >= 1 && tenure <= 600
  if (!tenureOk) needs.push('Number of EMIs?')
  let paidBefore = Math.round(parseMoney(args.paidBefore))
  if (!(paidBefore > 0)) paidBefore = 0
  paidBefore = Math.min(paidBefore, tenureOk ? tenure : 600)
  const thisMonth = monthOf(ctx.today)
  let startMonth = ''
  if (given(args.startMonth)) {
    const parsed = monthArg(args.startMonth, ctx.today)
    if (parsed.error) warnings.push(`Couldn’t read the start month “${cleanText(args.startMonth, 20)}”`)
    else startMonth = parsed.month
  }
  if (!startMonth && paidBefore > 0) {
    startMonth = addMonths(thisMonth, -paidBefore)
    warnings.push(`Start month assumed ${monthLabel(startMonth, 'short')}; check it`)
  }
  startMonth ||= thisMonth
  let dueDay = Math.round(parseMoney(args.dueDay))
  if (!(dueDay >= 1 && dueDay <= 31)) {
    if (given(args.dueDay)) warnings.push('Due day should be 1–31; used the 5th')
    dueDay = 5
  }
  let rate = given(args.rate) ? parseMoney(String(args.rate).replace(/%/g, '')) : NaN
  if (!(rate >= 0 && rate <= 60)) {
    if (given(args.rate)) warnings.push('Interest should be 0–60% a year; left blank')
    rate = ''
  }
  let principal = given(args.principal) ? parseMoney(args.principal) : NaN
  if (!(principal >= 0 && principal < 1e10)) {
    if (given(args.principal)) warnings.push('Couldn’t read the principal; left blank')
    principal = ''
  }
  const home = ctx.state.accounts.find((a) => a.kind === 'salary' || a.kind === 'savings')
  const accountId = pickAccount(args.account, ctx.state.accounts, warnings, home?.id || '')
  const lender = cleanText(args.lender, 40)
  if (duplicate(ctx.state.loans, name)) warnings.push(`You already have a loan called ${name}`)
  const prefill = { name, lender, emi: emi > 0 ? round2(emi) : '', tenure: tenureOk ? tenure : '', paidBefore, startMonth, dueDay, rate, principal, accountId }
  const plan = `${emi > 0 ? formatINR(emi) : '₹?'} × ${tenureOk ? tenure : '?'}`
  return { prefill, summary: `New loan · ${name}${lender ? ` (${lender})` : ''} · ${plan} · ${paidBefore} paid · from ${monthLabel(startMonth, 'short')}` }
}

function setupGoal(args, ctx, name, warnings, needs) {
  const target = parseMoney(args.target)
  if (!(target >= 1)) needs.push('Target amount?')
  else if (target >= 1e10) needs.push('Target looks too large')
  let saved = given(args.saved) ? parseMoney(args.saved) : 0
  if (!(saved >= 0)) {
    warnings.push('Couldn’t read the amount saved; set to ₹0')
    saved = 0
  }
  let deadline = ''
  if (given(args.deadline)) {
    const thisMonth = monthOf(ctx.today)
    let { month } = monthArg(args.deadline, ctx.today)
    // "by March" means the next March, not the last one.
    if (month && month < thisMonth && !/\d{4}/.test(String(args.deadline))) month = addMonths(month, 12)
    if (month && month >= thisMonth) deadline = month
    else warnings.push('Deadline should be a future month (YYYY-MM); left blank')
  }
  if (duplicate(ctx.state.goals, name)) warnings.push(`You already have a goal called ${name}`)
  const prefill = { name, target: target >= 1 ? round2(target) : '', saved: round2(saved), deadline }
  const by = deadline ? ` · by ${monthLabel(deadline, 'short')}` : ''
  return { prefill, summary: `New goal · ${name} · ${target >= 1 ? formatINR(target) : '₹?'} · ${formatINR(saved)} saved${by}` }
}

const SETUPS = { account: setupAccount, loan: setupLoan, goal: setupGoal }

function proposeSetup(args, ctx) {
  const kind = String(args.kind ?? '').trim().toLowerCase()
  if (!SETUPS[kind]) return fail('kind must be account, loan or goal.')
  const name = cleanName(args.name)
  if (!name) return fail(`Give the ${kind} a name.`)
  const warnings = []
  const needs = []
  const { prefill, summary } = SETUPS[kind](args, ctx, name, warnings, needs)
  return proposal([makeDraft('setup', { setup: kind, prefill }, { warnings, needs, summary })])
}

export const WRITERS = {
  propose_entries: proposeEntries,
  propose_update_entry: proposeUpdate,
  propose_delete_entry: proposeDelete,
  propose_budget: proposeBudget,
  propose_goal_contribution: proposeContribution,
  propose_setup: proposeSetup,
}
