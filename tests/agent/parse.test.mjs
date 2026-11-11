import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calculate, cleanText, monthArg, parseDate, parseJSON, parseMoney } from '../../src/finance/agent/parse.js'
import { TODAY } from '../helpers/ctx.mjs'

test('parseMoney reads the ways people write rupees', () => {
  const cases = {
    '₹450': 450,
    'Rs. 1,200': 1200,
    '₹ 2,50,000': 250000,
    'INR 99': 99,
    '3 rupees': 3,
    '300 bucks': 300,
    '1500/-': 1500,
    '2.5k': 2500,
    '1.2 lakh': 120000,
    '1 cr': 10000000,
    '450+120': 570,
    '12.345': 12.35,
    '-50': -50,
  }
  for (const [input, expected] of Object.entries(cases)) assert.equal(parseMoney(input), expected, input)
  assert.equal(parseMoney(450), 450)
})

test('parseMoney gives NaN for anything that is not an amount', () => {
  for (const input of ['abc', '', null, undefined, Infinity, NaN]) assert.ok(Number.isNaN(parseMoney(input)), String(input))
})

test('calculate handles percentages, units and bad input', () => {
  assert.equal(calculate('18% of 2500'), 450)
  assert.equal(calculate('1.2 lakh / 12'), 10000)
  assert.equal(calculate('(100+50)*2'), 300)
  assert.equal(calculate('2+'), null)
  assert.equal(calculate('10/0'), null)
})

test('cleanText collapses whitespace and clips', () => {
  assert.equal(cleanText('  hello    world \n x '), 'hello world x')
  assert.equal(cleanText('abcdefghij', 4), 'abcd')
  assert.equal(cleanText(null), '')
})

test('parseJSON returns the value or null', () => {
  assert.deepEqual(parseJSON('{"a":1}'), { a: 1 })
  assert.deepEqual(parseJSON('[1]'), [1])
  assert.equal(parseJSON('{a'), null)
})

test('parseDate understands relative days (today is Tuesday 10 Nov 2026)', () => {
  const cases = {
    '': '2026-11-10',
    today: '2026-11-10',
    yesterday: '2026-11-09',
    'last night': '2026-11-09',
    'day before yesterday': '2026-11-08',
    '3 days ago': '2026-11-07',
    'a day ago': '2026-11-09',
    monday: '2026-11-09',
    tuesday: '2026-11-10',
    'last tuesday': '2026-11-03',
    sunday: '2026-11-08',
  }
  for (const [input, date] of Object.entries(cases)) assert.deepEqual(parseDate(input, TODAY), { date }, input)
})

test('parseDate reads calendar dates in Indian order', () => {
  const cases = {
    '5th oct': '2026-10-05',
    'oct 5': '2026-10-05',
    '5 of october 2025': '2025-10-05',
    '05/10': '2026-10-05',
    '13/10': '2026-10-13',
    '10/13': '2026-10-13',
    '5th': '2026-11-05',
    '15th': '2026-10-15',
    '2026-11-01': '2026-11-01',
  }
  for (const [input, date] of Object.entries(cases)) assert.deepEqual(parseDate(input, TODAY), { date }, input)
})

test('parseDate flags future dates and falls back to today when unreadable', () => {
  assert.deepEqual(parseDate('tomorrow', TODAY), { date: '2026-11-11', warning: 'Dated in the future' })
  assert.deepEqual(parseDate('2026-12-01', TODAY), { date: '2026-12-01', warning: 'Dated in the future' })
  const unread = parseDate('blah', TODAY)
  assert.equal(unread.date, TODAY)
  assert.equal(unread.unread, true)
  assert.match(unread.warning, /blah/)
})

test('monthArg resolves month words to YYYY-MM', () => {
  const cases = {
    '': '2026-11',
    'this month': '2026-11',
    'last month': '2026-10',
    'prev month': '2026-10',
    '2026-09': '2026-09',
    '2026-09-14': '2026-09',
    october: '2026-10',
    december: '2025-12',
    'march 2025': '2025-03',
  }
  for (const [input, month] of Object.entries(cases)) assert.deepEqual(monthArg(input, TODAY), { month }, input)
  assert.deepEqual(monthArg('nonsense', TODAY), { error: 'Month must be YYYY-MM, like 2026-11.' })
})
