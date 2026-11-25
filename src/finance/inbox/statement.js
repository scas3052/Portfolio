// Bank statements: a CSV, Excel (.xlsx) or HTML-table export read into transactions, checked against the book and
// the payments Gullak already caught, so only the missing ones become unfiled spends. For an account that sends
// no SMS and whose app sends no alert, this is how its payments reach Gullak at all.
import { isISODate, toISODate } from '../lib/dates'
import { tidyName } from './parse'
import { isOldExcel, isZip, readXlsx } from './xlsx'

const MAX_ROWS = 5000
export const MAX_FILE_BYTES = 5 * 1024 * 1024
const HEADER_SEARCH_ROWS = 40
const pad = (n) => String(n).padStart(2, '0')

/** A statement Gullak can't read, with a reason the import screen turns into words. */
export class StatementError extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Reading files into rows of cells

function guessDelimiter(text) {
  const sample = text.split(/\r?\n/).slice(0, 30).join('\n')
  const counts = [',', ';', '\t', '|'].map((d) => [d, sample.split(d).length - 1]).sort((a, b) => b[1] - a[1])
  return counts[0][1] > 0 ? counts[0][0] : ','
}

/** Rows of cells from CSV text. The delimiter (comma, semicolon, tab or pipe) is worked out from the text. */
export function parseCsv(text) {
  const source = String(text ?? '').replace(/^\uFEFF/, '')
  const delimiter = guessDelimiter(source)
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < source.length && rows.length < MAX_ROWS; i += 1) {
    const ch = source[i]
    if (quoted) {
      if (ch !== '"') cell += ch
      else if (source[i + 1] === '"') {
        cell += '"'
        i += 1
      } else quoted = false
    } else if (ch === '"' && !cell.trim()) {
      quoted = true
      cell = ''
    } else if (ch === delimiter) {
      row.push(cell.trim())
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i += 1
      row.push(cell.trim())
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += ch
    }
  }
  if (cell.trim() || row.length) {
    row.push(cell.trim())
    rows.push(row)
  }
  return rows
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

function htmlText(fragment) {
  return fragment
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, code) => {
      if (code[0] !== '#') return ENTITIES[code.toLowerCase()] ?? all
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : all
    })
    .replace(/\s+/g, ' ')
    .trim()
}

/** Rows of cells from an HTML table, which is what many banks' ".xls" downloads really are. */
export function parseHtmlTable(html) {
  const rows = []
  for (const row of String(html ?? '').matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = []
    for (const cell of row[1].matchAll(/<t([dh])\b([^>]*)>([\s\S]*?)<\/t\1>/gi)) {
      cells.push(htmlText(cell[3]))
      const span = Number(/colspan\s*=\s*["']?(\d+)/i.exec(cell[2])?.[1] || 1)
      for (let k = 1; k < Math.min(span, 20); k += 1) cells.push('')
    }
    if (cells.length) rows.push(cells)
    if (rows.length >= MAX_ROWS) break
  }
  return rows
}

/** The rows of a statement file: CSV or text, Excel (.xlsx), or an HTML table saved as .xls. */
export async function readStatementFile(file) {
  if (!file) throw new StatementError('empty')
  if (file.size > MAX_FILE_BYTES) throw new StatementError('too-big')
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!bytes.length) throw new StatementError('empty')
  if (isZip(bytes)) {
    try {
      return await readXlsx(bytes)
    } catch {
      throw new StatementError('unreadable')
    }
  }
  if (isOldExcel(bytes)) throw new StatementError('old-excel')
  if (bytes.subarray(0, 1024).includes(0)) throw new StatementError('unreadable')
  const text = new TextDecoder().decode(bytes)
  if (/<table\b/i.test(text.slice(0, 200000))) return parseHtmlTable(text)
  return parseCsv(text)
}

// ---------------------------------------------------------------------------------------------------------------
// Finding the columns

const HEADS = [
  ['type', /^(?:dr ?\/ ?cr|cr ?\/ ?dr|d ?\/ ?c|c ?\/ ?d|type|txn type|tran type|transaction type|debit ?\/ ?credit|credit ?\/ ?debit)$/],
  ['balance', /balance|^bal\.?$|^closing bal/],
  ['valueDate', /^value ?(?:date|dt\.?)$/],
  ['date', /^(?:txn|tran|trans|transaction|posting|posted|post|book|booking)? ?(?:date|dt)(?: time)?$|^date of (?:txn|transaction)$/],
  ['ref', /\bref|chq|cheque|\butr\b|instrument|^transaction id$/],
  ['debit', /withdrawal|debit|^dr\.?$|paid out|amount debited|money out/],
  ['credit', /deposit|credit|^cr\.?$|paid in|amount credited|money in/],
  ['amount', /^(?:txn|tran|transaction)? ?(?:amount|amt\.?)$/],
  ['description', /narration|description|particulars|remarks|details|^info$|^transaction$/],
]

const headerText = (cell) =>
  String(cell ?? '')
    .toLowerCase()
    .replace(/\((?:inr|rs\.?|₹)\s*\)|\b(?:inr|rs)\b\.?|₹/g, '')
    .replace(/[^a-z/ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Which column holds what, from one header row. */
function columnsOf(row) {
  const columns = {}
  row.forEach((cell, index) => {
    const text = headerText(cell)
    if (!text) return
    const hit = HEADS.find(([, pattern]) => pattern.test(text))
    if (hit && columns[hit[0]] == null) columns[hit[0]] = index
  })
  return columns
}

const usable = (columns) =>
  (columns.date != null || columns.valueDate != null) && (columns.debit != null || columns.credit != null || columns.amount != null)

/** The header row (searching the first rows, past the bank's letterhead) and its columns, or null. */
export function findColumns(rows) {
  for (let index = 0; index < Math.min(rows.length, HEADER_SEARCH_ROWS); index += 1) {
    const columns = columnsOf(rows[index] || [])
    if (usable(columns)) return { headerRow: index, columns, headers: (rows[index] || []).map((c) => String(c ?? '').trim()) }
  }
  return null
}

// ---------------------------------------------------------------------------------------------------------------
// Dates and amounts

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }
const monthNumber = (name) => MONTHS[String(name).slice(0, 3).toLowerCase()] || 0
const fullYear = (y) => {
  const n = Number(y)
  return n < 100 ? 2000 + n : n
}

function iso(y, m, d) {
  if (!y || !m || !d) return ''
  const value = `${y}-${pad(m)}-${pad(d)}`
  return isISODate(value) ? value : ''
}

/** An Excel day number (days since 30 Dec 1899) as a date, for .xlsx cells formatted as dates. */
function excelDate(serial) {
  if (!(serial > 20000 && serial < 80000)) return ''
  const date = new Date(Math.round((serial - 25569) * 86400000))
  return iso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
}

const NUMERIC_DATE = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/

/** 'dmy' or 'mdy' for all-number dates: day first unless some date only makes sense month first. */
export function detectDateOrder(values) {
  let dayFirst = false
  let monthFirst = false
  for (const value of values) {
    const m = NUMERIC_DATE.exec(String(value ?? '').trim())
    if (!m) continue
    if (Number(m[1]) > 12) dayFirst = true
    if (Number(m[2]) > 12) monthFirst = true
  }
  return monthFirst && !dayFirst ? 'mdy' : 'dmy'
}

/** "21/11/26", "21-11-2026", "21 Nov 2026", "Nov 21, 2026", "2026-11-21" or an Excel day number → "2026-11-21", else ''. */
export function parseDate(value, order = 'dmy') {
  if (typeof value === 'number') return excelDate(value)
  const text = String(value ?? '').trim()
  if (!text) return ''
  if (/^\d{5}(?:\.\d+)?$/.test(text)) return excelDate(Number(text))
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/.exec(text)
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]))
  m = /^(\d{1,2})(?:st|nd|rd|th)?[-/. ]+([a-z]{3,9})[-/., ]+(\d{2,4})\b/i.exec(text)
  if (m) return iso(fullYear(m[3]), monthNumber(m[2]), Number(m[1]))
  m = /^([a-z]{3,9})[-/. ]+(\d{1,2}),?[-/. ]+(\d{2,4})\b/i.exec(text)
  if (m) return iso(fullYear(m[3]), monthNumber(m[1]), Number(m[2]))
  m = NUMERIC_DATE.exec(text)
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])]
    return order === 'mdy' ? iso(fullYear(m[3]), a, b) : iso(fullYear(m[3]), b, a)
  }
  return ''
}

/**
 * `{value, sign}` from "1,250.50", "₹ 1,250.50", "1250.50 Dr", "(1,250.50)" or "-1250.5": the rupees, and -1 for
 * money out (Dr, minus, brackets), 1 for money in (Cr, plus), 0 when the cell doesn't say. Null for no amount.
 */
export function parseAmount(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value !== 0 && Math.abs(value) < 1e9 ? { value: Math.round(Math.abs(value) * 100) / 100, sign: Math.sign(value) } : null
  }
  let text = String(value ?? '').trim()
  if (!text) return null
  let sign = 0
  if (/\bdr\.?$/i.test(text)) {
    sign = -1
    text = text.replace(/\bdr\.?$/i, '')
  } else if (/\bcr\.?$/i.test(text)) {
    sign = 1
    text = text.replace(/\bcr\.?$/i, '')
  }
  text = text.replace(/₹|\brs\b\.?|\binr\b/gi, '').replace(/[,\s]/g, '')
  if (/^\(.*\)$/.test(text)) {
    sign = -1
    text = text.slice(1, -1)
  }
  if (text.startsWith('-')) {
    sign = -1
    text = text.slice(1)
  } else if (text.startsWith('+')) {
    sign = sign || 1
    text = text.slice(1)
  }
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null
  const n = Number(text)
  return n > 0 && n < 1e9 ? { value: Math.round(n * 100) / 100, sign } : null
}

const cellText = (row, index) => (index == null ? '' : String(row[index] ?? '').trim())

// ---------------------------------------------------------------------------------------------------------------
// Rows into transactions

/**
 * Transactions from a statement's rows: `{ok, transactions, skipped, columns, headerRow, headers, order}`. Rows
 * without a date and an amount (letterheads, opening balance, totals) are skipped. `columns` overrides any column
 * found from the header; `order` ('dmy' or 'mdy') overrides the date order worked out from the dates.
 */
export function readStatement(rows, { columns: override = null, order = null } = {}) {
  const found = findColumns(rows)
  if (!found && !override) return { ok: false, error: 'no-header' }
  const headerRow = found ? found.headerRow : -1
  const columns = { ...(found?.columns || {}), ...(override || {}) }
  const dateColumn = columns.date ?? columns.valueDate
  if (!usable(columns)) return { ok: false, error: 'no-header' }

  const body = rows.slice(headerRow + 1)
  const dateOrder = order || detectDateOrder(body.map((row) => row[dateColumn]))
  const single = columns.debit == null && columns.credit == null
  // A lone amount column with no Dr/Cr column: if some amounts are negative, unsigned ones are money in.
  const unsignedIs =
    single && columns.type == null && body.some((row) => parseAmount(row[columns.amount])?.sign === -1) ? 'in' : 'out'

  const transactions = []
  let skipped = 0
  for (const row of body) {
    if (!row || !row.some((cell) => String(cell ?? '').trim())) continue
    const date = parseDate(row[dateColumn], dateOrder)
    let amount = null
    let direction = null
    if (!single) {
      const debit = parseAmount(row[columns.debit])
      const credit = parseAmount(row[columns.credit])
      if (debit && !credit) [amount, direction] = [debit.value, 'out']
      else if (credit && !debit) [amount, direction] = [credit.value, 'in']
    } else {
      const parsed = parseAmount(row[columns.amount])
      if (parsed) {
        amount = parsed.value
        const type = cellText(row, columns.type).toLowerCase()
        if (/^(?:dr|d|debit|withdrawal|out)\b/.test(type)) direction = 'out'
        else if (/^(?:cr|c|credit|deposit|in)\b/.test(type)) direction = 'in'
        else if (parsed.sign) direction = parsed.sign < 0 ? 'out' : 'in'
        else direction = unsignedIs
      }
    }
    if (!date || !amount || !direction) {
      skipped += 1
      continue
    }
    const balance = parseAmount(row[columns.balance])
    transactions.push({
      date,
      description: cellText(row, columns.description),
      ref: cellText(row, columns.ref),
      amount,
      direction,
      balance: balance ? balance.value * (balance.sign < 0 ? -1 : 1) : null,
      text: row
        .map((cell) => String(cell ?? '').trim())
        .filter(Boolean)
        .join(' | ')
        .slice(0, 400),
    })
  }
  return {
    ok: transactions.length > 0,
    error: transactions.length ? null : 'no-rows',
    transactions,
    skipped,
    columns,
    headerRow,
    headers: found?.headers || [],
    order: dateOrder,
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Who a line was with

// Narrations use '-' and '/' between fields, so a UPI id here stops at a hyphen.
const VPA = /\b([a-z0-9][a-z0-9._]{0,63}@[a-z][a-z0-9]{1,30})\b/i
const IFSC = /^[a-z]{4}0[a-z0-9]{6}$/i
const RAIL =
  /^(?:upi|imps|neft|rtgs|nach|ach|ecs|pos|atm|atw|nfs|ib|mb|inb|bil|bill|billpay|onl|online|by|to|from|for|transfer|trf|tfr|dr|cr|p2a|p2m|p2p|payment|pay|paid|via|ref|txn|ft|int|mmt|vps|eaw|cash|wdl|chq|clg|self|sent|received|collect|request|na|null|ph|phone|mobile|app|using)$/i

function nameIn(piece) {
  const words = piece.split(/\s+/).filter((word) => word && !/\d{4,}/.test(word) && !/x{3,}/i.test(word))
  while (words.length && RAIL.test(words[0])) words.shift()
  if (!words.length || words.every((word) => RAIL.test(word))) return ''
  const name = tidyName(words.join(' '))
  return /[a-z]{2}/i.test(name) && !IFSC.test(name) && !VPA.test(name) ? name : ''
}

/** The 12-digit bank reference (UPI RRN) in a reference cell like "0000432112345678", or null. */
export function rrnFrom(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits.length >= 12 && digits.length <= 16 ? digits.slice(-12) : null
}

/**
 * Who a statement line was with: `{party, vpa, ref, channel}` from narrations like
 * "UPI-SWIGGY-swiggy@icici-ICIC0DC0099-432112345678-UPI" or "TO TRANSFER-UPI/DR/432112345678/SWIGGY/YESB/…".
 */
export function describeLine(text) {
  const line = String(text ?? '')
  const vpaMatch = VPA.exec(line)
  const vpa = vpaMatch ? vpaMatch[1].toLowerCase() : null
  const ref = /(?:^|\D)(\d{12})(?!\d)/.exec(line)?.[1] || null
  let channel = null
  if (/\bupi\b/i.test(line)) channel = 'upi'
  else if (/\b(?:atm|atw|nfs|eaw|cash wdl)\b/i.test(line)) channel = 'atm'
  else if (/\bpos\b/i.test(line)) channel = 'card'
  else if (/\b(?:neft|imps|rtgs)\b/i.test(line)) channel = 'netbanking'
  if (channel === 'atm') return { party: 'ATM', vpa, ref, channel }
  // Names come before the UPI id; what follows it is usually the payee's bank or a note.
  const before = vpaMatch ? line.slice(0, vpaMatch.index) : line
  let party = null
  for (const piece of before.split(/[/\-|:*]+|\s{2,}/)) {
    party = nameIn(piece.trim()) || null
    if (party) break
  }
  return { party, vpa, ref, channel }
}

// ---------------------------------------------------------------------------------------------------------------
// What's new

const OUT_TYPES = new Set(['expense', 'emi', 'lend', 'repay'])
const IN_TYPES = new Set(['income', 'borrow', 'collect'])
const dayGap = (a, b) => Math.abs(Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000))

function bookMatches(txn, line, accountId, gap) {
  if (Math.abs(txn.amount - line.amount) > 0.005 || dayGap(txn.date, line.date) !== gap) return false
  if (txn.type === 'transfer') return (line.direction === 'out' ? txn.accountId : txn.toAccountId) === accountId
  if (!(line.direction === 'out' ? OUT_TYPES : IN_TYPES).has(txn.type)) return false
  return !txn.accountId || txn.accountId === accountId
}

function spendMatches(spend, line, gap, onAccount) {
  if (spend.amountPaise !== Math.round(line.amount * 100) || spend.direction !== line.direction) return false
  return dayGap(toISODate(new Date(spend.at)), line.date) === gap && onAccount(spend)
}

/**
 * Splits statement lines into `inBook` (an entry for it is already in the book), `caught` (Gullak already caught
 * it, filed or not) and `fresh` (new). Each entry or caught payment stands for one line at most, so two ₹20 teas on
 * one day stay two; exact dates are matched before next-day ones. `onAccount(spend)` says whether a caught payment
 * could be on this account.
 */
export function planImport(lines, { accountId, transactions = [], spends = [], onAccount = () => true }) {
  const usedTxns = new Set()
  const usedSpends = new Set()
  const found = lines.map(() => null)
  for (const gap of [0, 1]) {
    lines.forEach((line, i) => {
      if (found[i]) return
      const txn = transactions.find((t) => !usedTxns.has(t.id) && bookMatches(t, line, accountId, gap))
      if (txn) {
        usedTxns.add(txn.id)
        found[i] = 'inBook'
        return
      }
      const spend = spends.find((s) => !usedSpends.has(s.id) && spendMatches(s, line, gap, onAccount))
      if (spend) {
        usedSpends.add(spend.id)
        found[i] = 'caught'
      }
    })
  }
  const plan = { inBook: [], caught: [], fresh: [] }
  lines.forEach((line, i) => plan[found[i] || 'fresh'].push(line))
  return plan
}

/** What the phone stores for each new line: an unfiled spend on the chosen account, at noon on its date. */
export function toImportRows(lines, account) {
  return lines.map((line) => {
    const about = describeLine(line.description)
    const [y, m, d] = line.date.split('-').map(Number)
    return {
      amountPaise: Math.round(line.amount * 100),
      direction: line.direction,
      at: new Date(y, m - 1, d, 12).getTime(),
      party: about.party,
      vpa: about.vpa,
      ref: about.ref || rrnFrom(line.ref),
      channel: about.channel,
      account: account?.last4 || null,
      bank: account?.bank || null,
      accountId: account?.id || null,
      text: line.text || line.description,
    }
  })
}
