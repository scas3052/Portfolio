// The payment parser against the fixtures the native parser is tested with, so the two can't drift apart.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { bankFromSender, bankInText, isTransactionalSender, normalize, parseApp, parseShared, parseSms, tidyName } from '../../src/finance/inbox/parse.js'

const FIXTURES = new URL('../../native/android/app/src/test/resources/payment-fixtures.txt', import.meta.url)
const FIELDS = ['amount', 'dir', 'account', 'party', 'vpa', 'ref', 'channel', 'balance']

function readFixtures() {
  const cases = []
  let current = null
  for (const line of readFileSync(FIXTURES, 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('#')) continue
    if (line.startsWith('== ')) {
      current = { name: line.slice(3).trim(), fields: {} }
      cases.push(current)
      continue
    }
    const colon = line.indexOf(':')
    const key = line.slice(0, colon).trim()
    const value = line.slice(colon + 1).trim()
    current.fields[key] = key === 'text' || key === 'title' ? value.replace(/\\n/g, '\n') : value
  }
  return cases
}

function run({ kind, from, title, text }) {
  if (kind === 'sms') return parseSms(from, text)
  if (kind === 'app') return parseApp(title, text)
  if (kind === 'share') return parseShared(text)
  throw new Error(`Unknown kind ${kind}`)
}

function actual(parsed, field) {
  const value = {
    amount: parsed.amount.toFixed(2),
    dir: parsed.direction,
    account: parsed.account,
    party: parsed.party,
    vpa: parsed.vpa,
    ref: parsed.ref,
    channel: parsed.channel,
    balance: parsed.balance === null ? null : parsed.balance.toFixed(2),
  }[field]
  return value ?? '-'
}

const cases = readFixtures()

test('the fixture file has a good spread of cases', () => {
  assert.ok(cases.length >= 40)
  for (const kind of ['sms', 'app', 'share']) assert.ok(cases.some((c) => c.fields.kind === kind), kind)
  assert.ok(cases.filter((c) => c.fields.expect === 'none').length >= 10)
})

for (const { name, fields } of cases) {
  test(`fixture: ${name}`, () => {
    const parsed = run(fields)
    if (fields.expect === 'none') {
      assert.equal(parsed, null, `expected no payment, got ${JSON.stringify(parsed)}`)
      return
    }
    assert.ok(parsed, 'expected a payment')
    for (const field of FIELDS) {
      if (!(field in fields)) continue
      assert.equal(actual(parsed, field), fields[field], field)
    }
  })
}

test('sender ids: bank headers count, phone numbers and promotions do not', () => {
  for (const id of ['VM-HDFCBK-S', 'AD-HDFCBK', 'JD-SBIUPI-S', 'HDFCBK', '57575', 'BP-BOBTXN-T']) assert.equal(isTransactionalSender(id), true, id)
  for (const id of ['AD-HDFCBK-P', '+919876543210', '9876543210', '', null, 'VM-HD']) assert.equal(isTransactionalSender(id), false, String(id))
})

test('banks come from the sender id, and from text only when the name is unambiguous', () => {
  assert.equal(bankFromSender('VM-HDFCBK-S'), 'HDFC Bank')
  assert.equal(bankFromSender('JD-SBIUPI-S'), 'SBI')
  assert.equal(bankFromSender('BP-BOBTXN'), 'Bank of Baroda')
  assert.equal(bankFromSender('VM-ZZZZZZ'), null)
  assert.equal(bankInText('Paid from HDFC Bank •• 1234'), 'HDFC Bank')
  assert.equal(bankInText('Reply YES to continue'), null)
})

test('the bank on an SMS comes from its sender', () => {
  assert.equal(parseSms('JD-SBIUPI-S', 'Dear UPI user A/C X1234 debited by 500.0 on date 21Nov26 trf to SWIGGY Refno 432112345603').bank, 'SBI')
})

test('names lose NEFT prefixes, IFSC codes and stray punctuation', () => {
  assert.equal(tidyName('NEFT Cr-ICIC0000001-ACME CORP PVT LTD-'), 'ACME CORP PVT LTD')
  assert.equal(tidyName('UPI mandate SPOTIFY.'), 'SPOTIFY')
  assert.equal(tidyName('  Blue   Tokai '), 'Blue Tokai')
})

test('whitespace of every kind collapses to single spaces', () => {
  assert.equal(normalize('Sent\nRs.500\u00a0to\tX '), 'Sent Rs.500 to X')
  assert.equal(normalize(null), '')
})

test('amounts must be above zero and below ₹100 crore', () => {
  assert.equal(parseSms('VM-HDFCBK', 'Rs.0.00 debited from A/c XX1234'), null)
  assert.equal(parseSms('VM-HDFCBK', 'Rs.1,00,00,00,000 debited from A/c XX1234'), null)
})
