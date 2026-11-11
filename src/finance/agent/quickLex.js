// Tokens and small readers for the offline quick parser: dates, one amount, preposition
// groups, the action verb and plain person names. Anything unclear throws Skip.
import { parseDate, parseMoney } from './parse'
import { KIND_WORDS, norm, resolveAccount } from './resolve'

export class Skip extends Error {}
export const skip = (reason) => {
  throw new Skip(reason)
}

const MON = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?'
const MONTH_WORD = new RegExp(`\\b(?:${MON})\\b`)
const DATE = new RegExp(
  '^(?:on )?(?:today|tonight|now|just now|yesterday|yday|last night|day before yesterday|tomorrow' +
    '|this (?:morning|afternoon|evening)|(?:yesterday|today) (?:morning|afternoon|evening|night)' +
    '|(?:\\d{1,3}|a|one) days? ago|(?:(?:last|this|past) )?(?:sun|mon|tues|wednes|thurs|fri|satur)day' +
    '|(?:last|this|past) (?:mon|tues?|wed|thu|thurs?|fri|sat|sun)' +
    `|(?:the )?\\d{1,2}(?:st|nd|rd|th)?(?: of)? (?:${MON})(?: \\d{4})?` +
    `|(?:${MON}) \\d{1,2}(?:st|nd|rd|th)?(?: \\d{4})?` +
    '|\\d{1,2}[/-]\\d{1,2}(?:[/-]\\d{2,4})?|\\d{4}-\\d{2}-\\d{2}|(?:the )?\\d{1,2}(?:st|nd|rd|th))$',
)
const MONEY = /^(?:₹|rs\.?|inr)?(?:\d{1,3}(?:,\d{2,3})+|\d+)(?:\.\d+)?(?:k|l|cr|lakhs?|lacs?|crores?|thousand)?(?:rs\.?|\/-|rupees?|bucks)?$/
const PREFIX = new Set(['₹', 'rs', 'inr', 'rupees'])
const SUFFIX = new Set(['k', 'thousand', 'lakh', 'lakhs', 'lac', 'lacs', 'cr', 'crore', 'crores', 'rs', 'rupee', 'rupees', 'bucks', '/-', 'inr'])
const ID_LEAD = new Set(['card', 'account', 'acc', 'a/c', 'ac', 'ending', 'xx', 'no'])
export const PREPS = new Set(['to', 'from', 'for', 'on', 'at', 'via', 'using', 'through', 'thru', 'with', 'by', 'in', 'into'])

/** Words with their position; `role` becomes 'date' or 'money' once a reader claims them. */
export function tokenize(clause) {
  return String(clause)
    .split(/\s+/)
    .map((part) => part.replace(/^[("'‘“]+/, '').replace(/[)"'”’!?:,.]+$/, ''))
    .filter(Boolean)
    .map((raw, i) => ({ raw, w: raw.toLowerCase().replace(/’/g, "'"), i, role: '' }))
}

export const textOf = (words) => words.map((t) => t.raw).join(' ')

function dateText(text) {
  let t = text.replace(/^on /, '').replace(/^the /, '')
  if (/^(?:just now|this (?:morning|afternoon|evening))$/.test(t)) return 'today'
  const part = t.match(/^(yesterday|today) (?:morning|afternoon|evening|night)$/)
  if (part) return part[1]
  t = t.replace(/^one (days? ago)$/, '1 $1')
  if (MONTH_WORD.test(t)) t = t.replace(/(\d)(?:st|nd|rd|th)\b/g, '$1').replace(/ of /, ' ').replace(/^the /, '')
  return t
}

/** Claims at most one date phrase ("yesterday", "on 5th", "last friday"); two dates → Skip. */
export function scanDates(tokens, today) {
  let found = ''
  for (let i = 0; i < tokens.length; i++) {
    for (let n = Math.min(5, tokens.length - i); n >= 1; n--) {
      const span = tokens.slice(i, i + n)
      if (span.some((t) => t.role)) continue
      const text = span.map((t) => t.w).join(' ')
      if (!DATE.test(text)) continue
      const read = parseDate(dateText(text), today)
      if (!read || read.unread) continue
      if (found) skip('dates')
      found = read.date
      for (const t of span) t.role = 'date'
      i += n - 1
      break
    }
  }
  return found
}

/** Claims the single amount ("₹1,200", "72k", "2 lakh"); a second number → Skip. */
export function scanMoney(tokens) {
  let amount = null
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (t.role || !/\d/.test(t.w)) continue
    if (/^\d{4}$/.test(t.w) && i > 0 && ID_LEAD.has(tokens[i - 1].w)) continue
    if (!MONEY.test(t.w) || amount != null) skip('numbers')
    const span = [t]
    if (i > 0 && !tokens[i - 1].role && PREFIX.has(tokens[i - 1].w)) span.unshift(tokens[i - 1])
    let j = i + 1
    while (j < tokens.length && !tokens[j].role && SUFFIX.has(tokens[j].w)) span.push(tokens[j++])
    const value = parseMoney(span.map((s) => s.raw).join(' '))
    if (!Number.isFinite(value) || value <= 0) skip('numbers')
    for (const s of span) s.role = 'money'
    amount = value
    i = j - 1
  }
  return amount
}

/** Splits the unclaimed words into runs: a loose run, then one run per preposition. */
export function groupWords(tokens) {
  const groups = []
  let current = null
  for (const t of tokens) {
    if (t.role) {
      current = null
      continue
    }
    if (PREPS.has(t.w)) {
      current = { prep: t.w, prepTok: t, words: [] }
      groups.push(current)
      continue
    }
    if (!current) {
      current = { prep: '', prepTok: null, words: [] }
      groups.push(current)
    }
    current.words.push(t)
  }
  return groups.filter((g) => g.words.length)
}

const VERB_LIST = {
  lend: 'lent lend lending loaned',
  borrow: 'borrowed borrow borrowing',
  repay: 'repaid repay returned return',
  settle: 'settled settle',
  withdraw: 'withdrew withdrawn withdraw withdrawal',
  transfer: 'transferred transfered transfer moved move',
  expense: 'spent spend paid pay bought buy purchased ordered booked recharged recharge',
  give: 'gave give sent send',
  income: 'earned credited',
  got: 'got get received receive recieved',
  collect: 'recovered collected collect',
}
export const VERBS = new Map(Object.entries(VERB_LIST).flatMap(([kind, words]) => words.split(' ').map((w) => [w, kind])))
const PAIRS = [
  ['took out', 'withdraw'],
  ['got paid', 'income'],
  ['get paid', 'income'],
]

/** The first action verb in a run of words → { i, end, kind } (end is exclusive). */
export function findVerb(words) {
  for (let i = 0; i < words.length; i++) {
    const pair = PAIRS.find(([phrase]) => words[i + 1] && `${words[i].w} ${words[i + 1].w}` === phrase)
    if (pair) return { i, end: i + 2, kind: pair[1] }
    const kind = VERBS.get(words[i].w)
    if (kind) return { i, end: i + 1, kind }
  }
  return null
}

const NOT_NAME = new Set(['i', 'me', 'my', 'the', 'a', 'an', 'back', 'him', 'her', 'them', 'it', 'that', 'this', 'money', 'amount', 'rs', 'up', 'all', 'full', 'whole', 'entire', 'dues', 'due', 'us'])

/** A plain 1–3 word name from the words ("Ravi", "Ravi Kumar"), else ''. */
export function personFrom(words) {
  const kept = words.filter((t) => !NOT_NAME.has(t.w))
  if (!kept.length || kept.length > 3) return ''
  if (!kept.every((t) => /^\p{L}+$/u.test(t.w))) return ''
  return textOf(kept)
}

const KIND_PHRASES = new Set([...KIND_WORDS.cash, ...KIND_WORDS.credit, ...KIND_WORDS.wallet])

/** "cash", "card", "gpay" on their own → { text, id } of the matching account, else null. */
export function kindAccount(words, accounts) {
  if (!words.length) return null
  const text = textOf(words)
  if (!KIND_PHRASES.has(norm(text))) return null
  const hit = resolveAccount(text, accounts)
  return hit ? { text, id: hit.item.id } : null
}
