// Dates are stored as local calendar strings ("YYYY-MM-DD", months as "YYYY-MM")
// so entries never drift across time zones.

const pad = (n) => String(n).padStart(2, '0')

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function toISODate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function todayISO() {
  return toISODate(new Date())
}

export function parseISO(iso) {
  const [y, m, d] = String(iso).split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export function isISODate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  return toISODate(parseISO(value)) === value
}

export function isMonth(value) {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}

export function monthOf(iso) {
  return String(iso).slice(0, 7)
}

export function addMonths(month, n) {
  const [y, m] = month.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  const year = Math.floor(total / 12)
  const index = ((total % 12) + 12) % 12
  return `${year}-${pad(index + 1)}`
}

export function monthDiff(fromMonth, toMonth) {
  const [y1, m1] = fromMonth.split('-').map(Number)
  const [y2, m2] = toMonth.split('-').map(Number)
  return (y2 - y1) * 12 + (m2 - m1)
}

export function daysInMonth(month) {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

export function dateInMonth(month, day) {
  const clamped = Math.min(Math.max(1, Math.round(day) || 1), daysInMonth(month))
  return `${month}-${pad(clamped)}`
}

export function addDays(iso, n) {
  const date = parseISO(iso)
  date.setDate(date.getDate() + n)
  return toISODate(date)
}

/** Whole days from `fromIso` to `toIso` (positive when `toIso` is later). */
export function diffDays(fromIso, toIso) {
  return Math.round((parseISO(toIso) - parseISO(fromIso)) / 86400000)
}

export function weekday(iso) {
  return parseISO(iso).getDay()
}

export function monthLabel(month, style = 'long') {
  const [y, m] = month.split('-').map(Number)
  const name = MONTHS[m - 1] || ''
  return style === 'short' ? `${name.slice(0, 3)} ${y}` : `${name} ${y}`
}

export function shortMonth(month) {
  const m = Number(month.split('-')[1])
  return (MONTHS[m - 1] || '').slice(0, 3)
}

export function formatDay(iso, { year = false } = {}) {
  const date = parseISO(iso)
  const base = `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()].slice(0, 3)}`
  return year ? `${base} ${date.getFullYear()}` : base
}

export function shortDate(iso) {
  const date = parseISO(iso)
  return `${date.getDate()} ${MONTHS[date.getMonth()].slice(0, 3)}`
}

export function relativeDay(iso, today) {
  const diff = diffDays(today, iso)
  if (diff === 0) return 'Today'
  if (diff === -1) return 'Yesterday'
  if (diff === 1) return 'Tomorrow'
  return formatDay(iso, { year: iso.slice(0, 4) !== today.slice(0, 4) })
}

export function inDays(days) {
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  return days > 0 ? `in ${days} days` : `${-days} days ago`
}

export function greeting(hour) {
  if (hour < 5) return 'Up late'
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export function currentHour() {
  return new Date().getHours()
}

export function msUntilMidnight() {
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return next - now
}
