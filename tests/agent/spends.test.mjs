// Munshi's captured-payment tools: listing, filing (with splits), linking, dismissing, rules, and Undo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { commitDraft } from '../../src/finance/agent/commit.js'
import { executeTool } from '../../src/finance/agent/executors.js'
import { buildSystemPrompt } from '../../src/finance/agent/prompt.js'
import { findSpend, spendContext } from '../../src/finance/agent/spends.js'
import { toolsFor } from '../../src/finance/agent/tools.js'
import { normalizeSpend } from '../../src/finance/inbox/enrich.js'
import { withoutRule, withRule } from '../../src/finance/inbox/rules.js'
import { makeCtx } from '../helpers/ctx.mjs'

const AT = new Date(2026, 10, 10, 20, 31).getTime()

function spend(fields) {
  return normalizeSpend({ status: 'unfiled', amountPaise: 50000, direction: 'out', at: AT, sources: ['sms'], ...fields })
}

/** The app's inbox as Munshi's commit code sees it, recording every call. */
function fakeInbox(spends, book = { rules: {}, aliases: {} }) {
  const inbox = {
    spends,
    book,
    calls: [],
    find: (id) => inbox.spends.find((s) => s.id === id) || null,
    set(id, patch) {
      inbox.spends = inbox.spends.map((s) => (s.id === id ? { ...s, ...patch } : s))
    },
    markFiled(id, entryIds) {
      inbox.calls.push(['markFiled', id, entryIds])
      inbox.set(id, { status: 'filed', entryIds })
    },
    restore(id) {
      inbox.calls.push(['restore', id])
      inbox.set(id, { status: 'unfiled', entryIds: [] })
    },
    dismiss(id) {
      inbox.calls.push(['dismiss', id])
      inbox.set(id, { status: 'dismissed' })
    },
    learn(key, rule) {
      const previous = inbox.book.rules[key] || null
      inbox.book = withRule(inbox.book, key, rule)
      return previous
    },
    setRule(key, rule) {
      inbox.book = rule ? withRule(inbox.book, key, rule) : withoutRule(inbox.book, key)
    },
  }
  return inbox
}

function setup(spends, book) {
  const ctx = makeCtx()
  ctx.inbox = fakeInbox(spends, book)
  return ctx
}

const run = (ctx, name, args) => executeTool(name, JSON.stringify(args), ctx)

test('get_unfiled_spends numbers payments newest first, with parsed fields and notes but no message text', () => {
  const older = spend({ id: 'sp_old', party: 'Uber', account: '4821', at: AT - 3_600_000 })
  const newer = spend({ id: 'sp_new', vpa: 'chai.stall@ybl', hint: 'tea with the team', hasOriginal: true })
  const filed = spend({ id: 'sp_done', status: 'filed' })
  const ctx = setup([older, newer, filed])
  const { result } = run(ctx, 'get_unfiled_spends', {})
  assert.equal(result.count, 2)
  assert.deepEqual(result.spends.map((s) => [s.ref, s.id]), [['S1', 'sp_new'], ['S2', 'sp_old']])
  assert.equal(result.spends[0].note, 'tea with the team')
  assert.equal(result.spends[0].payee, 'Chai Stall')
  assert.equal(result.spends[1].account, 'HDFC Salary')
  assert.deepEqual(result.spends[1].suggestion, { type: 'expense', category: 'transport' })
  assert.ok(!JSON.stringify(result).includes('hasOriginal'))
})

test('refs resolve by S-number, id, or as the only payment', () => {
  const ctx = setup([spend({ id: 'a', at: AT }), spend({ id: 'b', at: AT - 1 })])
  assert.equal(findSpend('S2', ctx.inbox).id, 'b')
  assert.equal(findSpend('s1', ctx.inbox).id, 'a')
  assert.equal(findSpend('b', ctx.inbox).id, 'b')
  assert.equal(findSpend('', ctx.inbox), null)
  assert.equal(findSpend('', setup([spend({ id: 'only' })]).inbox).id, 'only')
})

test('filing one payment defaults its amount, account and date; confirming files it and learns the payee', () => {
  const ctx = setup([spend({ id: 'sp_1', party: 'SWIGGY', account: '4821' })])
  const { result, drafts } = run(ctx, 'propose_file_spend', { spend: 'S1', entries: [{ type: 'expense', category: 'food', note: 'Dinner' }] })
  assert.equal(result.ok, true)
  assert.equal(drafts.length, 1)
  const [draft] = drafts
  assert.equal(draft.kind, 'spend')
  assert.deepEqual(draft.warnings, [])
  const [entry] = draft.data.entries
  assert.deepEqual([entry.type, entry.amount, entry.accountId, entry.date, entry.category], ['expense', 500, 'sa_hdfc', '2026-11-10', 'food'])

  const count = ctx.state.transactions.length
  const saved = commitDraft(ctx, draft)
  assert.equal(saved.ok, true)
  assert.equal(ctx.state.transactions.length, count + 1)
  assert.deepEqual(ctx.inbox.calls[0], ['markFiled', 'sp_1', [saved.record.id]])
  assert.equal(ctx.inbox.book.rules.swiggy.category, 'food')
  assert.equal(ctx.toasts.at(-1).message, 'Filed ₹500 · Swiggy')

  ctx.toasts.at(-1).action.run()
  assert.equal(ctx.state.transactions.length, count)
  assert.equal(ctx.inbox.find('sp_1').status, 'unfiled')
  assert.equal(ctx.inbox.book.rules.swiggy, undefined)
})

test('a split files as several entries, and totals that do not add up get a warning', () => {
  const ctx = setup([spend({ id: 'sp_1', party: 'Barbeque Nation', account: '4821', hint: 'dinner, split with Ravi' })])
  const split = run(ctx, 'propose_file_spend', {
    spend: 'S1',
    entries: [
      { type: 'expense', amount: 250, category: 'food', note: 'Dinner' },
      { type: 'lend', amount: 250, person: 'Ravi', note: 'His half of dinner' },
    ],
  }).drafts[0]
  assert.equal(split.data.entries.length, 2)
  assert.ok(!split.warnings.some((w) => w.startsWith('These add up')))
  assert.deepEqual(split.data.entries.map((e) => e.accountId), ['sa_hdfc', 'sa_hdfc'])

  const count = ctx.state.transactions.length
  assert.equal(commitDraft(ctx, split).ok, true)
  assert.equal(ctx.state.transactions.length, count + 2)
  assert.equal(ctx.inbox.calls[0][2].length, 2)

  const ctx2 = setup([spend({ id: 'sp_2', account: '4821' })])
  const off = run(ctx2, 'propose_file_spend', { spend: 'S1', entries: [{ type: 'expense', amount: 300, category: 'food' }, { type: 'lend', amount: 100, person: 'Ravi' }] }).drafts[0]
  assert.ok(off.warnings.includes('These add up to ₹400; the payment was ₹500'))
})

test('a payment already in the book is linked instead of entered twice', () => {
  const ctx = setup([spend({ id: 'sp_1', party: 'Uber', account: '4821' })])
  const existing = ctx.state.transactions[0]
  const { drafts } = run(ctx, 'propose_file_spend', { spend: 'S1', linkTo: existing.id })
  assert.equal(drafts[0].kind, 'spendLink')
  const count = ctx.state.transactions.length
  assert.equal(commitDraft(ctx, drafts[0]).ok, true)
  assert.equal(ctx.state.transactions.length, count)
  assert.deepEqual(ctx.inbox.calls[0], ['markFiled', 'sp_1', [existing.id]])
  assert.equal(run(ctx, 'propose_file_spend', { spend: 'sp_1', linkTo: 'nope' }).result.ok, false)
})

test('dismissing sets a payment aside; Undo brings it back', () => {
  const ctx = setup([spend({ id: 'sp_1', party: 'Test' })])
  const { drafts } = run(ctx, 'propose_dismiss_spend', { spend: 'S1', reason: 'duplicate' })
  assert.equal(drafts[0].kind, 'spendDismiss')
  commitDraft(ctx, drafts[0])
  assert.equal(ctx.inbox.find('sp_1').status, 'dismissed')
  ctx.toasts.at(-1).action.run()
  assert.equal(ctx.inbox.find('sp_1').status, 'unfiled')
  assert.equal(commitDraft(ctx, { ...drafts[0], data: { ...drafts[0].data, spendId: 'gone' } }).ok, false)
})

test('a rule is drafted from a payment or a payee name, and replaces the old one until undone', () => {
  const book = withRule({ rules: {}, aliases: {} }, 'swiggy', { type: 'expense', category: 'food', label: 'Swiggy' })
  const ctx = setup([spend({ id: 'sp_1', party: 'SWIGGY' })], book)
  const { drafts } = run(ctx, 'propose_spend_rule', { spend: 'S1', category: 'groceries' })
  assert.deepEqual(drafts[0].warnings, ['Replaces Food & dining for Swiggy'])
  commitDraft(ctx, drafts[0])
  assert.equal(ctx.inbox.book.rules.swiggy.category, 'groceries')
  ctx.toasts.at(-1).action.run()
  assert.equal(ctx.inbox.book.rules.swiggy.category, 'food')

  const byName = run(ctx, 'propose_spend_rule', { payee: 'Blue Tokai', category: 'food' }).drafts[0]
  assert.equal(byName.data.key, 'blue tokai')
  assert.equal(run(ctx, 'propose_spend_rule', { payee: 'X', category: 'spaceships' }).result.ok, false)
})

test('spend tools are only offered while payments wait, and the prompt mentions them only then', () => {
  const names = (opts) => toolsFor('file the swiggy one as food', opts).map((t) => t.function.name)
  assert.ok(!names({}).includes('propose_file_spend'))
  assert.ok(names({ spends: true }).includes('propose_file_spend'))
  assert.ok(toolsFor('how much did I spend?', { spends: true }).map((t) => t.function.name).includes('get_unfiled_spends'))
  assert.ok(!toolsFor('how much did I spend?', { spends: true }).map((t) => t.function.name).includes('propose_file_spend'))
  const ctx = makeCtx()
  assert.ok(!buildSystemPrompt(ctx.state, ctx.derived, ctx.today).includes('Captured payments'))
  assert.ok(buildSystemPrompt(ctx.state, ctx.derived, ctx.today, { unfiled: 2 }).includes('Captured payments: 2'))
})

test('a spend chip tells Munshi which payment, without the message text', () => {
  const ctx = setup([spend({ id: 'sp_1', party: 'SWIGGY', account: '4821', hint: 'dinner' })])
  const line = spendContext(ctx.inbox.spends[0], ctx)
  assert.match(line, /^\[About captured payment S1 \(id sp_1\) · ₹500 out · Swiggy · HDFC Salary · 2026-11-10 20:31 · my note “dinner”\]$/)
})

test('without the app, the spend tools fail politely', () => {
  const ctx = makeCtx()
  assert.equal(run(ctx, 'get_unfiled_spends', {}).result.ok, false)
  assert.equal(run(ctx, 'propose_file_spend', { spend: 'S1' }).result.ok, false)
  assert.equal(commitDraft(ctx, { kind: 'spendDismiss', data: { spendId: 'x' } }).ok, false)
})
