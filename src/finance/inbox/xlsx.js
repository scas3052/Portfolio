// Reads the first sheet of an Excel workbook (.xlsx) into rows of cells, with no library: an .xlsx file is a zip of
// XML files. Entries are inflated with the platform's DecompressionStream (Android's WebView and Node both have
// it) and the sheet's XML is read with a few regular expressions, which is all its fixed shape needs.

const MAX_ROWS = 5000
const decoder = new TextDecoder()

/** True for a zip file, which is what every .xlsx is. */
export const isZip = (bytes) => bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04

/** True for the old binary Excel format (Excel 97–2003 .xls), which isn't read here. */
export const isOldExcel = (bytes) => bytes.length > 8 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0

/** name → {method, size, offset} for every file in the zip, from its central directory. */
function entries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i
      break
    }
  }
  if (end < 0) throw new Error('not-a-workbook')
  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  const list = new Map()
  for (let n = 0; n < count && at + 46 <= bytes.length; n += 1) {
    if (view.getUint32(at, true) !== 0x02014b50) break
    const nameLength = view.getUint16(at + 28, true)
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength))
    list.set(name, {
      method: view.getUint16(at + 10, true),
      size: view.getUint32(at + 20, true),
      offset: view.getUint32(at + 42, true),
    })
    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true)
  }
  return list
}

async function inflate(data) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function readEntry(bytes, entry) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(entry.offset, true) !== 0x04034b50) throw new Error('not-a-workbook')
  const start = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true)
  const data = bytes.subarray(start, start + entry.size)
  if (entry.method === 0) return decoder.decode(data)
  if (entry.method === 8) return decoder.decode(await inflate(data))
  throw new Error('not-a-workbook')
}

const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }

function unescape(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, code) => {
    if (code[0] !== '#') return ENTITIES[code.toLowerCase()] ?? all
    const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
    return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : all
  })
}

/** The text of every <t> run in an XML fragment (shared strings and inline strings can be split into runs). */
const runs = (xml) =>
  unescape(
    [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''),
  )

function sharedStrings(xml) {
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => runs(m[1]))
}

/** "A" → 0, "Z" → 25, "AA" → 26. */
export function columnIndex(letters) {
  let n = 0
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function sheetRows(xml, strings) {
  const rows = []
  for (const row of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const cells = []
    for (const cell of (row[1] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cell[1]
      const ref = /\br="([A-Za-z]+)\d*"/.exec(attrs)?.[1]
      const col = ref ? columnIndex(ref) : cells.length
      if (col < 0 || col > 200) continue
      const type = /\bt="(\w+)"/.exec(attrs)?.[1] || 'n'
      const body = cell[2] || ''
      let value = ''
      if (type === 'inlineStr') {
        value = runs(body)
      } else {
        const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1]
        if (raw != null) {
          if (type === 's') value = strings[Number(raw)] ?? ''
          else if (type === 'b') value = raw === '1' ? 'TRUE' : 'FALSE'
          else if (type === 'str' || type === 'e') value = unescape(raw)
          else {
            const n = Number(raw)
            value = Number.isFinite(n) ? n : unescape(raw)
          }
        }
      }
      while (cells.length < col) cells.push('')
      cells[col] = typeof value === 'string' ? value.trim() : value
    }
    rows.push(cells)
    if (rows.length >= MAX_ROWS) break
  }
  return rows
}

/** Rows of cell values (strings, or numbers for numeric cells, dates included) from the workbook's first sheet. */
export async function readXlsx(bytes) {
  const list = entries(bytes)
  const text = async (name) => (list.has(name) ? readEntry(bytes, list.get(name)) : '')
  const workbook = await text('xl/workbook.xml')
  const relations = await text('xl/_rels/workbook.xml.rels')
  const firstId = /<sheet\b[^>]*?\s[\w]+:id="([^"]+)"/.exec(workbook)?.[1]
  let path = ''
  if (firstId) {
    for (const rel of relations.matchAll(/<Relationship\b([^>]*)>/g)) {
      if (/\bId="([^"]+)"/.exec(rel[1])?.[1] !== firstId) continue
      const target = /\bTarget="([^"]+)"/.exec(rel[1])?.[1] || ''
      path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`
    }
  }
  if (!list.has(path)) path = [...list.keys()].find((name) => /^xl\/worksheets\/[^/]+\.xml$/.test(name)) || ''
  if (!path) throw new Error('not-a-workbook')
  return sheetRows(await text(path), sharedStrings(await text('xl/sharedStrings.xml')))
}
