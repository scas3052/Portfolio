// Smart help for captured payments, all on the device: which account a payment came from, what it probably
// was, whether it is already in the book, and which debit and credit are really one transfer.
import { guessCategory, norm } from '../agent/resolve'
import { EXPENSE_IDS, INCOME_IDS } from '../lib/categories'
import { diffDays, toISODate } from '../lib/dates'
import { payeeName, ruleFor } from './rules'

const EPS = 0.5
const OUT_TYPES = new Set(['expense', 'emi', 'lend', 'repay'])
const IN_TYPES = new Set(['income', 'borrow', 'collect'])

// Bank names as messages write them, against how accounts are usually named.
const BANK_ALIASES = {
  sbi: ['sbi', 'state bank of india', 'state bank'],
  bob: ['bank of baroda', 'baroda', 'bob'],
  pnb: ['pnb', 'punjab national'],
  hdfc: ['hdfc'],
  icici: ['icici'],
  axis: ['axis'],
  kotak: ['kotak'],
  idfc: ['idfc'],
  yes: ['yes bank'],
  indusind: ['indusind'],
  canara: ['canara'],
  union: ['union bank'],
  federal: ['federal'],
  idbi: ['idbi'],
  au: ['au bank', 'au small'],
  rbl: ['rbl'],
  paytm: ['paytm'],
  airtel: ['airtel'],
}

/** The local calendar day of a spend, "YYYY-MM-DD". */
export const spendDate = (spend) => toISODate(new Date(spend.at))

export const rupees = (spend) => Math.round(Number(spend.amountPaise) || 0) / 100

/** True when `hint` (from a message, e.g. "SBI") and `bank` (an account's bank, e.g. "State Bank of India") are the same bank. */
export function sameBank(hint, bank) {
  const a = norm(hint)
  const b = norm(bank)
  if (!a || !b) return false
  if (a === b || b.includes(a) || a.includes(b)) return true
  return Object.values(BANK_ALIASES).some((names) => names.some((n) => a.includes(n)) && names.some((n) => b.includes(n)))
}

/**
 * The account a payment went through: a remembered alias for its digits first, then the one account ending
 * in those digits, then (cards without digits) the one card of that bank. `{account, how}` or `{account: null}`.
 */
export function matchAccount(spend, accounts, aliases = {}) {
  const digits = spend.account ? String(spend.account) : ''
  if (digits && aliases[digits]) {
    const account = accounts.find((a) => a.id === aliases[digits])
    if (account) return { account, how: 'alias' }
  }
  if (digits) {
    const endsWith = accounts.filter((a) => a.last4 && (a.last4 === digits || (digits.length === 3 && a.last4.endsWith(digits))))
    if (endsWith.length === 1) return { account: endsWith[0], how: 'digits' }
    const byBank = endsWith.filter((a) => sameBank(spend.bank, a.bank))
    if (byBank.length === 1) return { account: byBank[0], how: 'digits' }
    if (endsWith.length > 1) return { account: null, how: null, choices: endsWith }
  }
  if (spend.bank) {
    const card = spend.channel === 'card'
    const sameKind = accounts.filter((a) => sameBank(spend.bank, a.bank) && (card ? a.kind === 'credit' : a.kind !== 'credit' && a.kind !== 'cash'))
    if (!digits && sameKind.length === 1) return { account: sameKind[0], how: 'bank' }
  }
  return { account: null, how: null }
}

/**
 * What a spend probably is: a learned rule wins (and makes "Looks right" possible), then the payee's name
 * and the user's reply note against Gullak's keyword list.
 */
export function suggest(spend, { book, accounts }) {
  const rule = ruleFor(book, spend)
  const incoming = spend.direction === 'in'
  const type = rule?.type || (incoming ? 'income' : 'expense')
  const ids = type === 'income' ? INCOME_IDS : EXPENSE_IDS
  const words = [spend.hint, payeeName(spend), spend.vpa].filter(Boolean).join(' ')
  const guessed = type === 'expense' || type === 'income' ? guessCategory(words, type) : ''
  const category = rule?.category && ids.has(rule.category) ? rule.category : ids.has(guessed) ? guessed : ''
  const { account } = matchAccount(spend, accounts, book.aliases)
  return {
    type,
    category,
    note: spend.hint || rule?.note || payeeName(spend),
    accountId: account?.id || '',
    ruled: Boolean(rule),
  }
}

/** A ready-to-edit entry for the usual form. */
export function toPrefill(spend, suggestion) {
  const prefill = {
    type: suggestion.type,
    amount: rupees(spend),
    date: spendDate(spend),
    note: suggestion.note || '',
    category: suggestion.category || '',
  }
  if (suggestion.type === 'transfer' && spend.direction === 'in') prefill.toAccountId = suggestion.accountId
  else prefill.accountId = suggestion.accountId
  return prefill
}

/** Ids of entries already tied to captured payments, so they aren't offered as "already added" twice. */
export function linkedEntryIds(spends) {
  const ids = new Set()
  for (const s of spends) for (const id of s.entryIds || []) ids.add(id)
  return ids
}

/**
 * An entry already in the book that looks like this payment: same amount, within a day, money moving the same
 * way and, when both name one, the same account.
 */
export function findTwin(spend, transactions, accountId, linked = new Set()) {
  const amount = rupees(spend)
  const day = spendDate(spend)
  const incoming = spend.direction === 'in'
  let best = null
  for (const t of transactions) {
    if (linked.has(t.id) || Math.abs(t.amount - amount) > EPS) continue
    const gap = Math.abs(diffDays(day, t.date))
    if (gap > 1) continue
    let accountOf = t.accountId
    if (t.type === 'transfer') {
      accountOf = incoming ? t.toAccountId : t.accountId
    } else if (incoming ? !IN_TYPES.has(t.type) : !OUT_TYPES.has(t.type)) continue
    if (accountId && accountOf && accountOf !== accountId) continue
    if (!best || gap < best.gap) best = { txn: t, gap }
  }
  return best?.txn || null
}

/**
 * Debits and credits of the same amount between two of the user's own accounts, within two days: one transfer
 * rather than a spend and an income. Returns [{from, to, fromAccount, toAccount}].
 */
export function pairTransfers(spends, accounts, aliases = {}) {
  const pairs = []
  const used = new Set()
  const unfiled = spends.filter((s) => s.status === 'unfiled')
  for (const out of unfiled) {
    if (out.direction !== 'out' || used.has(out.id)) continue
    const fromAccount = matchAccount(out, accounts, aliases).account
    if (!fromAccount) continue
    for (const incoming of unfiled) {
      if (incoming.direction !== 'in' || used.has(incoming.id) || incoming.amountPaise !== out.amountPaise) continue
      if (Math.abs(incoming.at - out.at) > 2 * 86400000) continue
      const toAccount = matchAccount(incoming, accounts, aliases).account
      if (!toAccount || toAccount.id === fromAccount.id) continue
      pairs.push({ from: out, to: incoming, fromAccount, toAccount })
      used.add(out.id)
      used.add(incoming.id)
      break
    }
  }
  return pairs
}

/** Normalises a spend from the native plugin (or the mock) into the shape the app uses. */
export function normalizeSpend(raw) {
  if (!raw || typeof raw !== 'object' || !raw.id) return null
  const amountPaise = Math.round(Number(raw.amountPaise))
  if (!(amountPaise > 0)) return null
  const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null)
  return {
    id: String(raw.id),
    status: ['unfiled', 'filed', 'dismissed'].includes(raw.status) ? raw.status : 'unfiled',
    amountPaise,
    direction: raw.direction === 'in' ? 'in' : 'out',
    at: Number(raw.at) || Date.now(),
    account: text(raw.account),
    party: text(raw.party),
    vpa: text(raw.vpa),
    ref: text(raw.ref),
    channel: text(raw.channel),
    bank: text(raw.bank),
    balance: Number.isFinite(raw.balancePaise) ? raw.balancePaise / 100 : null,
    sources: Array.isArray(raw.sources) ? raw.sources.filter((s) => typeof s === 'string') : [],
    hasOriginal: Boolean(raw.hasOriginal),
    hint: text(raw.hint),
    hintAt: Number(raw.hintAt) || 0,
    entryIds: Array.isArray(raw.entryIds) ? raw.entryIds.filter((s) => typeof s === 'string' && s) : [],
    closedAt: Number(raw.closedAt) || 0,
  }
}
