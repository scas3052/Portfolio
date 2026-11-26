// Reads bank SMS, payment-app notifications, bank emails (as their mail app's notification shows them) and shared
// text into payment fields.
//
// This is the JavaScript twin of the app's native parser
// (native/android/app/src/main/java/com/scas3052/gullak/capture/PaymentParser.java). The phone runs the
// native one, even when Gullak is closed; this one powers the browser preview (npm run dev:app) and keeps
// the rules testable without Android. Both read native/android/app/src/test/resources/payment-fixtures.txt,
// so a rule changed here has to change there too. Every regex sticks to syntax Java and JavaScript share.
// Unknown formats are skipped, never guessed.

const SPACES = /[\s\u00a0\u2000-\u200b\u202f\u205f\u3000\ufeff]+/g

/** One line of plain text: every run of whitespace (including line breaks) becomes one space. */
export const normalize = (text) => String(text ?? '').replace(SPACES, ' ').trim()

const AMOUNT = /(?:\brs\.?|\binr|₹)\s?([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi
// SBI writes "debited by 500.0" without a currency.
const BARE_AMOUNT = /\b(?:debited|credited|deducted|withdrawn)\s+(?:by|for|with|of)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)\b/i
const LIMIT_BEFORE = /(?:\blimit|\blmt)\b[^0-9]{0,6}$/
const DUE_BEFORE = /\bdue\b[^0-9]{0,6}$/
const BALANCE_BEFORE = /\b(?:bal|balance|avl|available)\b[^0-9]{0,12}$/

const DEBIT = /\b(?:debited|debit(?!\s*card)|spent|withdrawn|withdrawal|deducted|sent|paid|purchased?|transferred|charged|used (?:at|for|on))\b/i
const CREDIT = /\b(?:(?:paid|sent) you|credited|received|deposited|refunded|refund|reversed|reversal|added)\b/i

const OTP_MESSAGE = /\b(?:is|as) (?:the |your )?otp\b|\botp (?:is|for|to)\b|\buse (?:the )?otp\b/i
const FUTURE =
  /\bwill be (?:debited|deducted|credited|charged|auto ?debited)\b|\bis due\b|\bdue (?:date|on|by)\b|\b(?:min|minimum|total) (?:amt|amount) due\b|\bstatement (?:is |has been )?generated\b|\bscheduled\b|\breminder\b|\bupcoming\b/i
const REQUEST = /\brequested\b|\brequesting\b|\bcollect request\b/i
const FAILED = /\b(?:failed|declined|unsuccessful|could not be processed|not processed|insufficient (?:funds|balance)|rejected)\b/i
const MANDATE_SETUP =
  /\bmandate\b.*\b(?:created|registered|set ?up|modified|revoked|cancell?ed|paused|activated)\b|\b(?:creat|register|approv)\w*\b.*\bmandate\b/i
// Payment apps also post offers and rewards; bank SMS with these words still count.
const PROMO = /\b(?:won|win|scratch card|rewards?|offers?|get up to|cashback up to|upto|apply now|pre-?approved|eligible|congratulations|hurry)\b/i

const ACCOUNT =
  /\b(?:a\/?c|acct|account|ac|card)\b\.?(?:\s*(?:no|number|num)\b\.?)?(?:\s*(?:ending(?:\s+(?:with|in))?|ends?))?\s*[:-]?\s*(?:[x*•.]+\s?)?(\d{3,18})\b/i
// App notifications name the bank instead: "HDFC Bank •• 1234", "SBI - 0937".
const APP_ACCOUNT = /\b(?:bank|a\/c|account)\b[^0-9a-z]{0,6}(\d{4})\b/i
const APP_ACCOUNT_LOOSE = /[-–—•·*]\s*(\d{4})\b/

const VPA = /\b([a-z0-9][a-z0-9._-]{0,63}@[a-z][a-z0-9]{1,30})\b(?![.][a-z])/i
const VPA_AT_START = /^(?:vpa\s+)?([a-z0-9][a-z0-9._-]{0,63}@[a-z][a-z0-9]{1,30})\b(?![.][a-z])/i
const REF =
  /\b(?:upi\s*ref(?:erence)?|ref(?:erence)?|rrn|utr|txn|transaction|refno)\.?\s*(?:no\.?|number|id)?\s*[:#-]?\s*([a-z0-9]*\d[a-z0-9]{5,24})\b|\bupi\s*[:#-]\s*(\d{6,24})\b/i

// Where a payee or payer name ends.
const NAME =
  /^(?:vpa\s+)?(.+?)(?=\s+(?:on|ref|refno|upi|via|from|for|at|avl|bal|not you|if not|has|is|was|in your|using|with|successfully|dated|txn|info|thru|through|rrn|utr)\b|\s*[.(),;|?·]|\s*$)/i
const UPI_SLASH = /\bupi\/[a-z0-9]{2,4}\/(\d{6,})\/(.+?)(?=\/|\s+not you\b|\s+axis\b|\s*$)/i
const ICICI_PAYEE = /;\s*([a-z0-9&.' -]{2,40}?)\s+credited\b/i
const AFTER_DATE = /\bon\s+\d{1,2}[-/ ]?[a-z]{3}[-/ ]?\d{2,4}\s+on\s+/gi
const PAID_YOU = /^(.+?)\s+(?:paid|sent)\s+you\b/i
const TO = /\bto\s+/gi
const AT = /\bat\s+/gi
const TOWARDS = /\btowards\s+/gi
const BY_FROM = /\b(?:by|from)\s+/gi
const INFO = /\b(?:info|for|towards)\s*[:-]?\s*(?=(?:neft|imps|rtgs|upi|nach|ach|ecs)\b)/gi

const NOT_A_NAME = /\b(?:a\/?c|acct|account|card|your|yours|you|bank a\/c|customer)\b/i
const STARTS_WITH_MONEY = /^(?:rs\.?|inr|₹|rupees?)\s?[0-9]/i
const MONEYISH = /^(?:rs\.?|inr|₹)?\s*[\d,]+(?:\.\d+)?$/i
const URLISH = /https?:|www\.|\.com\b|\.in\b/i
const IFSC = /\b[a-z]{4}0[a-z0-9]{6}\b-?/gi
const RAIL_PREFIX = /^(?:neft|imps|rtgs|nach|ach|ecs|upi)\b(?:[\s-]*(?:cr|dr|in|out)\b)?[\s:/-]*/i
const MANDATE_PREFIX = /^(?:upi\s*)?(?:mandate|autopay|auto pay|si)\b\s*/i
const EDGE_PUNCT = /^[\s\-/:.,]+|[\s\-/:.,]+$/g

// Sender ids carry a bank code (VM-HDFCBK-S, JD-SBIUPI-S, BP-BOBTXN); message text only counts the
// unambiguous names, so "Reply YES" isn't Yes Bank.
const SENDER_BANKS = [
  ['HDFC', 'HDFC Bank'],
  ['SBI', 'SBI'],
  ['ICICI', 'ICICI Bank'],
  ['AXIS', 'Axis Bank'],
  ['KOTAK', 'Kotak'],
  ['BOB', 'Bank of Baroda'],
  ['BARODA', 'Bank of Baroda'],
  ['PNB', 'PNB'],
  ['YESBNK', 'Yes Bank'],
  ['IDFC', 'IDFC First'],
  ['INDUS', 'IndusInd'],
  ['CANBNK', 'Canara Bank'],
  ['CANARA', 'Canara Bank'],
  ['UNIONB', 'Union Bank'],
  ['FEDBNK', 'Federal Bank'],
  ['AUBANK', 'AU Bank'],
  ['IDBI', 'IDBI'],
  ['RBLBNK', 'RBL'],
  ['PAYTM', 'Paytm Bank'],
  ['AIRBNK', 'Airtel Bank'],
]
const TEXT_BANKS = {
  hdfc: 'HDFC Bank',
  sbi: 'SBI',
  icici: 'ICICI Bank',
  axis: 'Axis Bank',
  kotak: 'Kotak',
  pnb: 'PNB',
  idfc: 'IDFC First',
  idbi: 'IDBI',
  indusind: 'IndusInd',
  canara: 'Canara Bank',
  federal: 'Federal Bank',
  baroda: 'Bank of Baroda',
}
const TEXT_BANK = /\b(hdfc|sbi|icici|axis|kotak|pnb|idfc|idbi|indusind|canara|federal|baroda)\b/i
// slice counts only in an email's sender name: in a message's text it could be a pizza.
const SENDER_SLICE = /\bslice\b/i
const TRAILING_CUT = /(?:…|\.{2,})?\s*$/

/** True for bank-style sender ids (VM-HDFCBK-S, HDFCBK, 57575); false for phone numbers and -P promos. */
export function isTransactionalSender(sender) {
  const id = String(sender ?? '').trim().toUpperCase()
  if (!id || /-P$/.test(id)) return false
  if (/^\+?\d{7,}$/.test(id.replace(/[\s-]/g, ''))) return false
  return /^[A-Z]{2}-[A-Z0-9]{3,9}(?:-[STG])?$/.test(id) || (/^[A-Z0-9]{3,9}$/.test(id) && /[A-Z]/.test(id)) || /^\d{3,6}$/.test(id)
}

/** "HDFC Bank" for VM-HDFCBK-S, or null when the sender id doesn't carry a bank code we know. */
export function bankFromSender(sender) {
  const core = String(sender ?? '').trim().toUpperCase().replace(/^[A-Z]{2}-/, '').replace(/-[STG]$/, '')
  for (const [code, name] of SENDER_BANKS) if (core.includes(code)) return name
  return null
}

/** The bank a message names ("Paid from HDFC Bank •• 1234"), or null. */
export function bankInText(text) {
  const match = TEXT_BANK.exec(String(text ?? ''))
  return match ? TEXT_BANKS[match[1].toLowerCase()] : null
}

function toPaise(raw) {
  const value = Number(String(raw).replace(/,/g, '').replace(/\.$/, ''))
  if (!Number.isFinite(value) || value <= 0 || value >= 1e9) return null
  return Math.round(value * 100)
}

function amounts(t) {
  let amount = null
  let balance = null
  for (const match of t.matchAll(AMOUNT)) {
    const value = toPaise(match[1])
    if (value === null) continue
    const before = t.slice(Math.max(0, match.index - 24), match.index).toLowerCase()
    if (LIMIT_BEFORE.test(before) || DUE_BEFORE.test(before)) continue
    if (BALANCE_BEFORE.test(before)) {
      if (balance === null) balance = value
      continue
    }
    if (amount === null) amount = value
  }
  if (amount === null) {
    const bare = BARE_AMOUNT.exec(t)
    if (bare) amount = toPaise(bare[1])
  }
  return { amount, balance }
}

function firstIndex(regex, text) {
  const match = regex.exec(text)
  return match ? match.index : -1
}

/** 'out', 'in' or null: whichever kind of verb comes first ("debited … SWIGGY credited" is money out). */
function directionOf(cleaned) {
  const debit = firstIndex(DEBIT, cleaned)
  const credit = firstIndex(CREDIT, cleaned)
  if (debit < 0 && credit < 0) return null
  if (credit < 0) return 'out'
  if (debit < 0) return 'in'
  return credit <= debit ? 'in' : 'out'
}

function channelOf(cleaned, vpa, kind) {
  if (vpa || kind === 'app' || /\bupi\b/.test(cleaned)) return 'upi'
  if (/\batm\b|\bwithdrawn\b|\bwithdrawal\b/.test(cleaned)) return 'atm'
  if (/\bcard\b/.test(cleaned)) return 'card'
  if (/\b(?:neft|imps|rtgs|net ?banking|nb)\b/.test(cleaned)) return 'netbanking'
  return null
}

function accountIn(t, kind) {
  // Emails carry dates like 25-11-2026, so the loose "- 1234" rule is only for app alerts and shared text.
  const loose = kind !== 'mail' ? APP_ACCOUNT_LOOSE.exec(t) : null
  const match = ACCOUNT.exec(t) || (kind !== 'sms' ? APP_ACCOUNT.exec(t) || loose : null)
  if (!match) return null
  const digits = match[1]
  return digits.length > 4 ? digits.slice(-4) : digits
}

/** Tidies a captured name: NEFT/IMPS prefixes, IFSC codes and mandate words go, so "NEFT Cr-ICIC0000001-ACME" reads "ACME". */
export function tidyName(raw) {
  let name = normalize(raw)
  name = name.replace(IFSC, '')
  name = name.replace(RAIL_PREFIX, '')
  name = name.replace(MANDATE_PREFIX, '')
  name = name.replace(EDGE_PUNCT, '')
  return name.slice(0, 60)
}

function validName(name) {
  if (!name || name.length < 2 || !/[a-z]/i.test(name)) return false
  if (NOT_A_NAME.test(name) || MONEYISH.test(name) || URLISH.test(name)) return false
  return !/^\+?\d[\d\s-]{6,}$/.test(name)
}

/** The name (or VPA) right after each match of `keyword`; the first one that reads like a name wins. */
function after(keyword, t) {
  keyword.lastIndex = 0
  let match
  while ((match = keyword.exec(t))) {
    const rest = t.slice(match.index + match[0].length)
    if (STARTS_WITH_MONEY.test(rest)) continue
    const vpa = VPA_AT_START.exec(rest)
    if (vpa) return { vpa: vpa[1] }
    const name = NAME.exec(rest)
    const tidy = name ? tidyName(name[1]) : ''
    if (validName(tidy)) return { name: tidy }
  }
  return null
}

function partyOf(t, direction, channel, kind) {
  if (channel === 'atm') return { name: 'ATM' }
  const slash = UPI_SLASH.exec(t)
  if (slash) {
    const name = tidyName(slash[2])
    if (validName(name)) return { name, ref: slash[1] }
  }
  if (direction === 'out') {
    const icici = ICICI_PAYEE.exec(t)
    if (icici && validName(tidyName(icici[1]))) return { name: tidyName(icici[1]) }
    const order = channel === 'card' ? [AT, AFTER_DATE, TO] : [TO, AT, AFTER_DATE]
    for (const keyword of [...order, TOWARDS, INFO]) {
      const hit = after(keyword, t)
      if (hit) return hit
    }
    return null
  }
  if (kind !== 'sms') {
    for (const segment of t.split(/\s*[.·|]\s+/)) {
      const paidYou = PAID_YOU.exec(segment)
      if (paidYou && validName(tidyName(paidYou[1]))) return { name: tidyName(paidYou[1]) }
    }
  }
  return after(BY_FROM, t) || after(INFO, t)
}

function skipped(t, kind) {
  if (OTP_MESSAGE.test(t) || FUTURE.test(t) || REQUEST.test(t) || FAILED.test(t) || MANDATE_SETUP.test(t)) return true
  return (kind === 'app' || kind === 'mail') && PROMO.test(t)
}

function parseText(raw, kind) {
  const t = normalize(raw)
  if (!t || skipped(t, kind)) return null
  const cleaned = t.toLowerCase().replace(/\b(?:credit|debit)\s+card\b/g, 'card')
  const direction = directionOf(cleaned)
  if (!direction) return null
  const { amount, balance } = amounts(t)
  if (amount === null) return null
  const vpaMatch = VPA.exec(t)
  const channel = channelOf(cleaned, vpaMatch, kind)
  const party = partyOf(t, direction, channel, kind) || {}
  const refMatch = REF.exec(t)
  const vpa = party.vpa || (party.name ? null : vpaMatch?.[1]) || null
  return {
    amountPaise: amount,
    amount: amount / 100,
    direction,
    account: accountIn(t, kind),
    party: party.name || null,
    vpa: vpa ? vpa.toLowerCase() : null,
    ref: party.ref || (refMatch ? refMatch[1] || refMatch[2] : null),
    channel,
    bank: bankInText(t),
    balance: balance === null ? null : balance / 100,
  }
}

/** A bank SMS from `sender`, or null when it isn't a completed payment (OTPs, offers, reminders, failures…). */
export function parseSms(sender, body) {
  if (!isTransactionalSender(sender)) return null
  const parsed = parseText(body, 'sms')
  return parsed && { ...parsed, bank: bankFromSender(sender) || parsed.bank }
}

/** A payment or bank app's notification. */
export function parseApp(title, text) {
  return parseText([title, text].map(normalize).filter(Boolean).join('. '), 'app')
}

/** One line from a mail notification: the subject, then the start of the email (Gmail repeats the subject there). */
export function mailText(subject, body) {
  const s = normalize(subject)
  let b = normalize(body)
  if (s && b.startsWith(s)) b = b.slice(s.length).trim()
  return [s, b].filter(Boolean).join('. ')
}

/** "slice" for slice's emails, the bank a sender name like "HDFC Bank InstaAlerts" names, or null. */
export function bankInSender(sender) {
  if (sender == null) return null
  if (SENDER_SLICE.test(String(sender))) return 'slice'
  return bankInText(sender)
}

/**
 * A bank's email as its mail app's notification shows it: the sender's name, the subject and the start of the
 * email. Null when it isn't a completed payment. Only senders the user listed in Settings get this far.
 */
export function parseMail(sender, subject, body) {
  const text = mailText(subject, body)
  const parsed = parseText(text, 'mail')
  if (!parsed) return null
  // A notification shows only the start of an email, so a reference at the very end may be cut short. A wrong
  // reference would stop the payment's SMS or statement line from merging with it: better none.
  const cut = parsed.ref && text.replace(TRAILING_CUT, '').toLowerCase().endsWith(parsed.ref.toLowerCase())
  return { ...parsed, ref: cut ? null : parsed.ref, bank: bankInSender(sender) || parsed.bank }
}

/** Text shared to Gullak. The user picked it, so a lone amount is enough: it's read as money out. */
export function parseShared(text) {
  const strict = parseText(text, 'share')
  if (strict) return strict
  const t = normalize(text)
  if (!t || skipped(t, 'share')) return null
  const { amount } = amounts(t)
  if (amount === null) return null
  const vpa = VPA.exec(t)
  const refMatch = REF.exec(t)
  return {
    amountPaise: amount,
    amount: amount / 100,
    direction: directionOf(t.toLowerCase()) || 'out',
    account: accountIn(t, 'share'),
    party: null,
    vpa: vpa ? vpa[1].toLowerCase() : null,
    ref: refMatch ? refMatch[1] || refMatch[2] : null,
    channel: vpa ? 'upi' : null,
    bank: bankInText(t),
    balance: null,
  }
}
