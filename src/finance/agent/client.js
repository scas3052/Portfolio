import { getAgentConfig, getPass } from './agentConfig'

const TIMEOUT = 90_000

export class AgentError extends Error {
  constructor(code, { status = 0, detail = '', retryAfter = 0, upstream = '' } = {}) {
    super(code)
    this.name = 'AgentError'
    this.code = code
    this.status = status
    this.detail = detail
    this.retryAfter = retryAfter
    this.upstream = upstream
  }
}

const MESSAGES = {
  no_pass: ['Assistant is locked', 'Add your relay passphrase in the assistant settings.'],
  no_relay: ['No relay found', 'The /api/agent endpoint isn’t running here. Deploy to Vercel/Netlify or run `npm run dev`.'],
  unauthorized: ['Wrong passphrase', 'It must match AGENT_PASSPHRASE on the relay.'],
  forbidden: ['Blocked by the relay', 'This site’s origin isn’t allowed. Add it to AGENT_ALLOWED_ORIGINS.'],
  not_configured: ['Relay isn’t set up', 'Set AGENT_PASSPHRASE and at least one provider key on the server.'],
  rate_limited: ['Free tier is busy', 'Every provider is rate-limited right now. Try again shortly.'],
  too_large: ['Too much to send', 'Clear the chat and ask again.'],
  upstream_auth: ['Provider rejected the key', 'Check the API key(s) set on the relay.'],
  upstream_unreachable: ['AI provider didn’t answer', 'It timed out or is unreachable. Try again.'],
  upstream: ['AI provider error', 'The model failed on this request. Try again or rephrase.'],
  bad_request: ['Request rejected', 'The relay didn’t accept this conversation. Clear the chat and retry.'],
  network: ['You seem offline', 'Couldn’t reach the relay. Quick add still works offline.'],
  timeout: ['Took too long', 'No answer in 90 seconds. Try again.'],
  aborted: ['Stopped', ''],
  server: ['Relay error', 'Something went wrong on the relay.'],
}

/** A short title and hint for an error, for chat bubbles and settings. */
export function describeError(err) {
  const code = err instanceof AgentError ? err.code : 'server'
  const [title, hint] = MESSAGES[code] || MESSAGES.server
  let extra = ''
  if (code === 'not_configured' && err.detail === 'passphrase') extra = 'AGENT_PASSPHRASE (12+ characters) is missing.'
  if (code === 'not_configured' && err.detail === 'providers') extra = 'No provider API key is set.'
  if (code === 'rate_limited' && err.retryAfter) extra = `Retry in about ${Math.ceil(err.retryAfter)}s.`
  if (code === 'upstream' && err.upstream) extra = `(${err.upstream})`
  return { code, title, hint: [hint, extra].filter(Boolean).join(' '), retry: !['no_pass', 'unauthorized', 'aborted'].includes(code) }
}

function readMeta(headers) {
  return {
    provider: headers.get('x-gullak-provider') || '',
    model: headers.get('x-gullak-model') || '',
    skipped: headers.get('x-gullak-skipped') || '',
    remainingRequests: headers.get('x-ratelimit-remaining-requests') || '',
    remainingTokens: headers.get('x-ratelimit-remaining-tokens') || '',
  }
}

async function toError(response) {
  const status = response.status
  const type = response.headers.get('content-type') || ''
  let body = {}
  if (type.includes('application/json')) body = await response.json().catch(() => ({}))
  const code = typeof body.error === 'string' ? body.error : ''
  if (status === 401) return new AgentError('unauthorized', { status })
  if (status === 403) return new AgentError('forbidden', { status })
  if (status === 413) return new AgentError('too_large', { status })
  if (status === 429) {
    const retryAfter = Number(response.headers.get('retry-after')) || 0
    return new AgentError('rate_limited', { status, retryAfter })
  }
  if (code === 'not_configured') return new AgentError('not_configured', { status, detail: body.detail || '' })
  if (code === 'upstream_auth') return new AgentError('upstream_auth', { status })
  if (code === 'upstream_unreachable' || status === 504) return new AgentError('upstream_unreachable', { status })
  if (code === 'upstream_error') return new AgentError('upstream', { status, upstream: body.code || '' })
  if (code === 'bad_request' || code === 'bad_json' || status === 400) return new AgentError('bad_request', { status, detail: body.detail || '' })
  // The relay never answers 404/405/501 to GET or POST, so these come from whatever else is at the endpoint.
  if ([404, 405, 501].includes(status)) return new AgentError('no_relay', { status })
  return new AgentError('server', { status })
}

function argumentsText(value) {
  if (typeof value === 'string') return value
  return value == null ? '' : JSON.stringify(value)
}

function wholeCall(call) {
  const fn = call?.function || {}
  return { id: call?.id ? String(call.id) : '', name: typeof fn.name === 'string' ? fn.name : '', arguments: argumentsText(fn.arguments) }
}

function mergeToolCalls(list, deltas) {
  for (const delta of deltas) {
    if (!delta || typeof delta !== 'object') continue
    let slot = null
    if (Number.isInteger(delta.index)) {
      list[delta.index] ??= { id: '', name: '', arguments: '' }
      slot = list[delta.index]
    } else if (delta.id) {
      slot = list.find((call) => call?.id === delta.id) || null
    }
    if (!slot) {
      const fresh = delta.id || delta.function?.name || !list.length
      slot = fresh ? { id: '', name: '', arguments: '' } : list[list.length - 1]
      if (fresh) list.push(slot)
    }
    if (delta.id && !slot.id) slot.id = String(delta.id)
    const fn = delta.function || {}
    // Some providers repeat the full name on every chunk; others stream it in pieces.
    if (fn.name && !slot.name) slot.name = fn.name
    else if (fn.name && fn.name !== slot.name) slot.name += fn.name
    slot.arguments += argumentsText(fn.arguments)
  }
}

function applyChunk(chunk, acc, onDelta) {
  if (chunk?.error) {
    const code = typeof chunk.error.code === 'string' ? chunk.error.code : ''
    throw new AgentError('upstream', { upstream: code })
  }
  const choice = chunk?.choices?.[0]
  if (!choice) return
  const delta = choice.delta || choice.message || {}
  if (typeof delta.content === 'string' && delta.content) {
    acc.content += delta.content
    onDelta?.(acc.content)
  }
  if (Array.isArray(delta.tool_calls)) {
    // Stream deltas are pieces to stitch together; a whole message already lists complete calls.
    if (choice.delta) mergeToolCalls(acc.toolCalls, delta.tool_calls)
    else acc.toolCalls.push(...delta.tool_calls.map(wholeCall))
  }
  if (choice.finish_reason) acc.finish = choice.finish_reason
}

function handleEvent(event, acc, onDelta) {
  const data = event
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).replace(/^ /, ''))
    .join('\n')
    .trim()
  if (!data) return false
  if (data === '[DONE]') return true
  let chunk
  try {
    chunk = JSON.parse(data)
  } catch {
    return false
  }
  applyChunk(chunk, acc, onDelta)
  return false
}

/** Parses an OpenAI-style SSE stream into `{content, toolCalls, finish}`. */
export async function readStream(body, onDelta) {
  const acc = { content: '', toolCalls: [], finish: '' }
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      let match
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        const event = buffer.slice(0, match.index)
        buffer = buffer.slice(match.index + match[0].length)
        if (handleEvent(event, acc, onDelta)) {
          reader.cancel().catch(() => {})
          return finish(acc)
        }
      }
      if (done) break
    }
    if (buffer.trim()) handleEvent(buffer, acc, onDelta)
    return finish(acc)
  } finally {
    reader.releaseLock?.()
  }
}

function finish(acc) {
  return { ...acc, toolCalls: acc.toolCalls.filter((call) => call && call.name) }
}

export function parseCompletion(data) {
  const acc = { content: '', toolCalls: [], finish: '' }
  applyChunk(data, acc)
  return finish(acc)
}

async function request(method, body, { signal, onDelta } = {}) {
  const pass = getPass()
  if (!pass) throw new AgentError('no_pass')
  const { endpoint } = getAgentConfig()
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, TIMEOUT)
  const onAbort = () => controller.abort()
  if (signal?.aborted) controller.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  const fail = () => new AgentError(signal?.aborted ? 'aborted' : timedOut ? 'timeout' : 'network')
  try {
    let response
    try {
      response = await fetch(endpoint, {
        method,
        headers: {
          'x-gullak-pass': encodeURIComponent(pass),
          ...(body && { 'content-type': 'application/json' }),
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
        signal: controller.signal,
      })
    } catch {
      throw fail()
    }
    if (!response.ok) throw await toError(response)
    const type = response.headers.get('content-type') || ''
    const meta = readMeta(response.headers)
    try {
      if (type.includes('text/event-stream')) return { ...(await readStream(response.body, onDelta)), meta }
      if (type.includes('application/json')) {
        const data = await response.json()
        return method === 'GET' ? { data, meta } : { ...parseCompletion(data), meta }
      }
    } catch (err) {
      if (err instanceof AgentError) throw err
      throw fail()
    }
    throw new AgentError('no_relay', { status: response.status })
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

/**
 * One chat-completions call through the relay. Streams when possible and
 * returns `{content, toolCalls:[{id,name,arguments}], finish, meta}`.
 */
export function chat({ messages, tools, toolChoice, signal, onDelta, maxTokens, temperature = 0.2, stream = true }) {
  const { provider } = getAgentConfig()
  const body = { messages, stream, temperature }
  if (tools?.length) {
    body.tools = tools
    body.tool_choice = toolChoice || 'auto'
  }
  if (maxTokens) body.max_tokens = maxTokens
  if (provider) body.provider = provider
  return request('POST', body, { signal, onDelta })
}

/** Lists the providers the relay has keys for (also verifies the passphrase). */
export async function getRelayStatus(signal) {
  const { data } = await request('GET', null, { signal })
  return { providers: Array.isArray(data?.providers) ? data.providers : [] }
}

/** Checks the passphrase, then makes one tiny model call to confirm a provider answers. */
export async function testConnection(signal) {
  const status = await getRelayStatus(signal)
  const started = performance.now()
  const result = await chat({
    messages: [{ role: 'user', content: 'Reply with the single word: ready' }],
    maxTokens: 200,
    stream: false,
    signal,
  })
  return { ...status, ms: Math.round(performance.now() - started), provider: result.meta.provider, model: result.meta.model }
}
