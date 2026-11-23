// What Gullak has learned about filing captured payments, kept on this device only: never synced, never in
// backups. Rules say how a payee is usually filed ("Swiggy → Food"); aliases say which account a card or
// account number belongs to ("••1234 → HDFC Salary").
import { norm } from '../agent/resolve'

const KEY = 'gullak:inbox:rules'
const MAX_RULES = 300
const EMPTY = Object.freeze({ rules: {}, aliases: {} })

const NOISE =
  /\b(?:pvt|private|ltd|limited|llp|india|indian|technologies|technology|tech|payments?|services|solutions|retail|stores?|online|enterprises?|upi|mandate|autopay|bharatpe|paytmqr|qr|mr|mrs|ms)\b/g

/** A payee's key, the same however it was written: "SWIGGY", "Swiggy" and swiggy@icici are all "swiggy". */
export function merchantKey(spend) {
  const raw = spend?.party || (spend?.vpa ? String(spend.vpa).split('@')[0] : '')
  return norm(raw).replace(/\d+/g, ' ').replace(NOISE, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)
}

const titleCase = (text) => text.toLowerCase().replace(/(^|[\s.&'-])(\p{L})/gu, (_, gap, ch) => gap + ch.toUpperCase())

/** How a payee reads in a card or note: "SWIGGY" → "Swiggy", swiggy@icici → "Swiggy". */
export function payeeName(spend) {
  if (!spend) return ''
  if (spend.channel === 'atm') return 'ATM'
  if (spend.party) return /[a-z]/.test(spend.party) ? spend.party : titleCase(spend.party)
  if (spend.vpa) {
    const handle = String(spend.vpa).split('@')[0].replace(/[._-]+/g, ' ').replace(/\d{6,}/g, '').trim()
    return handle ? titleCase(handle) : spend.vpa
  }
  return ''
}

function clean(raw) {
  const rules = {}
  if (raw?.rules && typeof raw.rules === 'object') {
    for (const [key, rule] of Object.entries(raw.rules)) {
      if (!key || !rule || typeof rule !== 'object' || typeof rule.type !== 'string') continue
      rules[key] = {
        type: rule.type,
        category: typeof rule.category === 'string' ? rule.category : '',
        note: typeof rule.note === 'string' ? rule.note.slice(0, 140) : '',
        label: typeof rule.label === 'string' ? rule.label.slice(0, 60) : key,
        uses: Number.isFinite(rule.uses) ? rule.uses : 1,
        at: Number.isFinite(rule.at) ? rule.at : 0,
      }
    }
  }
  const aliases = {}
  if (raw?.aliases && typeof raw.aliases === 'object') {
    for (const [digits, accountId] of Object.entries(raw.aliases)) {
      if (/^\d{3,4}$/.test(digits) && typeof accountId === 'string' && accountId) aliases[digits] = accountId
    }
  }
  return { rules, aliases }
}

/** The rule for this spend's payee, or null. */
export function ruleFor(book, spend) {
  const key = merchantKey(spend)
  return (key && book.rules[key]) || null
}

/** `book` with the rule for `key` set (or refreshed). Old, little-used rules make room past 300. */
export function withRule(book, key, rule, now = Date.now()) {
  if (!key || !rule?.type) return book
  const previous = book.rules[key]
  const next = {
    type: rule.type,
    category: rule.category || '',
    note: rule.note || '',
    label: rule.label || previous?.label || key,
    uses: (previous?.uses || 0) + 1,
    at: now,
  }
  const rules = { ...book.rules, [key]: next }
  const keys = Object.keys(rules)
  if (keys.length > MAX_RULES) {
    keys
      .filter((k) => k !== key)
      .sort((a, b) => rules[a].uses - rules[b].uses || rules[a].at - rules[b].at)
      .slice(0, keys.length - MAX_RULES)
      .forEach((k) => delete rules[k])
  }
  return { ...book, rules }
}

export function withoutRule(book, key) {
  if (!book.rules[key]) return book
  const rules = { ...book.rules }
  delete rules[key]
  return { ...book, rules }
}

export function withAlias(book, digits, accountId) {
  if (!/^\d{3,4}$/.test(String(digits || ''))) return book
  const aliases = { ...book.aliases }
  if (accountId) aliases[digits] = accountId
  else delete aliases[digits]
  return { ...book, aliases }
}

/** The rule a filed entry teaches: only spends and income with a category say how a payee is filed. */
export function ruleFromEntry(entry, spend) {
  if (!entry || (entry.type !== 'expense' && entry.type !== 'income') || !entry.category) return null
  const name = payeeName(spend)
  // A standing note ("Netflix subscription") is worth remembering; your answer for this one payment isn't.
  const oneOff = spend?.hint && entry.note?.trim() === spend.hint.trim()
  const note = entry.note && entry.note !== name && !oneOff && entry.note.length <= 60 ? entry.note : ''
  return { type: entry.type, category: entry.category, note, label: name || merchantKey(spend) }
}

// ---- storage -------------------------------------------------------------------------------------

const listeners = new Set()
let snapshot = null

function storage() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function readRules() {
  if (snapshot) return snapshot
  try {
    snapshot = clean(JSON.parse(storage()?.getItem(KEY) || 'null'))
  } catch {
    snapshot = clean(null)
  }
  return snapshot
}

export function writeRules(book) {
  snapshot = clean(book)
  try {
    storage()?.setItem(KEY, JSON.stringify(snapshot))
  } catch {
    // Storage full or blocked: the rules still apply until Gullak is closed.
  }
  listeners.forEach((listener) => listener())
  return snapshot
}

export function updateRules(change) {
  return writeRules(change(readRules()))
}

export function subscribeRules(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** For tests: forget the cached copy so the next read comes from storage. */
export function resetRulesCache() {
  snapshot = null
}

export { EMPTY as EMPTY_RULES }
