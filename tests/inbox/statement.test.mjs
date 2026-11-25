// Bank statement import: reading CSV and HTML exports, finding the columns, and keeping only what's new.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  describeLine,
  detectDateOrder,
  findColumns,
  parseAmount,
  parseCsv,
  parseDate,
  parseHtmlTable,
  planImport,
  readStatement,
  readStatementFile,
  rrnFrom,
  StatementError,
  toImportRows,
} from '../../src/finance/inbox/statement.js'

const HDFC_CSV = [
  'HDFC BANK Ltd.,,,,,,',
  'Statement of account,,,,,,',
  ',,,,,,',
  'Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance',
  '21/11/26,UPI-SWIGGY-swiggy@icici-ICIC0DC0099-532112345678-UPI,0000532112345678,21/11/26,"1,250.00",,"85,432.10"',
  '22/11/26,NEFT CR-ICIC0000001-ACME CORP-NETBANK MUM-N123456789,N123456789,22/11/26,,"72,000.00","1,57,432.10"',
  '23/11/26,ATW-512345XXXXXX1234-S1ANBG12-BANGALORE,000000001234,23/11/26,2000,,"1,55,432.10"',
  ',,,,,,',
  'STATEMENT SUMMARY :-,,,,,,',
].join('\r\n')

test('CSV: quoted cells with commas, CRLF line ends, and the delimiter worked out', () => {
  assert.deepEqual(parseCsv('a;"b;c";d\n1;"say ""hi""";3'), [
    ['a', 'b;c', 'd'],
    ['1', 'say "hi"', '3'],
  ])
  assert.deepEqual(parseCsv('\uFEFFx\ty\n1\t2'), [
    ['x', 'y'],
    ['1', '2'],
  ])
})

test('the header row is found below the letterhead and every column is named', () => {
  const found = findColumns(parseCsv(HDFC_CSV))
  assert.equal(found.headerRow, 3)
  assert.deepEqual(found.columns, { date: 0, description: 1, ref: 2, valueDate: 3, debit: 4, credit: 5, balance: 6 })
})

test('an HDFC-style statement becomes money out and in, skipping the summary rows', () => {
  const result = readStatement(parseCsv(HDFC_CSV))
  assert.equal(result.ok, true)
  assert.equal(result.order, 'dmy')
  assert.deepEqual(
    result.transactions.map((t) => [t.date, t.direction, t.amount, t.balance]),
    [
      ['2026-11-21', 'out', 1250, 85432.1],
      ['2026-11-22', 'in', 72000, 157432.1],
      ['2026-11-23', 'out', 2000, 155432.1],
    ],
  )
  assert.equal(result.skipped, 1)
})

test('SBI-style columns with month names in the dates', () => {
  const rows = parseCsv(
    [
      'Txn Date,Value Date,Description,Ref No./Cheque No.,Debit,Credit,Balance',
      '21 Nov 2026,21 Nov 2026,TO TRANSFER-UPI/DR/532112345678/SWIGGY/YESB/swiggy.rzp@/Payment,532112345678,486.00,,"10,000.00"',
      '22-Nov-26,22-Nov-26,BY TRANSFER-NEFT*ICIC0000001*ACME,,,"5,000.00","15,000.00"',
    ].join('\n'),
  )
  const result = readStatement(rows)
  assert.deepEqual(
    result.transactions.map((t) => [t.date, t.direction, t.amount]),
    [
      ['2026-11-21', 'out', 486],
      ['2026-11-22', 'in', 5000],
    ],
  )
})

test('one amount column with a Dr/Cr column, or with signs', () => {
  const typed = readStatement(parseCsv('Date,Details,Amount,Dr / Cr\n2026-11-21,Swiggy,500,DR\n2026-11-22,Refund,120,CR'))
  assert.deepEqual(
    typed.transactions.map((t) => [t.direction, t.amount]),
    [
      ['out', 500],
      ['in', 120],
    ],
  )
  const signed = readStatement(parseCsv('Date,Description,Amount\n21/11/2026,Swiggy,-500.00\n22/11/2026,Salary,"72,000.00"'))
  assert.deepEqual(
    signed.transactions.map((t) => t.direction),
    ['out', 'in'],
  )
  const card = readStatement(parseCsv('Date,Transaction Description,Amount\n21/11/2026,AMAZON,"1,299.00"\n22/11/2026,PAYMENT RECEIVED,"5,000.00 Cr"'))
  assert.deepEqual(
    card.transactions.map((t) => t.direction),
    ['out', 'in'],
  )
})

test('dates: day first unless only month first makes sense, and overrides win', () => {
  assert.equal(detectDateOrder(['05/11/2026', '21/11/2026']), 'dmy')
  assert.equal(detectDateOrder(['11/05/2026', '11/21/2026']), 'mdy')
  assert.equal(detectDateOrder(['01/02/2026']), 'dmy')
  assert.equal(parseDate('01/02/2026'), '2026-02-01')
  assert.equal(parseDate('01/02/2026', 'mdy'), '2026-01-02')
  assert.equal(parseDate('Nov 21, 2026'), '2026-11-21')
  assert.equal(parseDate('21st November 2026'), '2026-11-21')
  assert.equal(parseDate(46347), '2026-11-21')
  assert.equal(parseDate('31/02/2026'), '')
  assert.equal(parseDate('Opening balance'), '')
})

test('amounts: Indian grouping, rupee signs, Dr/Cr, brackets and blanks', () => {
  assert.deepEqual(parseAmount('1,23,456.78'), { value: 123456.78, sign: 0 })
  assert.deepEqual(parseAmount('₹ 1,250.50'), { value: 1250.5, sign: 0 })
  assert.deepEqual(parseAmount('Rs. 500 Dr'), { value: 500, sign: -1 })
  assert.deepEqual(parseAmount('500.00 Cr'), { value: 500, sign: 1 })
  assert.deepEqual(parseAmount('(75.00)'), { value: 75, sign: -1 })
  assert.deepEqual(parseAmount(-42.5), { value: 42.5, sign: -1 })
  assert.equal(parseAmount(''), null)
  assert.equal(parseAmount('-'), null)
  assert.equal(parseAmount('0.00'), null)
})

test('HTML tables saved as .xls are read like CSV', () => {
  const rows = parseHtmlTable(
    '<table><tr><th>Date</th><th>Narration</th><th>Withdrawal Amt.</th><th>Deposit Amt.</th></tr>' +
      '<tr><td>21/11/26</td><td>UPI-CHAI&nbsp;POINT &amp; CO</td><td>120.00</td><td></td></tr></table>',
  )
  assert.deepEqual(rows[1], ['21/11/26', 'UPI-CHAI POINT & CO', '120.00', ''])
  assert.equal(readStatement(rows).transactions[0].amount, 120)
})

test('a file without a date column and an amount column is refused', () => {
  assert.equal(readStatement(parseCsv('Name,Phone\nRavi,99999')).error, 'no-header')
})

test('who a line was with, from the common narration shapes', () => {
  assert.deepEqual(describeLine('UPI-SWIGGY-swiggy@icici-ICIC0DC0099-532112345678-UPI'), {
    party: 'SWIGGY',
    vpa: 'swiggy@icici',
    ref: '532112345678',
    channel: 'upi',
  })
  assert.equal(describeLine('TO TRANSFER-UPI/DR/532112345678/SWIGGY/YESB/swiggy.rzp@/Payment').party, 'SWIGGY')
  assert.equal(describeLine('UPI/532112345678/Payment from Ph/swiggy@icici/ICICI Bank').party, null)
  assert.equal(describeLine('NEFT CR-ICIC0000001-ACME CORP-NETBANK MUM-N123456789').party, 'ACME CORP')
  assert.equal(describeLine('IMPS-532112345678-RAVI KUMAR-SBIN-XXXXXXXX1234-dinner').party, 'RAVI KUMAR')
  assert.equal(describeLine('ATW-512345XXXXXX1234-S1ANBG12-BANGALORE').party, 'ATM')
  assert.equal(describeLine('POS 512345XXXXXX1234 AMAZON PAY INDIA').party, 'AMAZON PAY INDIA')
})

test('the bank reference inside a reference cell', () => {
  assert.equal(rrnFrom('0000532112345678'), '532112345678')
  assert.equal(rrnFrom('N123456789'), null)
})

const line = (date, amount, direction = 'out') => ({ date, amount, direction, description: '', ref: '', text: '' })
const AT = (date, h = 9) => new Date(`${date}T${String(h).padStart(2, '0')}:00:00`).getTime()

test('lines already in the book or already caught are kept out; two teas on one day stay two', () => {
  const lines = [line('2026-11-21', 20), line('2026-11-21', 20), line('2026-11-22', 500), line('2026-11-23', 72000, 'in')]
  const plan = planImport(lines, {
    accountId: 'acc_hdfc',
    transactions: [{ id: 't1', type: 'expense', amount: 20, date: '2026-11-21', accountId: 'acc_hdfc' }],
    spends: [{ id: 's1', amountPaise: 50000, direction: 'out', at: AT('2026-11-22'), status: 'unfiled' }],
  })
  assert.equal(plan.inBook.length, 1)
  assert.equal(plan.caught.length, 1)
  assert.deepEqual(
    plan.fresh.map((l) => [l.date, l.amount]),
    [
      ['2026-11-21', 20],
      ['2026-11-23', 72000],
    ],
  )
})

test('book entries on another account, of the wrong kind or two days off do not count', () => {
  const plan = planImport([line('2026-11-21', 300)], {
    accountId: 'acc_hdfc',
    transactions: [
      { id: 'a', type: 'expense', amount: 300, date: '2026-11-21', accountId: 'acc_sbi' },
      { id: 'b', type: 'income', amount: 300, date: '2026-11-21', accountId: 'acc_hdfc' },
      { id: 'c', type: 'expense', amount: 300, date: '2026-11-23', accountId: 'acc_hdfc' },
    ],
  })
  assert.equal(plan.fresh.length, 1)
})

test('exact dates are matched before next-day ones, and transfers count from the right side', () => {
  const plan = planImport([line('2026-11-21', 100), line('2026-11-22', 100), line('2026-11-22', 5000, 'in')], {
    accountId: 'acc_hdfc',
    transactions: [
      { id: 'x', type: 'expense', amount: 100, date: '2026-11-22', accountId: 'acc_hdfc' },
      { id: 'y', type: 'expense', amount: 100, date: '2026-11-22', accountId: '' },
      { id: 'z', type: 'transfer', amount: 5000, date: '2026-11-22', accountId: 'acc_sbi', toAccountId: 'acc_hdfc' },
    ],
  })
  assert.equal(plan.inBook.length, 3)
  assert.equal(plan.fresh.length, 0)
})

test('caught payments only count when they could be on this account', () => {
  const plan = planImport([line('2026-11-22', 500)], {
    accountId: 'acc_hdfc',
    spends: [{ id: 's1', amountPaise: 50000, direction: 'out', at: AT('2026-11-22'), accountId: 'acc_sbi' }],
    onAccount: (spend) => !spend.accountId || spend.accountId === 'acc_hdfc',
  })
  assert.equal(plan.fresh.length, 1)
})

test('new lines become unfiled spends at noon on their date, on the chosen account', () => {
  const [row] = toImportRows(
    [{ ...line('2026-11-21', 1250), description: 'UPI-SWIGGY-swiggy@icici-ICIC0DC0099-532112345678-UPI', text: 'raw' }],
    { id: 'acc_hdfc', last4: '4821', bank: 'HDFC Bank' },
  )
  assert.equal(row.amountPaise, 125000)
  assert.equal(row.at, new Date(2026, 10, 21, 12).getTime())
  assert.equal(row.party, 'SWIGGY')
  assert.equal(row.ref, '532112345678')
  assert.equal(row.accountId, 'acc_hdfc')
  assert.equal(row.account, '4821')
  const [plain] = toImportRows([{ ...line('2026-11-21', 10), ref: '0000532112345699' }], null)
  assert.equal(plain.ref, '532112345699')
  assert.equal(plain.accountId, null)
})

test('files: old binary Excel, empty files and huge files get a reason, CSV text is read', async () => {
  const file = (bytes) => ({ size: bytes.length, arrayBuffer: async () => new Uint8Array(bytes).buffer })
  await assert.rejects(readStatementFile(file([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0])), (err) => err instanceof StatementError && err.code === 'old-excel')
  await assert.rejects(readStatementFile(file([])), (err) => err.code === 'empty')
  await assert.rejects(readStatementFile({ size: 6 * 1024 * 1024, arrayBuffer: async () => new ArrayBuffer(0) }), (err) => err.code === 'too-big')
  const rows = await readStatementFile(file([...Buffer.from('Date,Amount\n21/11/26,5')]))
  assert.deepEqual(rows, [
    ['Date', 'Amount'],
    ['21/11/26', '5'],
  ])
})
