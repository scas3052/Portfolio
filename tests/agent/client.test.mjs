import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { AgentError, chat, describeError, getRelayStatus, parseCompletion, readStream, testConnection } from '../../src/finance/agent/client.js'
import { saveAgentSettings, setPass } from '../../src/finance/agent/agentConfig.js'
import { installWindow, jsonResponse, mockFetch, sseFrames, sseResponse } from '../helpers/ctx.mjs'

const PASS = '  my secret pass 123 ✓ '
let restoreWindow
let fetchMock

beforeEach(() => {
  restoreWindow = installWindow()
  setPass(PASS, false)
})

afterEach(() => {
  fetchMock?.restore()
  fetchMock = null
  restoreWindow()
})

const reply = (handler) => {
  fetchMock = mockFetch(handler)
  return fetchMock
}

const failure = async (promise) => {
  try {
    await promise
  } catch (err) {
    assert.ok(err instanceof AgentError, `expected an AgentError, got ${err}`)
    return { code: err.code, status: err.status, retryAfter: err.retryAfter, detail: err.detail, upstream: err.upstream }
  }
  assert.fail('expected the call to fail')
}

const event = (choice) => `data: ${JSON.stringify({ choices: [choice] })}\n\n`

test('readStream rebuilds text and tool calls from an SSE stream cut at random points', async () => {
  const stream = [
    event({ delta: { content: 'Hel' } }).replace('\n\n', '\r\n\r\n'),
    event({ delta: { content: 'lo' } }),
    event({ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'query_', arguments: '{"mo' } }] } }),
    event({ delta: { tool_calls: [{ index: 0, function: { name: 'transactions', arguments: 'nth":"2026-11"}' } }] } }),
    event({ delta: { tool_calls: [{ index: 1, id: 'c2', function: { name: 'overview', arguments: {} } }] }, finish_reason: 'tool_calls' }),
    'data: [DONE]\n\n',
    event({ delta: { content: 'after done' } }),
  ].join('')
  const pieces = stream.match(/[\s\S]{1,7}/g)
  const seen = []
  const result = await readStream(sseResponse(pieces).body, (text) => seen.push(text))

  assert.deepEqual(result, {
    content: 'Hello',
    toolCalls: [
      { id: 'c1', name: 'query_transactions', arguments: '{"month":"2026-11"}' },
      { id: 'c2', name: 'overview', arguments: '{}' },
    ],
    finish: 'tool_calls',
  })
  assert.deepEqual(seen, ['Hel', 'Hello'])
})

test('readStream copes with how different providers stream tool calls', async () => {
  const repeatedName = await readStream(
    sseResponse([
      event({ delta: { tool_calls: [{ index: 0, id: 'a', function: { name: 'overview', arguments: '{' } }] } }),
      event({ delta: { tool_calls: [{ index: 0, function: { name: 'overview', arguments: '}' } }] } }),
    ]).body,
  )
  assert.deepEqual(repeatedName.toolCalls, [{ id: 'a', name: 'overview', arguments: '{}' }])

  const withoutIndex = await readStream(
    sseResponse([
      event({ delta: { tool_calls: [{ id: 'x', function: { name: 'calculate', arguments: '{"ex' } }] } }),
      event({ delta: { tool_calls: [{ function: { arguments: 'pr":"1+1"}' } }] } }),
      event({ delta: { tool_calls: [{ id: 'y', function: { name: 'overview', arguments: '' } }] } }),
    ]).body,
  )
  assert.deepEqual(withoutIndex.toolCalls, [
    { id: 'x', name: 'calculate', arguments: '{"expr":"1+1"}' },
    { id: 'y', name: 'overview', arguments: '' },
  ])

  const nameless = await readStream(sseResponse([event({ delta: { tool_calls: [{ index: 0, function: { arguments: '{}' } }] } })]).body)
  assert.deepEqual(nameless.toolCalls, [])
})

test('readStream skips comments and junk, reads a final unterminated event, and surfaces stream errors', async () => {
  const result = await readStream(sseResponse([': ping\n\n', 'data: not json\n\n', 'event: x\ndata: {"choices":[{"delta":{"content":"A"}}]}']).body)
  assert.deepEqual(result, { content: 'A', toolCalls: [], finish: '' })

  const err = await failure(readStream(sseResponse(['data: {"error":{"code":"rate_limit_exceeded","message":"slow down"}}\n\n']).body))
  assert.deepEqual([err.code, err.upstream], ['upstream', 'rate_limit_exceeded'])
})

test('parseCompletion reads a non-streamed reply', () => {
  const data = {
    choices: [{ message: { content: 'Hi', tool_calls: [{ id: 'k', type: 'function', function: { name: 'overview', arguments: { a: 1 } } }] }, finish_reason: 'tool_calls' }],
  }
  assert.deepEqual(parseCompletion(data), { content: 'Hi', toolCalls: [{ id: 'k', name: 'overview', arguments: '{"a":1}' }], finish: 'tool_calls' })
  assert.deepEqual(parseCompletion({}), { content: '', toolCalls: [], finish: '' })

  // Whole messages list complete calls, so a repeated id must not merge two of them.
  const repeated = parseCompletion({
    choices: [{ message: { tool_calls: [{ id: 's', function: { name: 'a', arguments: '{}' } }, { id: 's', function: { name: 'b' } }, { function: { arguments: '{}' } }] } }],
  })
  assert.deepEqual(repeated.toolCalls, [
    { id: 's', name: 'a', arguments: '{}' },
    { id: 's', name: 'b', arguments: '' },
  ])
})

test('describeError gives a title, a useful hint and whether retrying makes sense', () => {
  const describe = (code, extra) => describeError(new AgentError(code, extra))
  assert.deepEqual(describe('no_pass'), { code: 'no_pass', title: 'Assistant is locked', hint: 'Add your relay passphrase in the assistant settings.', retry: false })
  assert.match(describe('rate_limited', { retryAfter: 12.2 }).hint, /Retry in about 13s\.$/)
  assert.match(describe('not_configured', { detail: 'passphrase' }).hint, /AGENT_PASSPHRASE \(12\+ characters\) is missing\.$/)
  assert.match(describe('not_configured', { detail: 'providers' }).hint, /No provider API key is set\.$/)
  assert.match(describe('upstream', { upstream: 'model_decommissioned' }).hint, /\(model_decommissioned\)$/)
  assert.equal(describe('unauthorized').retry, false)
  assert.deepEqual(describe('aborted'), { code: 'aborted', title: 'Stopped', hint: '', retry: false })
  assert.equal(describeError(new Error('boom')).title, 'Relay error')
  assert.equal(describe('something_new').title, 'Relay error')
})

test('chat stays local until a passphrase is set', async () => {
  setPass('', false)
  const { calls } = reply(() => jsonResponse({}))
  assert.equal((await failure(chat({ messages: [] }))).code, 'no_pass')
  assert.equal(calls.length, 0)
})

test('chat posts to the relay with the passphrase header and streams the answer', async () => {
  const { calls } = reply(() =>
    sseResponse(sseFrames([{ content: 'Hi' }, { content: ' there' }]), {
      headers: { 'x-gullak-provider': 'groq', 'x-gullak-model': 'llama', 'x-gullak-skipped': 'cerebras:rate_limited' },
    }),
  )
  const tools = [{ type: 'function', function: { name: 'overview' } }]
  const result = await chat({ messages: [{ role: 'user', content: 'hi' }], tools, maxTokens: 300 })

  assert.equal(result.content, 'Hi there')
  assert.deepEqual(result.meta, { provider: 'groq', model: 'llama', skipped: 'cerebras:rate_limited', remainingRequests: '', remainingTokens: '' })
  assert.equal(calls[0].url, '/api/agent')
  assert.equal(calls[0].init.method, 'POST')
  assert.equal(calls[0].init.cache, 'no-store')
  assert.deepEqual(calls[0].init.headers, { 'x-gullak-pass': encodeURIComponent(PASS.trim()), 'content-type': 'application/json' })
  assert.deepEqual(calls[0].body, { messages: [{ role: 'user', content: 'hi' }], stream: true, temperature: 0.2, tools, tool_choice: 'auto', max_tokens: 300 })
})

test('chat uses the saved endpoint and provider, and reads JSON replies', async () => {
  saveAgentSettings({ endpoint: 'https://example.com/relay/', provider: 'openrouter' })
  const { calls } = reply(() => jsonResponse({ choices: [{ message: { content: 'ready' }, finish_reason: 'stop' }] }))
  const result = await chat({ messages: [], stream: false })

  assert.deepEqual([result.content, result.finish], ['ready', 'stop'])
  assert.equal(calls[0].url, 'https://example.com/relay')
  assert.deepEqual(calls[0].body, { messages: [], stream: false, temperature: 0.2, provider: 'openrouter' })
  saveAgentSettings({ endpoint: '', provider: '' })
})

test('chat turns relay and network failures into specific errors', async () => {
  const cases = [
    [() => jsonResponse({ error: 'unauthorized' }, { status: 401 }), { code: 'unauthorized', status: 401 }],
    [() => jsonResponse({ error: 'forbidden' }, { status: 403 }), { code: 'forbidden', status: 403 }],
    [() => jsonResponse({ error: 'too_large' }, { status: 413 }), { code: 'too_large', status: 413 }],
    [() => jsonResponse({ error: 'rate_limited' }, { status: 429, headers: { 'retry-after': '17' } }), { code: 'rate_limited', status: 429, retryAfter: 17 }],
    [() => jsonResponse({ error: 'not_configured', detail: 'providers' }, { status: 503 }), { code: 'not_configured', status: 503, detail: 'providers' }],
    [() => jsonResponse({ error: 'upstream_error', code: 'model_decommissioned' }, { status: 502 }), { code: 'upstream', status: 502, upstream: 'model_decommissioned' }],
    [() => jsonResponse({ error: 'upstream_auth' }, { status: 502 }), { code: 'upstream_auth', status: 502 }],
    [() => new Response('gateway', { status: 504 }), { code: 'upstream_unreachable', status: 504 }],
    [() => jsonResponse({ error: 'bad_request', detail: 'messages' }, { status: 400 }), { code: 'bad_request', status: 400, detail: 'messages' }],
    [() => new Response('boom', { status: 500 }), { code: 'server', status: 500 }],
    // Anything that isn't the relay: a missing route, a static host refusing POST, or an HTML page.
    [() => new Response('<html>', { status: 404, headers: { 'content-type': 'text/html' } }), { code: 'no_relay', status: 404 }],
    [() => jsonResponse({ error: 'not_found' }, { status: 404 }), { code: 'no_relay', status: 404 }],
    [() => new Response('', { status: 501 }), { code: 'no_relay', status: 501 }],
    [() => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }), { code: 'no_relay', status: 200 }],
    [() => Promise.reject(new TypeError('Failed to fetch')), { code: 'network', status: 0 }],
  ]
  for (const [handler, expected] of cases) {
    reply(handler)
    const err = await failure(chat({ messages: [] }))
    assert.deepEqual(err, { status: 0, retryAfter: 0, detail: '', upstream: '', ...expected })
    fetchMock.restore()
  }
})

test('chat reports a cancelled request as stopped', async () => {
  reply(
    (url, init) =>
      new Promise((resolve, reject) => {
        if (init.signal.aborted) reject(new DOMException('Aborted', 'AbortError'))
        init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      }),
  )
  const controller = new AbortController()
  const pending = failure(chat({ messages: [], signal: controller.signal }))
  controller.abort()
  assert.equal((await pending).code, 'aborted')
})

test('getRelayStatus lists providers, and testConnection makes one tiny call', async () => {
  const { calls } = reply((url, init) =>
    init.method === 'GET'
      ? jsonResponse({ providers: [{ id: 'groq', label: 'Groq', model: 'llama' }] })
      : jsonResponse({ choices: [{ message: { content: 'ready' } }] }, { headers: { 'x-gullak-provider': 'groq', 'x-gullak-model': 'llama-3.3' } }),
  )
  assert.deepEqual(await getRelayStatus(), { providers: [{ id: 'groq', label: 'Groq', model: 'llama' }] })
  assert.deepEqual([calls[0].init.method, calls[0].init.body, calls[0].init.headers], ['GET', undefined, { 'x-gullak-pass': encodeURIComponent(PASS.trim()) }])

  const result = await testConnection()
  assert.equal(typeof result.ms, 'number')
  assert.deepEqual({ ...result, ms: 0 }, { providers: [{ id: 'groq', label: 'Groq', model: 'llama' }], ms: 0, provider: 'groq', model: 'llama-3.3' })
  assert.deepEqual(calls.slice(1).map((c) => [c.init.method, c.body?.max_tokens, c.body?.stream]), [['GET', undefined, undefined], ['POST', 200, false]])

  fetchMock.restore()
  reply(() => jsonResponse({ providers: 'nope' }))
  assert.deepEqual(await getRelayStatus(), { providers: [] })
})
