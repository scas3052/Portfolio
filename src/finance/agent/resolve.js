// Fuzzy name matching for the assistant: "ravi" → Ravi Kumar, "hdfc card" → the
// HDFC credit card, "car emi" → Car loan, "swiggy" → Food.
import { EXPENSE_CATEGORIES, EXPENSE_IDS, INCOME_CATEGORIES, INCOME_IDS } from '../lib/categories'

export function norm(text) {
  return String(text ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]s\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function strip(text, stop) {
  return text
    .split(' ')
    .filter((word) => word && !stop.has(word))
    .join(' ')
}

function distance(a, b) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i]
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + cost)
    }
    previous = row
  }
  return previous[b.length]
}

export function similarity(a, b) {
  const longest = Math.max(a.length, b.length)
  return longest ? 1 - distance(a, b) / longest : 0
}

/** 0..1 score of how well `query` names `candidate` (both raw strings). */
export function scoreText(query, candidate, stop = EMPTY) {
  const q = norm(query)
  const c = norm(candidate)
  if (!q || !c) return 0
  if (q === c) return 1
  const qs = strip(q, stop)
  const cs = strip(c, stop)
  if (qs && qs === cs) return 0.96
  if (c.startsWith(`${q} `) || q.startsWith(`${c} `)) return 0.92
  if (q.length >= 3 && c.startsWith(q)) return 0.88
  // Compare without filler words unless that leaves one side empty ("wallet" vs "Cash wallet").
  const [a, b] = qs && cs ? [qs, cs] : [q, c]
  const qt = a.split(' ')
  const ct = b.split(' ')
  if (qt.every((t) => ct.some((w) => w.startsWith(t)))) return 0.85
  if (qt.every((t) => t.length >= 3 && ct.some((w) => w.includes(t)))) return 0.8
  const tokens = qt.reduce((sum, t) => sum + Math.max(...ct.map((w) => similarity(t, w))), 0) / qt.length
  return Math.max(tokens, similarity(a, b)) * 0.9
}

const EMPTY = new Set()
const words = (list) => new Set(list)

const ACCOUNT_STOP = words(['the', 'my', 'a', 'c', 'ac', 'acc', 'acct', 'account', 'bank', 'card', 'credit', 'debit', 'savings', 'saving', 'salary', 'current', 'wallet', 'upi', 'in', 'from', 'via'])
const LOAN_STOP = words(['the', 'my', 'emi', 'emis', 'loan', 'loans', 'instalment', 'installment', 'monthly', 'payment', 'for'])
const GOAL_STOP = words(['the', 'my', 'a', 'goal', 'jar', 'fund', 'savings', 'saving', 'for', 'to'])
const PERSON_STOP = words(['the', 'my', 'mr', 'mrs', 'ms', 'miss', 'dr', 'sir', 'madam', 'bhai', 'bhaiya', 'anna', 'akka', 'didi', 'di', 'ji', 'garu', 'bro'])

// Words that point at a kind of account rather than its name ("paid by card").
export const KIND_WORDS = {
  wallet: ['upi', 'gpay', 'google pay', 'phonepe', 'phone pe', 'paytm', 'amazon pay', 'wallet', 'bhim', 'mobikwik'],
  credit: ['credit card', 'credit', 'card', 'cc'],
  cash: ['cash', 'cash in hand'],
  salary: ['salary account', 'salary'],
  savings: ['savings account', 'savings', 'saving'],
  current: ['current account'],
}

function hasPhrase(text, phrase) {
  return ` ${text} `.includes(` ${phrase} `)
}

/** Normalised text for kind matching; a "debit card" belongs to a bank account, not a credit card. */
export function kindText(text) {
  return norm(text).replace(/\bdebit card\b/g, 'debit')
}

function kindsIn(query) {
  const q = kindText(query)
  return new Set(Object.entries(KIND_WORDS).filter(([, list]) => list.some((w) => hasPhrase(q, w))).map(([kind]) => kind))
}

/**
 * Best item for `query`. Returns `{item, score, ambiguous}` or null.
 * `ambiguous` lists the close runners-up (including the best) when the pick is unsure.
 */
export function bestMatch(query, items, candidates, { stop = EMPTY, threshold = 0.6, boost } = {}) {
  if (query == null || String(query).trim() === '') return null
  const exact = items.find((item) => item.id === query)
  if (exact) return { item: exact, score: 1, ambiguous: [] }
  const scored = []
  for (const item of items) {
    let score = 0
    for (const text of candidates(item)) if (text) score = Math.max(score, scoreText(query, text, stop))
    if (boost) score = boost(item, score)
    if (score >= threshold) scored.push({ item, score })
  }
  if (!scored.length) return null
  scored.sort((a, b) => b.score - a.score)
  const [best, ...rest] = scored
  const close = best.score < 1 ? rest.filter((s) => best.score - s.score <= 0.05) : []
  return { item: best.item, score: best.score, ambiguous: close.length ? [best.item, ...close.map((s) => s.item)] : [] }
}

export function resolveAccount(query, accounts) {
  const kinds = kindsIn(query)
  const digits = String(query ?? '').match(/\b\d{4}\b/)?.[0]
  return bestMatch(query, accounts, (a) => [a.name, a.bank, a.bank && `${a.bank} ${a.kind}`, a.bank && `${a.bank} ${a.name}`], {
    stop: ACCOUNT_STOP,
    threshold: 0.7,
    boost: (account, score) => {
      if (digits && account.last4 === digits) return Math.max(score, 0.97)
      if (!kinds.has(account.kind)) return score
      return Math.min(0.99, Math.max(score + 0.08, 0.7))
    },
  })
}

export function resolveLoan(query, loans) {
  return bestMatch(query, loans, (l) => [l.name, l.lender, `${l.name} emi`, l.lender && `${l.lender} ${l.name}`], { stop: LOAN_STOP })
}

export function resolveGoal(query, goals) {
  return bestMatch(query, goals, (g) => [g.name], { stop: GOAL_STOP })
}

/** Tidies a typed name: trims, collapses spaces and capitalises all-lowercase words. */
export function cleanName(name) {
  const text = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)
  return text === text.toLowerCase() ? text.replace(/(^|[\s-])(\p{L})/gu, (_, gap, ch) => gap + ch.toUpperCase()) : text
}

/**
 * People are stricter: an unknown name becomes `{isNew, name, similar}` (a new
 * person, with look-alike existing names to warn about) rather than a near miss.
 */
export function resolvePerson(query, people) {
  const loose = bestMatch(query, people, (p) => [p.name], { stop: PERSON_STOP, threshold: 0.6 })
  if (loose && loose.score >= 0.78) return loose
  const name = cleanName(query)
  if (!name) return null
  const similar = loose ? (loose.ambiguous.length ? loose.ambiguous : [loose.item]).map((p) => p.name) : []
  return { isNew: true, name, similar }
}

const EXPENSE_WORDS = {
  food: ['food', 'swiggy', 'zomato', 'lunch', 'dinner', 'breakfast', 'brunch', 'snack', 'snacks', 'restaurant', 'cafe', 'coffee', 'tea', 'chai', 'biryani', 'pizza', 'burger', 'dominos', 'kfc', 'mcdonalds', 'starbucks', 'meal', 'meals', 'dining', 'canteen', 'mess', 'tiffin', 'juice', 'ice cream', 'sweets', 'bakery', 'eating out', 'dine out'],
  groceries: ['grocery', 'groceries', 'blinkit', 'zepto', 'bigbasket', 'big basket', 'instamart', 'dmart', 'jiomart', 'milk', 'vegetables', 'veggies', 'fruits', 'kirana', 'supermarket', 'eggs', 'atta'],
  transport: ['transport', 'uber', 'ola', 'rapido', 'auto', 'rickshaw', 'cab', 'taxi', 'metro', 'bus', 'train', 'parking', 'toll', 'fastag', 'commute', 'bike taxi'],
  fuel: ['fuel', 'petrol', 'diesel', 'cng', 'ev charging'],
  shopping: ['shopping', 'amazon', 'flipkart', 'myntra', 'ajio', 'meesho', 'nykaa', 'clothes', 'clothing', 'shirt', 'jeans', 'shoes', 'gadget', 'electronics', 'headphones', 'mall'],
  bills: ['bill', 'bills', 'electricity', 'power bill', 'water bill', 'wifi', 'internet', 'broadband', 'recharge', 'mobile bill', 'phone bill', 'mobile recharge', 'postpaid', 'dth', 'lpg', 'gas cylinder', 'cylinder', 'utilities', 'insurance'],
  rent: ['rent', 'house rent', 'pg', 'hostel', 'maintenance', 'society maintenance', 'security deposit', 'brokerage'],
  health: ['health', 'medicine', 'medicines', 'medical', 'pharmacy', 'chemist', 'doctor', 'hospital', 'clinic', 'dentist', 'lab test', 'gym', 'fitness', 'health insurance', 'pharmeasy', 'yoga'],
  entertainment: ['entertainment', 'movie', 'movies', 'cinema', 'pvr', 'inox', 'bookmyshow', 'concert', 'party', 'gaming', 'bowling', 'outing'],
  travel: ['travel', 'flight', 'flights', 'hotel', 'irctc', 'trip', 'vacation', 'holiday', 'makemytrip', 'goibibo', 'airbnb', 'oyo', 'visa'],
  education: ['education', 'course', 'courses', 'book', 'books', 'udemy', 'coursera', 'fees', 'tuition', 'exam', 'college', 'certification', 'stationery'],
  subscriptions: ['subscription', 'subscriptions', 'netflix', 'spotify', 'prime', 'amazon prime', 'hotstar', 'jiohotstar', 'youtube premium', 'icloud', 'google one', 'chatgpt', 'apple music', 'zee5', 'sonyliv'],
  family: ['family', 'parents', 'mom', 'mother', 'dad', 'father', 'amma', 'nanna', 'appa', 'papa', 'mummy', 'sister', 'brother'],
  gifts: ['gift', 'gifts', 'donation', 'donate', 'charity', 'temple', 'church', 'mosque'],
  personal: ['salon', 'haircut', 'hair cut', 'barber', 'spa', 'laundry', 'cosmetics', 'skincare', 'grooming', 'parlour', 'parlor', 'personal care'],
  other: ['misc', 'miscellaneous'],
}

const INCOME_WORDS = {
  salary: ['salary', 'payday', 'paycheck', 'stipend', 'wages', 'payroll'],
  freelance: ['freelance', 'client', 'gig', 'consulting', 'side hustle'],
  interest: ['interest', 'fd', 'fixed deposit', 'dividend', 'dividends'],
  refund: ['refund', 'cashback', 'cash back', 'reversal', 'reimbursement'],
  bonus: ['bonus', 'incentive', 'reward', 'rewards'],
  gift_in: ['gift', 'gifted', 'shagun'],
  other_in: ['misc', 'miscellaneous'],
}

function scan(text, dictionary) {
  const q = norm(text)
  if (!q) return null
  let best = null
  for (const [id, list] of Object.entries(dictionary)) {
    for (const word of list) {
      const hit = hasPhrase(q, word) || (!word.endsWith('s') && hasPhrase(q, `${word}s`))
      if (hit && (!best || word.length > best.word.length)) best = { id, word }
    }
  }
  return best
}

/** Category id implied by free text ("swiggy dinner" → food), or ''. */
export function guessCategory(text, type = 'expense') {
  return scan(text, type === 'income' ? INCOME_WORDS : EXPENSE_WORDS)?.id || ''
}

/** Turns a model- or user-supplied category (id, label or keyword) into a valid id for `type`, or ''. */
export function resolveCategory(value, type = 'expense') {
  const income = type === 'income'
  const ids = income ? INCOME_IDS : EXPENSE_IDS
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return ''
  if (ids.has(raw)) return raw
  if (income && raw === 'other') return 'other_in'
  if (income && raw === 'gift') return 'gift_in'
  const list = income ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
  const q = norm(raw)
  const named = list.find((c) => norm(c.label) === q || norm(c.short) === q || norm(c.label).startsWith(`${q} `))
  if (named) return named.id
  return guessCategory(raw, type)
}
