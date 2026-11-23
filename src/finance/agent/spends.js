// Munshi's tools for captured payments (Android app only). `ctx.inbox` carries the unfiled spends and the
// device's learned rules; nothing here sees the original SMS or notification text. Writers only draft cards.
import { categoryMeta, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../lib/categories'
import { formatINR, round2 } from '../lib/format'
import { describeTxn } from '../lib/selectors'
import { findTwin, linkedEntryIds, matchAccount, rupees, spendDate, suggest } from '../inbox/enrich'
import { merchantKey, payeeName, ruleFromEntry } from '../inbox/rules'
import { draftEntries, makeDraft, proposal } from './entries'
import { cleanText, parseJSON } from './parse'
import { norm, resolveCategory } from './resolve'

const MAX_LISTED = 10
const EPS = 0.5
const OUT_TYPES = new Set(['expense', 'emi', 'lend', 'repay'])
const IN_TYPES = new Set(['income', 'borrow', 'collect'])
const fail = (error) => ({ result: { ok: false, error }, drafts: [] })

/** Unfiled spends in the order Munshi numbers them: newest first, S1, S2… */
export function unfiledSpends(inbox) {
  return (inbox?.spends || []).filter((s) => s.status === 'unfiled').sort((a, b) => b.at - a.at)
}

/** "S2", "s2", the id, or the only one when there is just one. */
export function findSpend(ref, inbox) {
  const list = unfiledSpends(inbox)
  const text = String(ref ?? '').trim()
  const numbered = /^s?(\d{1,3})$/i.exec(text)
  if (numbered) return list[Number(numbered[1]) - 1] || null
  if (text) return list.find((s) => s.id === text) || null
  return list.length === 1 ? list[0] : null
}

export const spendRef = (spend, inbox) => `S${unfiledSpends(inbox).findIndex((s) => s.id === spend.id) + 1}`

function clock(at) {
  const date = new Date(at)
  return `${spendDate({ at })} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function accountLabel(spend, ctx) {
  const { account } = matchAccount(spend, ctx.state.accounts, ctx.inbox?.book?.aliases)
  if (account) return account.name
  return spend.account ? `${spend.bank ? `${spend.bank} ` : ''}••${spend.account}` : ''
}

/** One captured payment as Munshi sees it: parsed fields and the user's note, never the message itself. */
export function spendFacts(spend, ctx, ref) {
  const book = ctx.inbox?.book || { rules: {}, aliases: {} }
  const tip = suggest(spend, { book, accounts: ctx.state.accounts })
  const twin = findTwin(spend, ctx.state.transactions, tip.accountId, linkedEntryIds(ctx.inbox?.spends || []))
  return {
    ref,
    id: spend.id,
    amount: rupees(spend),
    direction: spend.direction,
    payee: payeeName(spend) || undefined,
    upi: spend.vpa || undefined,
    account: accountLabel(spend, ctx) || undefined,
    when: clock(spend.at),
    via: spend.channel || undefined,
    note: spend.hint || undefined,
    suggestion: {
      type: tip.type,
      ...(tip.category ? { category: tip.category } : {}),
      ...(tip.ruled ? { learned: true } : {}),
    },
    ...(twin ? { alreadyAdded: { id: twin.id, title: describeTxn(twin, ctx.derived.lookups).title, date: twin.date } } : {}),
  }
}

function getUnfiledSpends(_args, ctx) {
  const list = unfiledSpends(ctx.inbox)
  if (!ctx.inbox) return { ok: false, error: 'Captured payments are only in the Gullak app.' }
  return {
    ok: true,
    count: list.length,
    spends: list.slice(0, MAX_LISTED).map((spend, i) => spendFacts(spend, ctx, `S${i + 1}`)),
    ...(list.length > MAX_LISTED ? { more: list.length - MAX_LISTED } : {}),
  }
}

function asList(value) {
  const parsed = typeof value === 'string' ? parseJSON(value) : value
  if (Array.isArray(parsed)) return parsed
  return parsed && typeof parsed === 'object' ? [parsed] : []
}

/** Money each entry moves through the payment's account, in the payment's direction. */
function flow(entry, spend, accountId) {
  if (entry.type === 'transfer') {
    if (spend.direction === 'out') return !accountId || entry.accountId === accountId ? entry.amount : 0
    return !accountId || entry.toAccountId === accountId ? entry.amount : 0
  }
  const moves = spend.direction === 'out' ? OUT_TYPES.has(entry.type) : IN_TYPES.has(entry.type)
  return moves ? entry.amount : 0
}

function fileSpend(args, ctx) {
  const spend = findSpend(args.spend, ctx.inbox)
  if (!spend) return fail(`No unfiled payment matches “${cleanText(args.spend, 20)}”. Check get_unfiled_spends for the refs.`)
  const amount = rupees(spend)
  const title = payeeName(spend) || (spend.direction === 'in' ? 'Money in' : 'Payment')
  const ref = spendRef(spend, ctx.inbox)
  const book = ctx.inbox?.book || { rules: {}, aliases: {} }
  const tip = suggest(spend, { book, accounts: ctx.state.accounts })

  const linkId = cleanText(args.linkTo, 40)
  if (linkId) {
    const txn = ctx.state.transactions.find((t) => t.id === linkId)
    if (!txn) return fail(`No entry with id ${linkId}. Find it with query_transactions first.`)
    const warnings = Math.abs(txn.amount - amount) > EPS ? [`That entry is ${formatINR(txn.amount)}; the payment was ${formatINR(amount)}`] : []
    const what = describeTxn(txn, ctx.derived.lookups).title
    const summary = `${ref} ${formatINR(amount)} ${title} is the same as “${what}” (${txn.date})`
    return proposal([makeDraft('spendLink', { spendId: spend.id, entryId: txn.id, amount, title, date: spendDate(spend) }, { warnings, summary })])
  }

  let list = asList(args.entries)
  if (!list.length) list = [{ type: tip.type, category: tip.category, note: tip.note }]
  const single = list.length === 1
  const day = spendDate(spend)
  const filled = list.map((raw) => {
    const entry = raw && typeof raw === 'object' ? { ...raw } : raw
    if (!entry || typeof entry !== 'object') return entry
    const given = (key) => entry[key] != null && String(entry[key]).trim() !== ''
    if (!given('amount') && single) entry.amount = amount
    if (!given('date')) entry.date = day
    if (tip.accountId) {
      if (entry.type === 'transfer' && spend.direction === 'in') {
        if (!given('toAccount')) entry.toAccount = tip.accountId
      } else if (!given('account')) {
        entry.account = tip.accountId
      }
    }
    if (!given('note') && single) entry.note = tip.note
    return entry
  })
  const { drafts, errors } = draftEntries(filled, ctx)
  if (!drafts.length) return fail(errors.join(' ') || 'Pass entries: [{type, amount, …}].')
  const entries = drafts.map((d) => d.data)
  const warnings = [...new Set(drafts.flatMap((d) => d.warnings))]
  const needs = drafts.map((d) => d.needsEdit).filter(Boolean)
  const total = round2(entries.reduce((sum, e) => sum + flow(e, spend, tip.accountId), 0))
  if (entries.every((e) => e.amount) && Math.abs(total - amount) > EPS) {
    warnings.push(`These add up to ${formatINR(total)}; the payment was ${formatINR(amount)}`)
  }
  const primary = entries.find((e) => e.type === 'expense' || e.type === 'income')
  const rule = ruleFromEntry(primary, spend)
  const key = merchantKey(spend)
  const summary = `File ${ref} ${formatINR(amount)} ${title}: ${drafts.map((d) => d.summary).join(' + ')}`
  const draft = makeDraft(
    'spend',
    { spendId: spend.id, amount, title, date: day, direction: spend.direction, entries, ...(rule && key ? { rule: { key, ...rule } } : {}) },
    { warnings, needs, summary },
  )
  return proposal([draft], errors)
}

function dismissSpend(args, ctx) {
  const spend = findSpend(args.spend, ctx.inbox)
  if (!spend) return fail('No unfiled payment with that ref. Check get_unfiled_spends.')
  const amount = rupees(spend)
  const title = payeeName(spend) || (spend.direction === 'in' ? 'Money in' : 'Payment')
  const reason = cleanText(args.reason, 80)
  const summary = `Not a spend: ${spendRef(spend, ctx.inbox)} ${formatINR(amount)} ${title}${reason ? ` (${reason})` : ''}`
  return proposal([makeDraft('spendDismiss', { spendId: spend.id, amount, title, date: spendDate(spend), reason }, { summary })])
}

function spendRule(args, ctx) {
  const spend = args.spend ? findSpend(args.spend, ctx.inbox) : null
  if (args.spend && !spend) return fail('No unfiled payment with that ref. Check get_unfiled_spends, or pass payee instead.')
  const payee = cleanText(args.payee, 60)
  const key = spend ? merchantKey(spend) : norm(payee)
  if (!key) return fail('Say which payee: pass spend (a ref) or payee.')
  const type = args.type === 'income' ? 'income' : 'expense'
  const category = resolveCategory(cleanText(args.category, 40), type)
  if (!category) {
    const ids = (type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => c.id).join(', ')
    return fail(`Unknown category “${cleanText(args.category, 40)}”. Use one of: ${ids}.`)
  }
  const label = spend ? payeeName(spend) : payee
  const note = cleanText(args.note, 60)
  const previous = ctx.inbox?.book?.rules?.[key] || null
  const summary = `Rule: ${label} → ${categoryMeta(category).label}${note ? ` · “${note}”` : ''}`
  const warnings = previous ? [`Replaces ${categoryMeta(previous.category).label} for ${label}`] : []
  return proposal([makeDraft('spendRule', { key, label, rule: { type, category, note, label }, previous }, { warnings, summary })])
}

export const SPEND_READERS = { get_unfiled_spends: getUnfiledSpends }
export const SPEND_WRITERS = {
  propose_file_spend: fileSpend,
  propose_dismiss_spend: dismissSpend,
  propose_spend_rule: spendRule,
}

/** The context line a spend chip adds to the user's message, so Munshi knows which payment they mean. */
export function spendContext(spend, ctx) {
  const facts = spendFacts(spend, ctx, spendRef(spend, ctx.inbox))
  const parts = [
    `${facts.ref} (id ${facts.id})`,
    `${formatINR(facts.amount)} ${facts.direction === 'in' ? 'in' : 'out'}`,
    facts.payee || facts.upi,
    facts.account,
    facts.when,
    facts.note && `my note “${facts.note}”`,
  ].filter(Boolean)
  return `[About captured payment ${parts.join(' · ')}]`
}

