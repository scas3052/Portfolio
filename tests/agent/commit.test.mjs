import { test } from 'node:test'
import assert from 'node:assert/strict'
import { commitDraft, commitDrafts, validateEntry } from '../../src/finance/agent/commit.js'
import { executeTool } from '../../src/finance/agent/executors.js'
import { makeCtx } from '../helpers/ctx.mjs'

const draftsFor = (ctx, name, args) => executeTool(name, JSON.stringify(args), ctx).drafts
const draftFor = (ctx, name, args) => draftsFor(ctx, name, args)[0]
const toasts = (ctx) => ctx.toasts.map((t) => ({ message: t.message, tone: t.tone, label: t.action?.label }))
const undoLast = (ctx) => ctx.toasts.at(-1).action.run()
const txn = (ctx, id) => ctx.state.transactions.find((t) => t.id === id)

test('confirming an entry saves it once, and Undo takes it back out', () => {
  const ctx = makeCtx()
  const count = ctx.state.transactions.length
  const draft = draftFor(ctx, 'propose_entries', { entries: [{ type: 'expense', amount: 250, category: 'food', note: 'lunch' }] })
  const result = commitDraft(ctx, draft)

  assert.equal(result.ok, true)
  assert.match(result.record.id, /^t/)
  assert.deepEqual(
    { ...result.record, id: undefined, createdAt: undefined },
    { id: undefined, type: 'expense', amount: 250, date: '2026-11-10', note: 'lunch', category: 'food', accountId: 'sa_icici', toAccountId: '', personId: '', loanId: '', createdAt: undefined },
  )
  assert.equal(ctx.state.transactions.length, count + 1)
  assert.deepEqual(toasts(ctx), [{ message: 'Spent ₹250 · Food', tone: 'peach', label: 'Undo' }])

  undoLast(ctx)
  assert.equal(ctx.state.transactions.length, count)
  assert.deepEqual(ctx.actions.map((a) => a.type), ['txn/add', 'txn/delete'])
})

test('a new person is added with the entry and removed again by Undo', () => {
  const ctx = makeCtx({ privacy: true })
  const people = ctx.state.people.length
  const result = commitDraft(ctx, draftFor(ctx, 'propose_entries', { entries: [{ type: 'lend', amount: 300, person: 'Priya' }] }))

  assert.match(result.personId, /^p/)
  assert.deepEqual(ctx.actions[0], { type: 'person/add', person: { id: result.personId, name: 'Priya' } })
  assert.equal(txn(ctx, result.record.id).personId, result.personId)
  // Privacy mode leaves the amount out of the toast.
  assert.deepEqual(toasts(ctx), [{ message: 'You lent · Priya', tone: 'mint', label: 'Undo' }])

  undoLast(ctx)
  assert.equal(ctx.state.people.length, people)
  assert.equal(txn(ctx, result.record.id), undefined)
})

test('Undo keeps a new person who has other entries by then', () => {
  const ctx = makeCtx()
  const first = commitDraft(ctx, draftFor(ctx, 'propose_entries', { entries: [{ type: 'lend', amount: 300, person: 'Priya' }] }))
  const second = commitDraft(ctx, draftFor(ctx, 'propose_entries', { entries: [{ type: 'lend', amount: 200, person: 'priya' }] }))
  assert.equal(second.personId, first.personId)

  first.undo()
  assert.ok(ctx.state.people.some((p) => p.id === first.personId))
  assert.equal(txn(ctx, second.record.id).personId, first.personId)
})

test('toasts name the person or loan, and the confetti moments still fire', () => {
  const settle = makeCtx()
  commitDraft(settle, draftFor(settle, 'propose_entries', { entries: [{ type: 'collect', person: 'Ravi' }] }))
  assert.deepEqual(toasts(settle), [{ message: 'Got back ₹1,500 · Ravi', tone: 'mint', label: 'Undo' }])
  assert.deepEqual(settle.celebrations, [{ kind: 'settled', message: 'All square with Ravi' }])

  const emi = makeCtx()
  commitDraft(emi, draftFor(emi, 'propose_entries', { entries: [{ type: 'emi', loan: 'bike', amount: 4250, date: '2026-12-05' }] }))
  assert.deepEqual(toasts(emi), [{ message: 'EMI paid ₹4,250 · Bike loan', tone: 'coral', label: 'Undo' }])
  assert.deepEqual(emi.celebrations, [{ kind: 'emi', message: 'Bike loan · 13 EMIs to go' }])
})

test('updates and deletes apply to the entry as it is now, with Undo', () => {
  const ctx = makeCtx()
  const update = draftFor(ctx, 'propose_update_entry', { id: 'st_228', amount: 900 })
  assert.equal(commitDraft(ctx, update).ok, true)
  assert.equal(txn(ctx, 'st_228').amount, 900)
  assert.deepEqual(toasts(ctx), [{ message: 'Updated ₹900 · Arjun', tone: 'sky', label: 'Undo' }])
  undoLast(ctx)
  assert.equal(txn(ctx, 'st_228').amount, 800)

  const remove = draftFor(ctx, 'propose_delete_entry', { id: 'st_227' })
  assert.equal(commitDraft(ctx, remove).ok, true)
  assert.equal(txn(ctx, 'st_227'), undefined)
  assert.deepEqual(toasts(ctx).at(-1), { message: 'Entry deleted', tone: 'rose', label: 'Undo' })
  assert.deepEqual(commitDraft(ctx, remove), { ok: false, error: 'That entry is already gone.' })
  undoLast(ctx)
  assert.equal(txn(ctx, 'st_227').amount, 1200)

  // A stale card must not write over data that changed underneath it.
  assert.deepEqual(commitDraft(ctx, { ...update, data: { ...update.data, id: 'gone' } }), { ok: false, error: 'That entry no longer exists.' })
})

test('budgets and goal contributions save with Undo', () => {
  const ctx = makeCtx()
  commitDraft(ctx, draftFor(ctx, 'propose_budget', { category: 'food', amount: 8000 }))
  assert.equal(ctx.state.budgets.food, 8000)
  assert.deepEqual(toasts(ctx), [{ message: 'Food budget set to ₹8,000', tone: 'lilac', label: 'Undo' }])
  undoLast(ctx)
  assert.equal(ctx.state.budgets.food, 7000)

  commitDraft(ctx, draftFor(ctx, 'propose_budget', { category: 'food', amount: 0 }))
  assert.equal(ctx.state.budgets.food, undefined)
  assert.equal(toasts(ctx).at(-1).message, 'Food budget removed')

  commitDraft(ctx, draftFor(ctx, 'propose_goal_contribution', { goal: 'goa', amount: 11500 }))
  const goa = () => ctx.state.goals.find((g) => g.id === 'sg_goa')
  assert.equal(goa().saved, 30000)
  assert.deepEqual(ctx.celebrations, [{ kind: 'goal', message: 'Goa trip' }])
  assert.deepEqual(toasts(ctx).at(-1), { message: '₹11,500 added to Goa trip', tone: 'mint', label: 'Undo' })
  undoLast(ctx)
  assert.equal(goa().saved, 18500)

  assert.deepEqual(commitDraft(ctx, { kind: 'contribution', data: { goalId: 'sg_goa', amount: -99999 } }), {
    ok: false,
    error: 'Goa trip only has ₹18,500 saved.',
  })
})

test('setup drafts create accounts and goals, but not half-filled loans', () => {
  const ctx = makeCtx()
  assert.equal(commitDraft(ctx, draftFor(ctx, 'propose_setup', { kind: 'goal', name: 'House', target: 500000, deadline: '2027-03' })).ok, true)
  const house = ctx.state.goals.at(-1)
  assert.deepEqual({ ...house, id: undefined, color: undefined }, { id: undefined, name: 'House', target: 500000, saved: 0, deadline: '2027-03', color: undefined })
  assert.deepEqual(toasts(ctx), [{ message: 'House jar is ready', tone: 'sky', label: 'Undo' }])

  const loan = draftFor(ctx, 'propose_setup', { kind: 'loan', name: 'Car loan', emi: 12000 })
  assert.deepEqual(commitDraft(ctx, loan), { ok: false, error: 'How many EMIs in all (1 to 600)?' })

  commitDraft(ctx, draftFor(ctx, 'propose_setup', { kind: 'account', name: 'Kotak savings', balance: 1000 }))
  assert.deepEqual({ ...ctx.state.accounts.at(-1), id: undefined, color: undefined }, { id: undefined, name: 'Kotak savings', kind: 'savings', bank: '', last4: '', opening: 1000, color: undefined })
  undoLast(ctx)
  assert.equal(ctx.state.accounts.length, 4)

  assert.deepEqual(commitDraft(makeCtx(), { kind: 'nope', data: {} }), { ok: false, error: 'Unknown draft.' })
  assert.deepEqual(commitDraft(makeCtx(), null), { ok: false, error: 'Unknown draft.' })
})

test('Confirm all saves what it can with one toast, and Undo all reverses everything', () => {
  const ctx = makeCtx()
  const { transactions, people } = ctx.state
  const drafts = draftsFor(ctx, 'propose_entries', {
    entries: [
      { type: 'lend', amount: 100, person: 'Priya' },
      { type: 'lend', amount: 200, person: 'priya' },
      { type: 'expense', amount: 50, category: 'food' },
    ],
  })
  const stale = { kind: 'entry', data: { ...drafts[2].data, accountId: 'gone' } }
  const outcomes = commitDrafts(ctx, [...drafts, stale])

  assert.deepEqual(outcomes.map((o) => [o.ok, o.error]), [[true, undefined], [true, undefined], [true, undefined], [false, 'That account no longer exists.']])
  assert.equal(ctx.state.transactions.length, transactions.length + 3)
  assert.equal(ctx.state.people.length, people.length + 1, 'Priya is added once')
  assert.deepEqual(toasts(ctx), [{ message: 'Saved 3 items · 1 need a look', tone: 'lime', label: 'Undo all' }])
  assert.deepEqual(ctx.celebrations, [], 'a batch stays quiet apart from its toast')

  undoLast(ctx)
  assert.deepEqual(ctx.state.transactions, transactions)
  assert.deepEqual(ctx.state.people, people)
})

test('validateEntry reports every problem by field', () => {
  const { state } = makeCtx()
  assert.deepEqual(validateEntry({ type: 'transfer', amount: 0, accountId: 'sa_hdfc', toAccountId: 'sa_hdfc', date: 'x' }, state), {
    amount: 'The amount must be above zero.',
    toAccountId: 'Pick two different accounts.',
    date: 'Pick a date.',
  })
  assert.deepEqual(validateEntry({ type: 'lend', amount: 10, accountId: 'sa_cash', date: '2026-11-10' }, state), { personId: 'Who was it with?' })
})
