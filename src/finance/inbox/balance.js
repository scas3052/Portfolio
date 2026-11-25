// The weekly balance check: what the bank says an account holds against what the book says, so payments that never
// sent an SMS or an app alert still show up as a gap to explain. Kept on this phone only, like the filing rules.
import { diffDays, isISODate } from '../lib/dates'
import { round2 } from '../lib/format'

const KEY = 'gullak:inbox:balance'
export const CHECK_EVERY_DAYS = 7
export const REMINDER_HOUR = 19
const EMPTY = Object.freeze({ enabled: false, weekday: 0, accounts: [], last: {} })

let snapshot = null
const listeners = new Set()

function storage() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** A safe copy of whatever was stored: which accounts to check, on which weekday, and each account's last check. */
export function cleanChecks(raw) {
  if (!raw || typeof raw !== 'object') return EMPTY
  const weekday = Number(raw.weekday)
  const last = {}
  if (raw.last && typeof raw.last === 'object') {
    for (const [id, check] of Object.entries(raw.last)) {
      if (!check || !isISODate(check.date) || !Number.isFinite(check.actual) || !Number.isFinite(check.book)) continue
      last[id] = { date: check.date, actual: round2(check.actual), book: round2(check.book) }
    }
  }
  return {
    enabled: Boolean(raw.enabled),
    weekday: Number.isInteger(weekday) && weekday >= 0 && weekday <= 6 ? weekday : 0,
    accounts: Array.isArray(raw.accounts) ? [...new Set(raw.accounts.filter((id) => typeof id === 'string' && id))] : [],
    last,
  }
}

export function readChecks() {
  if (snapshot) return snapshot
  try {
    snapshot = cleanChecks(JSON.parse(storage()?.getItem(KEY) || 'null'))
  } catch {
    snapshot = cleanChecks(null)
  }
  return snapshot
}

export function writeChecks(next) {
  snapshot = cleanChecks(next)
  try {
    storage()?.setItem(KEY, JSON.stringify(snapshot))
  } catch {
    // Storage full or blocked: the settings still apply until Gullak is closed.
  }
  listeners.forEach((listener) => listener())
  return snapshot
}

export function updateChecks(change) {
  return writeChecks(change(readChecks()))
}

export function subscribeChecks(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** For tests: forget the cached copy so the next read comes from storage. */
export function resetChecksCache() {
  snapshot = null
}

/** The checks with `check` ({date, actual, book}) recorded as this account's latest. */
export function withCheck(checks, accountId, check) {
  return { ...checks, last: { ...checks.last, [accountId]: { date: check.date, actual: round2(check.actual), book: round2(check.book) } } }
}

/** Accounts that can be checked: everything but cash, which no bank reports on. */
export const checkable = (accounts) => accounts.filter((a) => a.kind !== 'cash')

/** Accounts due a check: switched on, and never checked or last checked a week or more ago. */
export function dueChecks(checks, accounts, today) {
  if (!checks.enabled) return []
  return checkable(accounts).filter((account) => {
    if (!checks.accounts.includes(account.id)) return false
    const last = checks.last[account.id]
    return !last || diffDays(last.date, today) >= CHECK_EVERY_DAYS
  })
}

/** What an account's unfiled spends will move its book balance by once filed (money in positive, out negative). */
export function pendingFor(accountId, spends, accountOf) {
  let total = 0
  for (const spend of spends) {
    if (spend.status !== 'unfiled' || accountOf(spend)?.id !== accountId) continue
    total += ((spend.direction === 'in' ? 1 : -1) * spend.amountPaise) / 100
  }
  return round2(total)
}

/**
 * The bank's balance against the book's. `gap` is bank minus book; `pending` is what unfiled spends will explain;
 * `unexplained` is what's left after them (negative: money left the account that the book doesn't know about).
 * `square` when less than a rupee is unexplained.
 */
export function balanceGap({ actual, book, pending = 0 }) {
  const gap = round2(actual - book)
  const unexplained = round2(gap - pending)
  return { gap, pending: round2(pending), unexplained, square: Math.abs(unexplained) < 1 }
}

/** The entry that brings the book in line with the bank for whatever is left unexplained, dated `today`. */
export function adjustmentEntry(account, unexplained, today) {
  const amount = round2(Math.abs(unexplained))
  if (!(amount > 0)) return null
  const out = unexplained < 0
  return {
    type: out ? 'expense' : 'income',
    amount,
    date: today,
    category: out ? 'other' : 'other_in',
    note: 'Unaccounted (balance check)',
    accountId: account.id,
  }
}
