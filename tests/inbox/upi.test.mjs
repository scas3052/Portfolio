// Scan & Pay: reading scanned UPI QR codes, building the link that opens a UPI app, and reading its answer.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildPayUri, parseRupees, parseUpiResponse, parseUpiUri } from '../../src/finance/inbox/upi.js'

test('a shop QR with no amount: payee, VPA and merchant code are read, the amount is left to you', () => {
  const scan = parseUpiUri('upi://pay?pa=chaipoint.blr@icici&pn=Chai%20Point&mc=5814&tr=STATIC01&cu=INR')
  assert.equal(scan.vpa, 'chaipoint.blr@icici')
  assert.equal(scan.name, 'Chai Point')
  assert.equal(scan.amount, null)
  assert.equal(scan.merchant, true)
})

test('a dynamic QR carries its amount; a personal QR is not a merchant', () => {
  const shop = parseUpiUri('UPI://PAY?pa=bill.desk@hdfcbank&pn=Bill+Desk&am=1,299.00&tn=Order%2042')
  assert.equal(shop.amount, 1299)
  assert.equal(shop.note, 'Order 42')
  assert.equal(shop.name, 'Bill Desk')
  const person = parseUpiUri('upi://pay?pa=ravi.kumar@okaxis&pn=Ravi%20Kumar&mc=0000')
  assert.equal(person.merchant, false)
})

test('anything that is not a UPI payment link is refused', () => {
  assert.equal(parseUpiUri('https://example.com/pay?pa=x@y'), null)
  assert.equal(parseUpiUri('upi://pay?pn=No%20Payee'), null)
  assert.equal(parseUpiUri('upi://pay?pa=not-a-vpa'), null)
  assert.equal(parseUpiUri(''), null)
})

test('the pay link keeps the QR exactly as scanned and only adds a missing amount and currency', () => {
  const signed = 'upi://pay?pa=shop@ybl&pn=Shop&mc=5411&sign=MEUCIQD+ab/cd=='
  assert.equal(buildPayUri(parseUpiUri(signed), '120'), `${signed}&am=120.00&cu=INR`)
  const priced = 'upi://pay?pa=shop@ybl&pn=Shop&am=450.00&cu=INR'
  assert.equal(buildPayUri(parseUpiUri(priced), 450), priced)
})

test('an empty amount in the QR is replaced by the one you typed', () => {
  const scan = parseUpiUri('upi://pay?pa=shop@ybl&am=&pn=Shop')
  assert.equal(buildPayUri(scan, 80), 'upi://pay?pa=shop@ybl&pn=Shop&am=80.00&cu=INR')
  assert.equal(buildPayUri(scan, 0), null)
})

test('rupee amounts: commas and symbols are fine, nonsense is not', () => {
  assert.equal(parseRupees('1,250.50'), 1250.5)
  assert.equal(parseRupees('₹ 99'), 99)
  assert.equal(parseRupees('-5'), null)
  assert.equal(parseRupees('abc'), null)
})

test('the UPI app’s answer: success with a 12-digit bank reference', () => {
  const answer = parseUpiResponse({
    resultCode: -1,
    response: 'txnId=PSP123ABC&responseCode=00&Status=SUCCESS&txnRef=STATIC01&ApprovalRefNo=532112345678',
  })
  assert.deepEqual(answer, { status: 'success', ref: '532112345678', txnId: 'PSP123ABC', code: '00' })
})

test('failures, pending payments and silence are told apart', () => {
  assert.equal(parseUpiResponse({ response: 'Status=FAILURE&responseCode=ZD' }).status, 'failure')
  assert.equal(parseUpiResponse({ extras: { Status: 'SUBMITTED' } }).status, 'submitted')
  assert.equal(parseUpiResponse({ resultCode: 0 }).status, 'unknown')
  assert.equal(parseUpiResponse(null).status, 'unknown')
})

test('a reference that is not a 12-digit bank number is not used for matching', () => {
  assert.equal(parseUpiResponse({ response: 'Status=SUCCESS&ApprovalRefNo=AXB12' }).ref, null)
})
