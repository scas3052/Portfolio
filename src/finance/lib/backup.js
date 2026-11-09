import { categoryMeta, TYPE_META } from './categories'
import { normalizeState } from './schema'
import { byNewest } from './selectors'

export function downloadText(filename, text, mime = 'application/json') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function backupJSON(state, exportedAt) {
  return JSON.stringify({ app: 'gullak', exportedAt, data: state }, null, 2)
}

/** Parses a Gullak backup (wrapped or raw state). Throws an Error with a friendly message. */
export function parseBackup(text) {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('That file isn’t valid JSON.')
  }
  const data = parsed && parsed.app === 'gullak' && parsed.data ? parsed.data : parsed
  if (!data || typeof data !== 'object' || !Array.isArray(data.accounts) || !Array.isArray(data.transactions)) {
    throw new Error('This doesn’t look like a Gullak backup.')
  }
  return normalizeState(data)
}

const IN = new Set(['income', 'borrow', 'collect'])

function cell(value) {
  let text = String(value ?? '')
  // Stop spreadsheet apps from treating notes as formulas.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function transactionsCSV(state) {
  const accounts = new Map(state.accounts.map((a) => [a.id, a.name]))
  const people = new Map(state.people.map((p) => [p.id, p.name]))
  const loans = new Map(state.loans.map((l) => [l.id, l.name]))
  const header = ['Date', 'Type', 'Amount', 'Direction', 'Category', 'Account', 'To account', 'Person', 'Loan', 'Note']
  const rows = [...state.transactions].sort(byNewest).map((t) => [
    t.date,
    TYPE_META[t.type]?.label || t.type,
    t.amount.toFixed(2),
    t.type === 'transfer' ? 'move' : IN.has(t.type) ? 'in' : 'out',
    t.category ? categoryMeta(t.category).label : '',
    accounts.get(t.accountId) || '',
    accounts.get(t.toAccountId) || '',
    people.get(t.personId) || '',
    loans.get(t.loanId) || '',
    t.note,
  ])
  return `\uFEFF${[header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`
}
