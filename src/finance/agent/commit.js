import { ACCOUNT_KINDS, categoryMeta, EXPENSE_IDS, INCOME_IDS, PEOPLE_TYPES, TONES, TYPE_META } from '../lib/categories'
import { isISODate, isMonth, monthOf } from '../lib/dates'
import { formatINR, plural, round2 } from '../lib/format'
import { stamp, uid } from '../lib/id'
import { PERSON_SIGN } from '../lib/selectors'

const EPS = 0.005
const isPeople = (type) => PEOPLE_TYPES.includes(type)
const hasCategory = (type) => type === 'expense' || type === 'income'
const text = (value, max) => String(value ?? '').trim().slice(0, max)
const firstError = (errors) => Object.values(errors)[0] || ''
const failed = (error) => ({ ok: false, error })

/** Colour a new account, loan or goal gets, so forms and the assistant pick the same one. */
export function nextTone(kind, state) {
  if (kind === 'account') return TONES[(state.accounts.length * 3 + 5) % TONES.length]
  if (kind === 'loan') return TONES[(state.loans.length + 8) % TONES.length]
  return TONES[(state.goals.length * 2 + 3) % TONES.length]
}

/** Checks a ready-to-save entry against the data as it is now. Returns {field: message}. */
export function validateEntry(entry, state) {
  const errors = {}
  const amount = Number(entry.amount)
  if (!TYPE_META[entry.type]) errors.type = 'Unknown entry type.'
  if (!(amount > 0)) errors.amount = 'The amount must be above zero.'
  else if (amount >= 1e9) errors.amount = 'Keep it under ₹100 crore.'
  if (entry.type === 'expense' && !EXPENSE_IDS.has(entry.category)) errors.category = 'Pick a category.'
  if (entry.type === 'income' && !INCOME_IDS.has(entry.category)) errors.category = 'Pick a category.'
  const hasAccount = (id) => state.accounts.some((a) => a.id === id)
  if (entry.accountId && !hasAccount(entry.accountId)) errors.accountId = 'That account no longer exists.'
  if (entry.type === 'transfer') {
    if (!entry.accountId) errors.accountId = 'Where did the money leave from?'
    if (!entry.toAccountId) errors.toAccountId = 'Where did it go?'
    else if (!hasAccount(entry.toAccountId)) errors.toAccountId = 'That account no longer exists.'
    else if (entry.toAccountId === entry.accountId) errors.toAccountId = 'Pick two different accounts.'
  }
  if (isPeople(entry.type)) {
    if (entry.personId) {
      if (!state.people.some((p) => p.id === entry.personId)) errors.personId = 'That person no longer exists.'
    } else if (!text(entry.personName, 40)) {
      errors.personId = 'Who was it with?'
    }
  }
  if (entry.type === 'emi' && entry.loanId && !state.loans.some((l) => l.id === entry.loanId)) {
    errors.loanId = 'That loan no longer exists.'
  }
  if (!isISODate(entry.date)) errors.date = 'Pick a date.'
  return errors
}

/** The confetti moments for a new entry: an EMI paid (or the last one) and a person settled up. */
export function celebrateEntry(ui, derived, record, personBefore) {
  if (record.type === 'emi' && record.loanId) {
    const status = derived.loans.find((s) => s.loan.id === record.loanId)
    if (!status || status.done) return
    const left = status.remaining - 1
    if (left <= 0) ui.celebrate('paidoff', `${status.loan.name} is fully paid off`)
    else ui.celebrate('emi', `${status.loan.name} · ${plural(left, 'EMI')} to go`)
  } else if (personBefore && Math.abs(personBefore.net) >= EPS) {
    const after = round2(personBefore.net + PERSON_SIGN[record.type] * record.amount)
    if (Math.abs(after) < EPS) ui.celebrate('settled', `All square with ${personBefore.name}`)
  }
}

/**
 * Finds or creates the person; peopleCache (lowercased name → id) stops a batch adding someone twice.
 * `created` is true only for the entry that added them, so its undo can take them out again.
 */
function personFor({ dispatch, derived }, input, peopleCache) {
  const none = { personId: '', before: null, name: '', created: false }
  if (!isPeople(input.type)) return none
  if (input.personId) {
    const before = derived.people.find((p) => p.id === input.personId) || null
    return { ...none, personId: input.personId, before, name: before?.name || '' }
  }
  const name = text(input.personName, 40)
  const key = name.toLowerCase()
  const cached = peopleCache?.get(key)
  if (cached) return { ...none, personId: cached, name }
  const existing = derived.people.find((p) => p.name.toLowerCase() === key)
  if (existing) return { ...none, personId: existing.id, before: existing, name: existing.name }
  const personId = uid('p')
  dispatch({ type: 'person/add', person: { id: personId, name } })
  peopleCache?.set(key, personId)
  return { ...none, personId, name, created: true }
}

/** What the toast names after the amount: the category, person or loan rather than repeating the verb. */
function toastSubject(record, derived, personName) {
  const { type } = record
  if (hasCategory(type)) return categoryMeta(record.category).short
  if (isPeople(type) && personName) return personName
  const loan = type === 'emi' ? derived.loans.find((s) => s.loan.id === record.loanId)?.loan : null
  return loan?.name || TYPE_META[type].label
}

/**
 * Saves a new entry, or replaces `original`, from plain values (amount already a number).
 * Shared by the entry form and the assistant's draft cards. `quiet` skips the toast and confetti
 * so "Confirm all" can show one toast that undoes the whole batch.
 */
export function commitEntry({ dispatch, derived, ui }, input, { original = null, peopleCache = null, quiet = false } = {}) {
  const { type } = input
  const { personId, before, name: personName, created } = personFor({ dispatch, derived }, input, peopleCache)
  const amount = round2(Number(input.amount))
  const record = {
    id: original?.id || uid('t'),
    type,
    amount,
    date: input.date,
    note: text(input.note, 140),
    category: hasCategory(type) ? input.category : type === 'emi' ? 'emi' : '',
    accountId: input.accountId || '',
    toAccountId: type === 'transfer' ? input.toAccountId || '' : '',
    personId,
    loanId: type === 'emi' ? input.loanId || '' : '',
    createdAt: original?.createdAt || stamp(),
  }
  const undo = () => {
    dispatch(original ? { type: 'txn/update', txn: original } : { type: 'txn/delete', id: record.id })
    if (created) dispatch({ type: 'person/delete', id: personId, ifUnused: true })
  }
  dispatch(original ? { type: 'txn/update', txn: record } : { type: 'txn/add', txn: record })

  if (!quiet) {
    const what = toastSubject(record, derived, personName)
    const amountText = ui.privacy ? '' : ` ${formatINR(amount)}`
    const action = { label: 'Undo', run: undo }
    if (original) {
      ui.toast(`Updated${amountText} · ${what}`, { tone: 'sky', action })
    } else {
      ui.toast(`${TYPE_META[type].verb}${amountText} · ${what}`, { tone: TYPE_META[type].tone, action })
      celebrateEntry(ui, derived, record, before)
    }
  }
  return { ok: true, record, personId, undo }
}

function commitDelete({ state, dispatch, ui }, id, quiet) {
  const txn = state.transactions.find((t) => t.id === id)
  if (!txn) return failed('That entry is already gone.')
  dispatch({ type: 'txn/delete', id })
  const undo = () => dispatch({ type: 'txn/restore', txn })
  if (!quiet) ui.toast('Entry deleted', { tone: 'rose', action: { label: 'Undo', run: undo } })
  return { ok: true, undo }
}

function commitBudget({ state, dispatch, ui }, { category, amount }, quiet) {
  if (!EXPENSE_IDS.has(category)) return failed('Unknown spending category.')
  const value = round2(Number(amount))
  if (!(value >= 0) || value >= 1e9) return failed('That budget amount doesn’t work.')
  const previous = state.budgets[category] || 0
  dispatch({ type: 'budget/set', id: category, amount: value })
  const undo = () => dispatch({ type: 'budget/set', id: category, amount: previous })
  if (!quiet) {
    const label = categoryMeta(category).short
    let message = `${label} budget removed`
    if (value > 0) message = ui.privacy ? `${label} budget saved` : `${label} budget set to ${formatINR(value)}`
    ui.toast(message, { tone: 'lilac', action: { label: 'Undo', run: undo } })
  }
  return { ok: true, undo }
}

function commitContribution({ state, dispatch, ui }, { goalId, amount }, quiet) {
  const goal = state.goals.find((g) => g.id === goalId)
  if (!goal) return failed('That goal no longer exists.')
  const value = round2(Number(amount))
  if (!value || !Number.isFinite(value) || Math.abs(value) >= 1e9) return failed('That amount doesn’t work.')
  if (value < 0 && -value > goal.saved + EPS) return failed(`${goal.name} only has ${formatINR(goal.saved)} saved.`)
  dispatch({ type: 'goal/contribute', id: goal.id, amount: value })
  const undo = () => dispatch({ type: 'goal/contribute', id: goal.id, amount: -value })
  if (!quiet) {
    if (goal.saved < goal.target && goal.saved + value >= goal.target) ui.celebrate('goal', goal.name)
    const into = value > 0
    let words = into ? 'Money added to' : 'Money taken out of'
    if (!ui.privacy) words = `${formatINR(Math.abs(value))} ${into ? 'added to' : 'taken out of'}`
    ui.toast(`${words} ${goal.name}`, { tone: into ? 'mint' : 'peach', action: { label: 'Undo', run: undo } })
  }
  return { ok: true, undo }
}

const whole = (value) => (typeof value === 'number' ? value : /^\d+$/.test(String(value).trim()) ? Number(value) : NaN)
const given = (value) => value !== '' && value != null
const isDay = (value) => Number.isInteger(whole(value)) && whole(value) >= 1 && whole(value) <= 31

/** Same rules as the account, loan and goal forms. Returns {field: message}. */
export function validateSetup(kind, prefill, { state, today }) {
  const p = prefill || {}
  const errors = {}
  if (!text(p.name, 40)) errors.name = 'It needs a name.'
  if (kind === 'account') {
    if (!ACCOUNT_KINDS.some((k) => k.id === p.kind)) errors.kind = 'Pick the kind of account.'
    if (!Number.isFinite(Number(p.opening)) || Math.abs(Number(p.opening)) >= 1e10) errors.opening = 'That balance doesn’t work.'
    if (p.last4 && !/^\d{4}$/.test(p.last4)) errors.last4 = 'Four digits, or leave it empty.'
    // A card's bill cycle is optional, but needs both days.
    if (p.kind === 'credit' && (given(p.statementDay) || given(p.dueDay))) {
      if (!isDay(p.statementDay)) errors.statementDay = 'Bill day should be 1 to 31.'
      if (!isDay(p.dueDay)) errors.dueDay = 'Due day should be 1 to 31.'
    }
  } else if (kind === 'loan') {
    const tenure = whole(p.tenure)
    const paidBefore = p.paidBefore === '' || p.paidBefore == null ? 0 : whole(p.paidBefore)
    const dueDay = whole(p.dueDay)
    if (!(Number(p.emi) > 0)) errors.emi = 'How much is each EMI?'
    if (!(tenure >= 1 && tenure <= 600)) errors.tenure = 'How many EMIs in all (1 to 600)?'
    if (!isMonth(p.startMonth)) errors.startMonth = 'Which month was the first EMI?'
    if (!(dueDay >= 1 && dueDay <= 31)) errors.dueDay = 'Due day should be 1 to 31.'
    if (!(paidBefore >= 0)) errors.paidBefore = 'EMIs already paid should be a whole number.'
    else if (tenure >= 1 && paidBefore > tenure) errors.paidBefore = 'More EMIs paid than the tenure.'
    const rate = p.rate === '' || p.rate == null ? 0 : Number(p.rate)
    if (!(rate >= 0 && rate <= 60)) errors.rate = 'Interest should be 0 to 60% a year.'
    const principal = p.principal === '' || p.principal == null ? 0 : Number(p.principal)
    if (!(principal >= 0)) errors.principal = 'That loan amount doesn’t work.'
    if (p.accountId && !state.accounts.some((a) => a.id === p.accountId)) errors.accountId = 'That account no longer exists.'
  } else if (kind === 'goal') {
    if (!(Number(p.target) >= 1)) errors.target = 'How much do you need?'
    if (!(Number(p.saved || 0) >= 0)) errors.saved = 'Saved so far can’t be negative.'
    if (p.deadline && !isMonth(p.deadline)) errors.deadline = 'Deadline should be a month.'
    else if (p.deadline && p.deadline < monthOf(today)) errors.deadline = 'The deadline has already passed.'
  } else {
    errors.kind = 'Unknown setup.'
  }
  return errors
}

function commitSetup(ctx, kind, prefill, quiet) {
  const { state, dispatch, ui } = ctx
  const problem = firstError(validateSetup(kind, prefill, ctx))
  if (problem) return failed(problem)
  const name = text(prefill.name, 40)
  let undo
  let message
  let tone
  if (kind === 'account') {
    const banked = prefill.kind !== 'cash'
    const account = {
      id: uid('a'),
      name,
      kind: prefill.kind,
      bank: banked ? text(prefill.bank, 40) : '',
      last4: banked ? prefill.last4 || '' : '',
      opening: round2(Number(prefill.opening) || 0),
      color: nextTone('account', state),
      ...(prefill.kind === 'credit' && isDay(prefill.statementDay) && isDay(prefill.dueDay)
        ? { statementDay: whole(prefill.statementDay), dueDay: whole(prefill.dueDay) }
        : {}),
    }
    dispatch({ type: 'account/add', account })
    undo = () => dispatch({ type: 'account/delete', id: account.id })
    message = `${name} added`
    tone = 'butter'
  } else if (kind === 'loan') {
    const loan = {
      id: uid('l'),
      name,
      lender: text(prefill.lender, 40),
      emi: round2(Number(prefill.emi)),
      tenure: whole(prefill.tenure),
      paidBefore: prefill.paidBefore === '' || prefill.paidBefore == null ? 0 : whole(prefill.paidBefore),
      startMonth: prefill.startMonth,
      dueDay: whole(prefill.dueDay),
      rate: Number(prefill.rate) || 0,
      principal: round2(Number(prefill.principal) || 0),
      accountId: prefill.accountId || '',
      color: nextTone('loan', state),
    }
    dispatch({ type: 'loan/add', loan })
    undo = () => dispatch({ type: 'loan/delete', id: loan.id })
    message = `${name} added. Tap “Mark paid” each month.`
    tone = 'coral'
  } else {
    const goal = {
      id: uid('g'),
      name,
      target: round2(Number(prefill.target)),
      saved: round2(Number(prefill.saved) || 0),
      deadline: prefill.deadline || '',
      color: nextTone('goal', state),
    }
    dispatch({ type: 'goal/add', goal })
    undo = () => dispatch({ type: 'goal/delete', id: goal.id })
    message = `${name} jar is ready`
    tone = 'sky'
    if (!quiet && goal.saved >= goal.target) ui.celebrate('goal', name)
  }
  if (!quiet) ui.toast(message, { tone, action: { label: 'Undo', run: undo } })
  return { ok: true, undo }
}

// ---- captured payments (Android app) ------------------------------------------------------------
// ctx.inbox: {find(id), markFiled(id, entryIds), restore(id), dismiss(id), learn(key, rule) → previous rule,
// setRule(key, rule | null)}. The native calls run in the background; the book changes here, synchronously.

const noInbox = () => failed('Captured payments are only in the Gullak app.')

function openSpend(ctx, id) {
  const spend = ctx.inbox?.find(id)
  if (!spend) return { error: 'That payment is no longer waiting.' }
  if (spend.status !== 'unfiled') return { error: 'That payment is already filed.' }
  return { spend }
}

const filedWords = (ctx, data) => `${ctx.ui.privacy ? 'Filed' : `Filed ${formatINR(data.amount)}`} · ${data.title}`

function commitSpendFile(ctx, data, { quiet, peopleCache }) {
  if (!ctx.inbox) return noInbox()
  const { spend, error } = openSpend(ctx, data.spendId)
  if (error) return failed(error)
  const entries = Array.isArray(data.entries) ? data.entries : []
  if (!entries.length) return failed('Nothing to file.')
  for (const entry of entries) {
    const problem = firstError(validateEntry(entry, ctx.state))
    if (problem) return failed(problem)
  }
  const cache = peopleCache || new Map()
  const saved = entries.map((entry) => commitEntry(ctx, entry, { peopleCache: cache, quiet: true }))
  ctx.inbox.markFiled(spend.id, saved.map((r) => r.record.id))
  const learned = data.rule?.key ? { previous: ctx.inbox.learn(data.rule.key, data.rule) } : null
  const undo = () => {
    ;[...saved].reverse().forEach((r) => r.undo())
    ctx.inbox.restore(spend.id)
    if (learned) ctx.inbox.setRule(data.rule.key, learned.previous || null)
  }
  if (!quiet) ctx.ui.toast(filedWords(ctx, data), { tone: 'lime', action: { label: 'Undo', run: undo } })
  return { ok: true, undo, record: saved[0].record }
}

function commitSpendLink(ctx, data, quiet) {
  if (!ctx.inbox) return noInbox()
  const { spend, error } = openSpend(ctx, data.spendId)
  if (error) return failed(error)
  if (!ctx.state.transactions.some((t) => t.id === data.entryId)) return failed('That entry no longer exists.')
  ctx.inbox.markFiled(spend.id, [data.entryId])
  const undo = () => ctx.inbox.restore(spend.id)
  if (!quiet) ctx.ui.toast(`Already in the book · ${data.title}`, { tone: 'sky', action: { label: 'Undo', run: undo } })
  return { ok: true, undo }
}

function commitSpendDismiss(ctx, data, quiet) {
  if (!ctx.inbox) return noInbox()
  const { spend, error } = openSpend(ctx, data.spendId)
  if (error) return failed(error)
  ctx.inbox.dismiss(spend.id)
  const undo = () => ctx.inbox.restore(spend.id)
  if (!quiet) ctx.ui.toast(`Set aside · ${data.title}`, { tone: 'gray', action: { label: 'Undo', run: undo } })
  return { ok: true, undo }
}

function commitSpendRule(ctx, data, quiet) {
  if (!ctx.inbox) return noInbox()
  if (!data.key || !data.rule?.type) return failed('That rule is incomplete.')
  const previous = ctx.inbox.learn(data.key, data.rule)
  const undo = () => ctx.inbox.setRule(data.key, previous || null)
  if (!quiet) {
    const label = data.rule.category ? categoryMeta(data.rule.category).short : TYPE_META[data.rule.type]?.label
    ctx.ui.toast(`Got it: ${data.label} → ${label}`, { tone: 'lilac', action: { label: 'Undo', run: undo } })
  }
  return { ok: true, undo }
}

/**
 * Applies one confirmed draft card. ctx = {state, dispatch, derived, ui, today}, read fresh at
 * confirm time so stale drafts fail politely instead of writing over newer data.
 * Returns {ok: true, undo, record?} or {ok: false, error}.
 */
export function commitDraft(ctx, draft, { peopleCache = null, quiet = false } = {}) {
  const { state } = ctx
  const data = draft?.data || {}
  switch (draft?.kind) {
    case 'entry': {
      const problem = firstError(validateEntry(data, state))
      return problem ? failed(problem) : commitEntry(ctx, data, { peopleCache, quiet })
    }
    case 'update': {
      const original = state.transactions.find((t) => t.id === data.id)
      if (!original) return failed('That entry no longer exists.')
      const problem = firstError(validateEntry(data.after, state))
      return problem ? failed(problem) : commitEntry(ctx, data.after, { original, peopleCache, quiet })
    }
    case 'delete':
      return commitDelete(ctx, data.id, quiet)
    case 'budget':
      return commitBudget(ctx, data, quiet)
    case 'contribution':
      return commitContribution(ctx, data, quiet)
    case 'setup':
      return commitSetup(ctx, data.setup, data.prefill, quiet)
    case 'spend':
      return commitSpendFile(ctx, data, { quiet, peopleCache })
    case 'spendLink':
      return commitSpendLink(ctx, data, quiet)
    case 'spendDismiss':
      return commitSpendDismiss(ctx, data, quiet)
    case 'spendRule':
      return commitSpendRule(ctx, data, quiet)
    default:
      return failed('Unknown draft.')
  }
}

/** Confirms several drafts as one batch with a single toast whose Undo reverses all of them. */
export function commitDrafts(ctx, drafts) {
  const peopleCache = new Map()
  const outcomes = drafts.map((draft) => ({ draft, ...commitDraft(ctx, draft, { peopleCache, quiet: true }) }))
  const undos = outcomes.filter((o) => o.ok).map((o) => o.undo)
  if (undos.length) {
    const failures = outcomes.length - undos.length
    const message = `Saved ${plural(undos.length, 'item')}${failures ? ` · ${failures} need a look` : ''}`
    ctx.ui.toast(message, {
      tone: 'lime',
      action: { label: 'Undo all', run: () => [...undos].reverse().forEach((undo) => undo()) },
    })
  }
  return outcomes
}
