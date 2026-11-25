// Reading .xlsx statements without a library: a workbook built here (zipped with node:zlib) is read back.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deflateRawSync } from 'node:zlib'
import { readStatement } from '../../src/finance/inbox/statement.js'
import { columnIndex, isOldExcel, isZip, readXlsx } from '../../src/finance/inbox/xlsx.js'

/** A minimal zip (deflated entries, no CRCs, which the reader doesn't check). */
function zip(files) {
  const parts = []
  const central = []
  let offset = 0
  for (const [name, text, stored] of files) {
    const raw = Buffer.from(text)
    const data = stored ? raw : deflateRawSync(raw)
    const nameBytes = Buffer.from(name)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(stored ? 0 : 8, 8)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    parts.push(local, nameBytes, data)
    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0)
    entry.writeUInt16LE(20, 4)
    entry.writeUInt16LE(20, 6)
    entry.writeUInt16LE(stored ? 0 : 8, 10)
    entry.writeUInt32LE(data.length, 20)
    entry.writeUInt32LE(raw.length, 24)
    entry.writeUInt16LE(nameBytes.length, 28)
    entry.writeUInt32LE(offset, 42)
    central.push(entry, nameBytes)
    offset += local.length + nameBytes.length + data.length
  }
  const centralBytes = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(centralBytes.length, 12)
  end.writeUInt32LE(offset, 16)
  return new Uint8Array(Buffer.concat([...parts, centralBytes, end]))
}

const WORKBOOK = `<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Statement" sheetId="1" r:id="rId3"/></sheets></workbook>`
const RELS = `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="styles.xml" Type="x"/><Relationship Id="rId3" Type="x" Target="worksheets/data.xml"/></Relationships>`
const STRINGS = `<sst><si><t>Txn Date</t></si><si><t>Description</t></si><si><t>Debit</t></si><si><t>Credit</t></si><si><r><t>UPI/DR/532112345678/</t></r><r><t xml:space="preserve">CHAI POINT &amp; CO</t></r><rPh><t>x</t></rPh></si></sst>`
const SHEET = `<worksheet><sheetData>
<row r="1"><c r="A1" t="inlineStr"><is><t>Account statement</t></is></c></row>
<row r="3"><c r="A3" t="s"><v>0</v></c><c r="B3" t="s"><v>1</v></c><c r="C3" t="s"><v>2</v></c><c r="D3" t="s"><v>3</v></c></row>
<row r="4"><c r="A4" s="2"><v>46347</v></c><c r="B4" t="s"><v>4</v></c><c r="C4"><v>120.5</v></c></row>
<row r="5"><c r="A5" t="str"><v>22/11/2026</v></c><c r="B5" t="inlineStr"><is><t>SALARY</t></is></c><c r="D5"><v>72000</v></c></row>
</sheetData></worksheet>`

test('column letters become indexes', () => {
  assert.equal(columnIndex('A'), 0)
  assert.equal(columnIndex('Z'), 25)
  assert.equal(columnIndex('AA'), 26)
})

test('a workbook is recognised by its first bytes', () => {
  assert.equal(isZip(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0])), true)
  assert.equal(isOldExcel(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0])), true)
})

test('the first sheet is read through the workbook relationships, with shared and inline strings', async () => {
  const bytes = zip([
    ['[Content_Types].xml', '<Types/>', true],
    ['xl/workbook.xml', WORKBOOK],
    ['xl/_rels/workbook.xml.rels', RELS],
    ['xl/sharedStrings.xml', STRINGS],
    ['xl/worksheets/data.xml', SHEET],
  ])
  const rows = await readXlsx(bytes)
  assert.deepEqual(rows[0], ['Account statement'])
  assert.deepEqual(rows[1], ['Txn Date', 'Description', 'Debit', 'Credit'])
  assert.deepEqual(rows[2], [46347, 'UPI/DR/532112345678/CHAI POINT & CO', 120.5])
  assert.deepEqual(rows[3], ['22/11/2026', 'SALARY', '', 72000])

  const result = readStatement(rows)
  assert.deepEqual(
    result.transactions.map((t) => [t.date, t.direction, t.amount]),
    [
      ['2026-11-21', 'out', 120.5],
      ['2026-11-22', 'in', 72000],
    ],
  )
})

test('a zip that is not a workbook is refused', async () => {
  await assert.rejects(readXlsx(zip([['hello.txt', 'hi']])), /not-a-workbook/)
})
