// Turns loose entry descriptions ({type, amount, person: "ravi", …}) into checked
// draft entries with warnings. Nothing here touches state; drafts are confirmed in the UI.
import { categoryMeta, PEOPLE_TYPES, TYPE_META } from '../lib/categories'
import { monthLabel, monthOf } from '../lib/dates'
import { formatINR, round2 } from '../lib/format'
import { uid } from '../lib/id'
import { ACCOUNT_SIGN, describeTxn, PERSON_SIGN, recentAccountId } from '../lib/selectors'
import { guessCategory, resolveAccount, resolveCategory, resolveLoan, resolvePerson } from './resolve'
import { ENTRY_TYPES } from './tools'
import { cleanText, parseDate, parseMoney } from './parse'

export const MAX_ENTRIES = 8
export const MAX_AMOUNT = 1e9
export const EPS = 0.005
const NOTE_MAX = 140

export function makeDraft(kind, data, { warnings = [], needs = [], summary = '' } = {}) {
  return { id: uid('dr'), kind, status: 'pending', data, warnings, needsEdit: needs.join(' · '), summary }
}

/** Tool result for `propose_*`: short draft summaries for the model, full drafts for the UI. */
export function proposal(drafts, errors = []) {
  if (!drafts.length) return { result: { ok: false, error: errors.join(' ') || 'Nothing to draft.' }, drafts: [] }
  const result = {
    ok: true,
    drafts: drafts.map((d, i) => ({
      ref: `D${i + 1}`,
      summary: d.summary,
      ...(d.warnings.length ? { warnings: d.warnings } : {}),
      ...(d.needsEdit ? { needs: d.needsEdit } : {}),
    })),
    ...(errors.length ? { errors } : {}),
    note: 'Shown to the user as draft cards. Nothing is saved until they confirm.',
  }
  return { result, drafts }
}

export function ambiguity(query, hit) {
  return `“${query}” could be ${hit.ambiguous.map((item) => item.name).join(' or ')}; picked ${hit.item.name}`
}

/** Running totals so several drafts in one reply see each other (budgets, balances, dues). */
export const newBatch = () => ({ spent: new Map(), flow: new Map(), owed: new Map(), people: new Map(), emis: new Set() })
const bump = (map, key, by) => map.set(key, round2((map.get(key) || 0) + by))
const personKey = (data) => data.personId || `new:${data.personName.toLowerCase()}`

export function pickAccount(query, accounts, warnings, fallbackId) {
  const q = cleanText(query, 60)
  const fallback = accounts.find((a) => a.id === fallbackId)
  if (!q) return fallback ? fallback.id : ''
  const hit = resolveAccount(q, accounts)
  if (hit) {
    if (hit.ambiguous.length) warnings.push(ambiguity(q, hit))
    return hit.item.id
  }
  warnings.push(fallback ? `No account matches “${q}”; used ${fallback.name}` : `No account matches “${q}”`)
  return fallback ? fallback.id : ''
}

function pickLoan(raw, ctx, data, warnings, needs) {
  const { state, derived } = ctx
  const query = cleanText(raw.loan, 60)
  const hit = query ? resolveLoan(query, state.loans) : null
  if (hit?.ambiguous.length) warnings.push(ambiguity(query, hit))
  if (hit) return hit.item
  const active = derived.loans.filter((status) => !status.done)
  if (active.length === 1) {
    if (query) warnings.push(`No loan called “${query}”; used ${active[0].loan.name}`)
    return active[0].loan
  }
  if (state.loans.length) needs.push(query ? `No loan called “${query}”; pick one` : 'Which loan?')
  else warnings.push('No loans set up yet, so this EMI isn’t linked to one')
  return null
}

function checkEmi(loan, amount, ctx, data, warnings, { excludeId, original, batch }) {
  const status = ctx.derived.loans.find((s) => s.loan.id === loan.id)
  const month = monthOf(data.date)
  if (status?.done && original?.loanId !== loan.id) warnings.push(`${loan.name} is already paid off`)
  else if (status?.payments.some((t) => t.id !== excludeId && t.date.startsWith(month)) || batch.emis.has(`${loan.id}|${month}`)) {
    warnings.push(`${loan.name} EMI already logged for ${monthLabel(month)}`)
  }
  if (!amount) return loan.emi
  if (Math.abs(amount - loan.emi) > 0.5) warnings.push(`EMI is usually ${formatINR(loan.emi)}`)
  return amount
}

function pickPerson(raw, ctx, data, warnings, needs, batch) {
  const query = cleanText(raw.person, 60)
  const hit = query ? resolvePerson(query, ctx.state.people) : null
  if (!hit) return needs.push('Who was it with?')
  if (hit.isNew) {
    const key = hit.name.toLowerCase()
    data.personName = batch.people.get(key) || hit.name
    batch.people.set(key, data.personName)
    const similar = hit.similar.length ? ` (did you mean ${hit.similar.join(' or ')}?)` : ''
    return warnings.push(`New person: ${data.personName}${similar}`)
  }
  data.personId = hit.item.id
  data.personName = hit.item.name
  if (hit.ambiguous.length) warnings.push(ambiguity(query, hit))
}

/** Fills a missing collect/repay amount with what's due and flags paying more than that. */
function checkDues(amount, ctx, data, warnings, { original, batch }) {
  let net = data.personId ? ctx.derived.people.find((p) => p.id === data.personId)?.net || 0 : 0
  if (original?.personId && original.personId === data.personId) net -= (PERSON_SIGN[original.type] || 0) * original.amount
  net += batch.owed.get(personKey(data)) || 0
  const collect = data.type === 'collect'
  const owed = round2(collect ? net : -net)
  const who = data.personName
  if (!amount && owed > EPS) {
    warnings.push(collect ? `Amount set to the full ${formatINR(owed)} ${who} owes you` : `Amount set to the full ${formatINR(owed)} you owe ${who}`)
    return owed
  }
  if (owed <= EPS) warnings.push(collect ? `${who} doesn’t owe you anything` : `You don’t owe ${who} anything`)
  else if (amount > owed + EPS) warnings.push(collect ? `${who} only owes you ${formatINR(owed)}` : `You only owe ${who} ${formatINR(owed)}`)
  return amount
}

function pickAccounts(raw, ctx, data, warnings, needs, original, loan) {
  const { state, derived } = ctx
  const accounts = state.accounts
  if (data.type === 'transfer') {
    data.toAccountId = pickAccount(raw.toAccount, accounts, warnings, original ? original.toAccountId : '')
    const others = accounts.filter((a) => a.id !== data.toAccountId)
    data.accountId = pickAccount(raw.account, accounts, warnings, original ? original.accountId : recentAccountId(derived.sorted, others, ['transfer']))
    if (!data.toAccountId) needs.push('Which account did it go to?')
    if (!data.accountId) needs.push('Which account did it come from?')
    else if (data.accountId === data.toAccountId) needs.push('Pick two different accounts')
    return
  }
  let fallback
  if (original) fallback = original.accountId || ''
  else if (loan && accounts.some((a) => a.id === loan.accountId)) fallback = loan.accountId
  else fallback = recentAccountId(derived.sorted, accounts, [data.type])
  data.accountId = pickAccount(raw.account, accounts, warnings, fallback)
}

function checkBudget(ctx, data, warnings, { excludeId, batch }) {
  const limit = ctx.state.budgets[data.category]
  if (!(limit > 0)) return
  const month = monthOf(data.date)
  let before = batch.spent.get(`${month}|${data.category}`) || 0
  for (const t of ctx.state.transactions) {
    if (t.type === 'expense' && t.id !== excludeId && t.date.startsWith(month) && (t.category || 'other') === data.category) before += t.amount
  }
  before = round2(before)
  const label = categoryMeta(data.category).label
  if (before > limit) warnings.push(`${label} budget is already over (${formatINR(before)} of ${formatINR(limit)})`)
  else if (before + data.amount > limit) warnings.push(`Crosses your ${label} budget by ${formatINR(round2(before + data.amount - limit))}`)
}

function checkOverdraft(ctx, data, warnings, batch) {
  const outId = data.type === 'transfer' || ACCOUNT_SIGN[data.type] < 0 ? data.accountId : ''
  const account = outId && ctx.state.accounts.find((a) => a.id === outId)
  if (!account || account.kind === 'credit') return
  const balance = round2((ctx.derived.balances.get(account.id) || 0) + (batch.flow.get(account.id) || 0))
  if (balance - data.amount < -EPS) warnings.push(`${account.name} would go below zero (balance ${formatINR(balance)})`)
}

function record(data, batch) {
  if (data.type === 'emi' && data.loanId) batch.emis.add(`${data.loanId}|${monthOf(data.date)}`)
  if (!data.amount) return
  if (data.type === 'expense') bump(batch.spent, `${monthOf(data.date)}|${data.category}`, data.amount)
  if (data.type === 'transfer') {
    if (data.accountId) bump(batch.flow, data.accountId, -data.amount)
    if (data.toAccountId) bump(batch.flow, data.toAccountId, data.amount)
  } else if (data.accountId && ACCOUNT_SIGN[data.type]) bump(batch.flow, data.accountId, ACCOUNT_SIGN[data.type] * data.amount)
  if (PERSON_SIGN[data.type] && (data.personId || data.personName)) bump(batch.owed, personKey(data), PERSON_SIGN[data.type] * data.amount)
}

/**
 * One loose entry → `{data, warnings, needs}` or `{error}`. `data` matches a transaction
 * (plus `personName` for people not saved yet). `original` is the entry being edited.
 */
export function buildEntry(raw, ctx, { excludeId = '', original = null, batch = newBatch() } = {}) {
  const type = String(raw?.type ?? '').trim().toLowerCase()
  if (!ENTRY_TYPES.includes(type)) return { error: `type must be one of ${ENTRY_TYPES.join(', ')}` }
  const warnings = []
  const needs = []
  const options = { excludeId, original, batch }
  let amount = Math.abs(parseMoney(raw.amount))
  if (!Number.isFinite(amount)) amount = 0
  const when = parseDate(raw.date, ctx.today)
  if (when.warning) warnings.push(when.warning)
  const data = { type, amount: 0, date: when.date, note: cleanText(raw.note, NOTE_MAX), category: '', accountId: '', toAccountId: '', personId: '', personName: '', loanId: '' }

  let loan = null
  if (type === 'emi') {
    data.category = 'emi'
    loan = pickLoan(raw, ctx, data, warnings, needs)
    if (loan) {
      data.loanId = loan.id
      amount = checkEmi(loan, amount, ctx, data, warnings, options)
    }
  } else if (type === 'expense' || type === 'income') {
    const given = cleanText(raw.category, 40)
    const known = resolveCategory(given, type)
    data.category = known || guessCategory(data.note, type) || (type === 'income' ? 'other_in' : 'other')
    if (given && !known) warnings.push(`Unknown category “${given}”; filed under ${categoryMeta(data.category).label}`)
  }
  if (PEOPLE_TYPES.includes(type)) pickPerson(raw, ctx, data, warnings, needs, batch)
  if ((type === 'collect' || type === 'repay') && data.personName) amount = checkDues(amount, ctx, data, warnings, options)

  data.amount = round2(amount)
  if (!data.amount) needs.push('Amount missing')
  else if (data.amount >= MAX_AMOUNT) needs.push('Amount looks too large')
  pickAccounts(raw, ctx, data, warnings, needs, original, loan)

  if (data.amount) {
    if (type === 'expense') checkBudget(ctx, data, warnings, options)
    const twin = ctx.derived.sorted.find((t) => t.id !== excludeId && t.type === type && t.date === data.date && Math.abs(t.amount - data.amount) < EPS)
    if (twin) warnings.push(`Looks like a repeat of “${describeTxn(twin, ctx.derived.lookups).title}” on the same day`)
    if (!original) checkOverdraft(ctx, data, warnings, batch)
  }
  record(data, batch)
  return { data, warnings, needs }
}

export function entrySummary(data, { derived }) {
  const account = (id) => derived.lookups.accounts.get(id)?.name || ''
  const parts = [TYPE_META[data.type]?.label || data.type, data.amount ? formatINR(data.amount) : 'amount ?']
  if (data.type === 'expense' || data.type === 'income') parts.push(categoryMeta(data.category).label)
  else if (data.type === 'emi') parts.push(derived.lookups.loans.get(data.loanId)?.name || 'no loan')
  else if (PEOPLE_TYPES.includes(data.type)) parts.push(data.personName ? `${data.personName}${data.personId ? '' : ' (new)'}` : '?')
  if (data.type === 'transfer') parts.push(`${account(data.accountId) || '?'} → ${account(data.toAccountId) || '?'}`)
  else if (data.accountId) parts.push(account(data.accountId))
  parts.push(data.date)
  if (data.note) parts.push(`“${data.note}”`)
  return parts.join(' · ')
}

/** Several loose entries → entry drafts sharing one batch, plus per-entry errors. */
export function draftEntries(list, ctx, { batch = newBatch() } = {}) {
  const drafts = []
  const errors = []
  list.slice(0, MAX_ENTRIES).forEach((raw, i) => {
    const built = raw && typeof raw === 'object' ? buildEntry(raw, ctx, { batch }) : { error: 'each entry must be an object' }
    if (built.error) errors.push(`Entry ${i + 1}: ${built.error}.`)
    else drafts.push(makeDraft('entry', built.data, { ...built, summary: entrySummary(built.data, ctx) }))
  })
  if (list.length > MAX_ENTRIES) errors.push(`Only ${MAX_ENTRIES} entries at a time; ${list.length - MAX_ENTRIES} skipped.`)
  return { drafts, errors }
}
