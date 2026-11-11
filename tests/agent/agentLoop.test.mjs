import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { buildHistory, callId, draftText, MAX_STEPS, runAgent, stepLabel } from '../../src/finance/agent/agentLoop.js'
import { setPass } from '../../src/finance/agent/agentConfig.js'
import { installWindow, jsonResponse, makeCtx, mockFetch, sseFrames, sseResponse } from '../helpers/ctx.mjs'

const META = { 'x-gullak-provider': 'groq', 'x-gullak-model': 'llama-3.3-70b' }
const answer = (content) => ({ choices: [{ message: { content }, finish_reason: 'stop' }] })
const toolCall = (name, args, content = '') => ({
  choices: [{ message: { content, tool_calls: [{ id: 'x', type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' }],
})

let restoreWindow
let fetchMock

/** Plays back model replies in order (the last one repeats); a function reply builds its own Response. */
const script = (replies) => {
  fetchMock = mockFetch((url, init, call, n) => {
    const next = replies[Math.min(n - 1, replies.length - 1)]
    return typeof next === 'function' ? next(call) : jsonResponse(next, { headers: META })
  })
  return fetchMock.calls
}

const run = (text, options = {}) => {
  const ctx = makeCtx()
  let reads = 0
  const getCtx = () => {
    reads += 1
    return ctx
  }
  return runAgent({ text, getCtx, ...options }).then((result) => ({ ...result, reads }))
}

const names = (call) => call.body.tools.map((t) => t.function.name)

beforeEach(() => {
  restoreWindow = installWindow()
  setPass('a long enough passphrase', true)
})

afterEach(() => {
  fetchMock?.restore()
  fetchMock = null
  restoreWindow()
})

test('stepLabel, callId and draftText', () => {
  assert.equal(stepLabel('query_transactions'), 'Searching transactions')
  assert.equal(stepLabel('propose_entries'), 'Drafting entries')
  assert.equal(stepLabel('mystery'), 'Working')

  const ids = Array.from({ length: 50 }, callId)
  assert.ok(ids.every((id) => /^[A-Za-z0-9]{9}$/.test(id)))
  assert.equal(new Set(ids).size, 50)

  assert.equal(draftText([]), 'I couldn’t finish that one. Try rephrasing it?')
  assert.equal(draftText([{}]), 'Here’s a draft. Check it over and confirm to save.')
  assert.equal(draftText([{}, {}]), 'Here are 2 drafts. Check them over and confirm to save.')
  assert.equal(draftText([{ needsEdit: 'Who was it with?' }, {}]), 'Here are 2 drafts. One needs a quick edit before saving.')
  assert.equal(draftText([{ needsEdit: 'a' }, { needsEdit: 'b' }, {}]), 'Here are 3 drafts. 2 need a quick edit before saving.')
})

test('buildHistory keeps finished turns, notes draft cards, and starts and ends cleanly', () => {
  const history = buildHistory([
    { role: 'assistant', text: 'Welcome!' },
    { role: 'user', text: ' hi ' },
    { role: 'assistant', text: 'Here are 2 drafts.', drafts: [{ kind: 'entry', summary: 'Spent ₹200', status: 'saved' }, { kind: 'budget' }] },
    { role: 'assistant', text: 'Oops', error: { code: 'network' } },
    { role: 'system', text: 'ignored' },
    { role: 'user', text: 'first' },
    { role: 'user', text: 'second' },
    { role: 'assistant', text: 'Sure.' },
    { role: 'user', text: 'never answered' },
    { role: 'assistant', text: 'half a rep', streaming: true },
  ])
  assert.deepEqual(history, [
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: 'Here are 2 drafts.\n[Draft cards: D1 Spent ₹200 (saved); D2 budget (pending)]' },
    { role: 'user', content: 'first\n\nsecond' },
    { role: 'assistant', content: 'Sure.' },
  ])

  const long = buildHistory([{ role: 'user', text: 'x'.repeat(700) }, { role: 'assistant', text: 'ok' }])
  assert.equal(long[0].content.length, 600)
  assert.ok(long[0].content.endsWith('…'))

  const turns = Array.from({ length: 10 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `m${i}` }))
  assert.deepEqual(buildHistory(turns, 3).map((m) => m.content), ['m8', 'm9'])
  assert.deepEqual(buildHistory(undefined), [])
})

test('a plain question is one request with the read tools, and the answer comes back trimmed', async () => {
  const calls = script([answer('  You spent ₹1,146 on food.  ')])
  const history = [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }]
  const result = await run('how much did I spend on food this month?', { history })

  assert.equal(result.text, 'You spent ₹1,146 on food.')
  assert.deepEqual([result.drafts, result.steps], [[], []])
  assert.deepEqual([result.meta.provider, result.meta.model], ['groq', 'llama-3.3-70b'])
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].body.messages.map((m) => m.role), ['system', 'user', 'assistant', 'user'])
  assert.match(calls[0].body.messages[0].content, /^You are Munshi/)
  assert.equal(calls[0].body.messages.at(-1).content, 'how much did I spend on food this month?')
  assert.deepEqual(names(calls[0]), ['get_overview', 'query_transactions', 'calculate', 'get_accounts', 'get_people', 'get_loans', 'get_budgets', 'get_goals'])
  assert.equal(calls[0].body.tool_choice, 'auto')
})

test('tool results go back to the model under fresh ids, read from the current book', async () => {
  const calls = script([toolCall('query_transactions', { month: '2026-11', category: 'food' }), answer('Food so far: ₹1,146.')])
  const updates = []
  const result = await run('food spend this month', { onStep: (update) => updates.push(update) })

  assert.equal(result.text, 'Food so far: ₹1,146.')
  assert.deepEqual(result.steps, [{ name: 'query_transactions', label: 'Searching transactions', ok: true }])
  assert.deepEqual(updates, [{ steps: result.steps, drafts: [] }])
  assert.equal(result.reads, 2, 'once to start, then once per tool call')

  const [assistant, tool] = calls[1].body.messages.slice(-2)
  assert.equal(assistant.content, null)
  assert.match(assistant.tool_calls[0].id, /^[A-Za-z0-9]{9}$/)
  assert.deepEqual(assistant.tool_calls[0].function, { name: 'query_transactions', arguments: '{"month":"2026-11","category":"food"}' })
  assert.equal(tool.role, 'tool')
  assert.equal(tool.tool_call_id, assistant.tool_calls[0].id)
  assert.equal(JSON.parse(tool.content).total, 1146)
})

test('clean drafts end the turn at once, with the write tools offered', async () => {
  const calls = script([toolCall('propose_entries', { entries: [{ type: 'expense', amount: 200, category: 'food', note: 'lunch' }] })])
  const result = await run('spent 200 on lunch')

  assert.equal(calls.length, 1)
  assert.deepEqual(names(calls[0]), ['get_overview', 'query_transactions', 'calculate', 'propose_entries', 'propose_update_entry', 'propose_delete_entry', 'propose_budget', 'propose_goal_contribution', 'propose_setup'])
  assert.equal(result.text, 'Here’s a draft. Check it over and confirm to save.')
  assert.equal(result.drafts.length, 1)
  assert.deepEqual([result.drafts[0].kind, result.drafts[0].data.amount, result.drafts[0].data.category], ['entry', 200, 'food'])

  // A draft that needs a detail still goes straight to its card for editing.
  script([toolCall('propose_entries', { entries: [{ type: 'lend', amount: 500 }] })])
  const partial = await run('lent 500')
  assert.equal(partial.text, 'Here’s a draft. One needs a quick edit before saving.')
  assert.equal(partial.drafts[0].needsEdit, 'Who was it with?')
})

test('a failed proposal goes back to the model so it can explain', async () => {
  const calls = script([toolCall('propose_update_entry', { id: 'nope', amount: 5 }), answer('I couldn’t find that entry.')])
  const result = await run('change that entry to 5')

  assert.equal(calls.length, 2)
  assert.deepEqual(result.steps.map((s) => s.ok), [false])
  assert.equal(result.text, 'I couldn’t find that entry.')
  assert.equal(JSON.parse(calls[1].body.messages.at(-1).content).ok, false)
})

test('a rejected tool call is retried once, calmer; other errors are not retried', async () => {
  const toolFailure = () => jsonResponse({ error: 'upstream_error', code: 'tool_use_failed' }, { status: 502 })
  let calls = script([toolFailure, answer('ok')])
  assert.equal((await run('hello')).text, 'ok')
  assert.deepEqual(calls.map((c) => c.body.temperature), [0.2, 0])

  fetchMock.restore()
  calls = script([toolFailure])
  await assert.rejects(run('hello'), { code: 'upstream', upstream: 'tool_use_failed' })
  assert.equal(calls.length, 2)

  fetchMock.restore()
  calls = script([() => jsonResponse({ error: 'unauthorized' }, { status: 401 })])
  await assert.rejects(run('hello'), { code: 'unauthorized' })
  assert.equal(calls.length, 1)
})

test(`a model that keeps calling tools is cut off after ${MAX_STEPS} requests`, async () => {
  const calls = script([toolCall('get_overview', {})])
  const result = await run('overview please')

  assert.equal(calls.length, MAX_STEPS)
  assert.deepEqual(calls.map((c) => c.body.tool_choice), ['auto', 'auto', 'auto', 'auto', 'none'])
  assert.equal(result.steps.length, MAX_STEPS - 1)
  assert.equal(result.text, 'I couldn’t finish that one. Try rephrasing it?')
  assert.equal(calls.at(-1).body.messages.length, 2 + 2 * (MAX_STEPS - 1))
})

test('at most 6 calls run per reply, each answered under its own id', async () => {
  const many = {
    choices: [{
      message: {
        content: 'Let me check',
        tool_calls: Array.from({ length: 8 }, (_, i) => ({
          id: 'same',
          type: 'function',
          function: { name: 'calculate', arguments: i === 0 ? 'not json' : JSON.stringify({ expression: `${i}+1` }) },
        })),
      },
    }],
  }
  const calls = script([many, answer('done')])
  const result = await run('work these out')

  assert.equal(result.text, 'done')
  assert.deepEqual(result.steps.map((s) => s.ok), [false, true, true, true, true, true])
  const sent = calls[1].body.messages
  const assistant = sent.find((m) => m.tool_calls)
  const results = sent.filter((m) => m.role === 'tool')
  assert.equal(assistant.content, 'Let me check')
  assert.equal(new Set(assistant.tool_calls.map((c) => c.id)).size, 6)
  assert.equal(assistant.tool_calls[0].function.arguments, '{}', 'unreadable arguments are replaced with {}')
  assert.deepEqual(results.map((m) => m.tool_call_id), assistant.tool_calls.map((c) => c.id))
  assert.match(JSON.parse(results[0].content).error, /not valid JSON/)
  assert.deepEqual(JSON.parse(results[5].content), { expression: '5+1', result: 6 })
})

test('streamed answers reach onDelta as they grow, and Stop cancels the turn', async () => {
  fetchMock = mockFetch(() => sseResponse(sseFrames([{ content: 'Str' }, { content: 'eamed' }])))
  const seen = []
  const result = await run('hi', { onDelta: (text) => seen.push(text) })
  assert.equal(result.text, 'Streamed')
  assert.deepEqual(seen, ['Str', 'Streamed'])

  const controller = new AbortController()
  controller.abort()
  await assert.rejects(run('hi', { signal: controller.signal }), { code: 'aborted' })
})
