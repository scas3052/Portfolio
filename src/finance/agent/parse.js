// Forgiving readers for amounts, dates and months typed by the user or sent by the model:
// "1.5k", "₹1,200/-", "2 lakh", "last monday", "5th", "10/11", "Oct 2026".
import { evaluate } from '../lib/calc'
import { addDays, addMonths, isISODate, isMonth, monthOf, weekday } from '../lib/dates'
import { round2 } from '../lib/format'

const SCALE = { k: 1e3, thousand: 1e3, l: 1e5, lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, cr: 1e7, crore: 1e7, crores: 1e7 }
const CURRENCY = /₹|(?<![a-z])(?:rs\.?|inr|rupees?|bucks)(?![a-z])|\/-(?!\s*[\d(.])/g
const UNIT = /(\d+(?:\.\d+)?|\.\d+)\s*(thousand|lakhs?|lacs?|crores?|cr|k|l)\b/g

const stripCurrency = (text) => text.replace(CURRENCY, '')
const expandUnits = (text) => text.replace(UNIT, (_, n, unit) => `(${n}*${SCALE[unit]})`)

/** A rupee amount from a number or text, or NaN. Allows arithmetic: "450+120". */
export function parseMoney(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? round2(value) : NaN
  if (value == null) return NaN
  const result = evaluate(expandUnits(stripCurrency(String(value).toLowerCase())))
  return result == null ? NaN : result
}

/** Calculator for the model: + - * / ( ), "18% of 2500", "1.2 lakh / 12". */
export function calculate(expression) {
  const text = stripCurrency(String(expression ?? '').toLowerCase())
    .replace(/(\d+(?:\.\d+)?)\s*%\s*of\b/g, '($1/100)*')
    .replace(/(\d+(?:\.\d+)?)\s*%/g, '($1/100)')
  return evaluate(expandUnits(text))
}

export function cleanText(value, max = 140) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

export function parseJSON(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

const pad = (n) => String(n).padStart(2, '0')
const ymd = (year, month1, day) => `${year}-${pad(month1)}-${pad(day)}`

function monthIndex(word) {
  const w = String(word).replace(/\.$/, '')
  if (w === 'sept') return 8
  if (w.length < 3) return -1
  return MONTH_NAMES.findIndex((name) => name.startsWith(w))
}

function dayIndex(word) {
  if (word.length < 3) return -1
  return DAY_NAMES.findIndex((name) => name.startsWith(word))
}

/** The latest valid date with this month/day that isn't after today. */
function pastDate(month0, day, today) {
  const year = Number(today.slice(0, 4))
  const now = ymd(year, month0 + 1, day)
  if (isISODate(now) && now <= today) return now
  const before = ymd(year - 1, month0 + 1, day)
  return isISODate(before) ? before : null
}

function withYear(month0, day, year, today) {
  if (!year) return pastDate(month0, day, today)
  const date = ymd(year, month0 + 1, day)
  return isISODate(date) ? date : null
}

function readDate(raw, today) {
  const t = String(raw).toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ').trim().replace(/^on /, '').replace(/^the /, '')
  if (!t || t === 'today' || t === 'now' || t === 'tonight') return today
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return isISODate(t.slice(0, 10)) ? t.slice(0, 10) : null
  if (t === 'yesterday' || t === 'yday' || t === 'last night') return addDays(today, -1)
  if (t === 'day before yesterday') return addDays(today, -2)
  if (t === 'tomorrow') return addDays(today, 1)
  let m = t.match(/^(\d{1,3}|a|one) days? ago$/)
  if (m) return addDays(today, /^\d/.test(m[1]) ? -Number(m[1]) : -1)
  m = t.match(/^(last |this |past )?([a-z]+)$/)
  if (m && dayIndex(m[2]) >= 0) {
    let back = (weekday(today) - dayIndex(m[2]) + 7) % 7
    if (m[1] === 'last ' && back === 0) back = 7
    return addDays(today, -back)
  }
  m = t.match(/^(\d{1,2})(?:st|nd|rd|th)?(?: of)? ([a-z]+\.?)(?: (\d{4}))?$/)
  if (m && monthIndex(m[2]) >= 0) return withYear(monthIndex(m[2]), Number(m[1]), m[3], today)
  m = t.match(/^([a-z]+\.?) (\d{1,2})(?:st|nd|rd|th)?(?: (\d{4}))?$/)
  if (m && monthIndex(m[1]) >= 0) return withYear(monthIndex(m[1]), Number(m[2]), m[3], today)
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/)
  if (m) {
    // Indian order (DD/MM), unless that's impossible and MM/DD isn't.
    let day = Number(m[1])
    let month = Number(m[2])
    if (month > 12 && day <= 12) [day, month] = [month, day]
    if (month < 1 || month > 12) return null
    if (!m[3]) return pastDate(month - 1, day, today)
    const date = ymd(m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]), month, day)
    return isISODate(date) ? date : null
  }
  m = t.match(/^(\d{1,2})(?:st|nd|rd|th)$/)
  if (m) {
    const now = `${monthOf(today)}-${pad(m[1])}`
    if (isISODate(now) && now <= today) return now
    const previous = `${addMonths(monthOf(today), -1)}-${pad(m[1])}`
    return isISODate(previous) ? previous : null
  }
  return null
}

/** `{date}` (ISO), with a `warning` when it fell back to today or lies in the future. */
export function parseDate(value, today) {
  const raw = cleanText(value, 40)
  const date = readDate(raw, today)
  if (!date) return { date: today, warning: `Couldn’t read the date “${raw}”; used today`, unread: true }
  if (date > today) return { date, warning: 'Dated in the future' }
  return { date }
}

/** `{month}` (YYYY-MM) from "2026-10", "last month", "oct", "October 2025"; else `{error}`. */
export function monthArg(value, today) {
  const thisMonth = monthOf(today)
  const t = String(value ?? '').toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ').trim()
  if (!t || t === 'this month' || t === 'current' || t === 'current month' || t === 'now') return { month: thisMonth }
  if (t === 'last month' || t === 'previous month' || t === 'prev month') return { month: addMonths(thisMonth, -1) }
  if (isMonth(t)) return { month: t }
  if (isISODate(t.slice(0, 10))) return { month: t.slice(0, 7) }
  const m = t.match(/^([a-z]+)\.?(?: (\d{4}))?$/)
  const index = m ? monthIndex(m[1]) : -1
  if (index >= 0) {
    if (m[2]) return { month: `${m[2]}-${pad(index + 1)}` }
    const year = Number(thisMonth.slice(0, 4))
    const month = `${year}-${pad(index + 1)}`
    return { month: month <= thisMonth ? month : `${year - 1}-${pad(index + 1)}` }
  }
  return { error: `Month must be YYYY-MM, like ${thisMonth}.` }
}
