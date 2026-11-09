import { ACCOUNT_KINDS, PEOPLE_TYPES, TONES } from './categories'
import { isISODate, isMonth } from './dates'
import { round2 } from './format'

export const SCHEMA_VERSION = 1
export const TXN_TYPES = ['expense', 'income', 'transfer', 'emi', ...PEOPLE_TYPES]

export function emptyState() {
  return {
    version: SCHEMA_VERSION,
    settings: { name: '', privacy: false, pinHash: null, onboarded: false },
    accounts: [],
    transactions: [],
    loans: [],
    people: [],
    budgets: {},
    goals: [],
    meta: { sample: false },
  }
}

const text = (value, max = 120) => (typeof value === 'string' ? value.trim().slice(0, max) : '')
const num = (value, fallback = 0) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}
const tone = (value, index = 0) => (TONES.includes(value) ? value : TONES[index % TONES.length])

function normalizeAccount(raw, index) {
  if (!raw || typeof raw !== 'object' || !raw.id) return null
  return {
    id: String(raw.id),
    name: text(raw.name, 40) || 'Account',
    kind: ACCOUNT_KINDS.some((k) => k.id === raw.kind) ? raw.kind : 'savings',
    bank: text(raw.bank, 40),
    last4: text(raw.last4, 4).replace(/\D/g, ''),
    opening: round2(num(raw.opening)),
    color: tone(raw.color, index),
  }
}

function normalizeTxn(raw) {
  if (!raw || typeof raw !== 'object' || !raw.id) return null
  if (!TXN_TYPES.includes(raw.type) || !isISODate(raw.date)) return null
  const amount = round2(num(raw.amount))
  if (!(amount > 0)) return null
  return {
    id: String(raw.id),
    type: raw.type,
    amount,
    date: raw.date,
    note: text(raw.note, 140),
    category: text(raw.category, 30),
    accountId: raw.accountId ? String(raw.accountId) : '',
    toAccountId: raw.toAccountId ? String(raw.toAccountId) : '',
    personId: raw.personId ? String(raw.personId) : '',
    loanId: raw.loanId ? String(raw.loanId) : '',
    createdAt: num(raw.createdAt),
  }
}

function normalizeLoan(raw, index) {
  if (!raw || typeof raw !== 'object' || !raw.id) return null
  const tenure = Math.max(1, Math.round(num(raw.tenure, 12)))
  return {
    id: String(raw.id),
    name: text(raw.name, 40) || 'Loan',
    lender: text(raw.lender, 40),
    emi: Math.max(0, round2(num(raw.emi))),
    tenure,
    paidBefore: Math.min(tenure, Math.max(0, Math.round(num(raw.paidBefore)))),
    startMonth: isMonth(raw.startMonth) ? raw.startMonth : '2025-01',
    dueDay: Math.min(31, Math.max(1, Math.round(num(raw.dueDay, 5)))),
    rate: Math.max(0, num(raw.rate)),
    principal: Math.max(0, round2(num(raw.principal))),
    accountId: raw.accountId ? String(raw.accountId) : '',
    color: tone(raw.color, index + 3),
  }
}

function normalizeGoal(raw, index) {
  if (!raw || typeof raw !== 'object' || !raw.id) return null
  return {
    id: String(raw.id),
    name: text(raw.name, 40) || 'Goal',
    target: Math.max(1, round2(num(raw.target, 1))),
    saved: Math.max(0, round2(num(raw.saved))),
    color: tone(raw.color, index + 1),
    deadline: isMonth(raw.deadline) ? raw.deadline : '',
  }
}

const compact = (list) => list.filter(Boolean)

/** Accepts anything (localStorage, imported JSON) and returns a safe state object. */
export function normalizeState(raw) {
  const base = emptyState()
  if (!raw || typeof raw !== 'object') return base
  const settings = raw.settings && typeof raw.settings === 'object' ? raw.settings : {}
  const budgets = {}
  if (raw.budgets && typeof raw.budgets === 'object') {
    for (const [key, value] of Object.entries(raw.budgets)) {
      const amount = round2(num(value))
      if (amount > 0) budgets[key] = amount
    }
  }
  return {
    version: SCHEMA_VERSION,
    settings: {
      name: text(settings.name, 40),
      privacy: Boolean(settings.privacy),
      pinHash: typeof settings.pinHash === 'string' ? settings.pinHash : null,
      onboarded: Boolean(settings.onboarded),
    },
    accounts: compact(Array.isArray(raw.accounts) ? raw.accounts.map(normalizeAccount) : []),
    transactions: compact(Array.isArray(raw.transactions) ? raw.transactions.map(normalizeTxn) : []),
    loans: compact(Array.isArray(raw.loans) ? raw.loans.map(normalizeLoan) : []),
    people: compact(
      Array.isArray(raw.people)
        ? raw.people.map((p) => (p && p.id ? { id: String(p.id), name: text(p.name, 40) || 'Someone' } : null))
        : [],
    ),
    budgets,
    goals: compact(Array.isArray(raw.goals) ? raw.goals.map(normalizeGoal) : []),
    meta: { sample: Boolean(raw.meta && raw.meta.sample) },
  }
}

export { normalizeTxn, normalizeAccount, normalizeLoan, normalizeGoal }
