import { configuredProviders } from './providers.js'

// A tiny, stateless relay between Gullak (in the browser) and a free AI provider.
// It keeps provider keys on the server, checks a passphrase, forwards only a
// whitelisted chat payload and streams the provider's answer straight back.
// Web-standard Request -> Response, so Vercel, Netlify and Vite all share it.

const MAX_BODY = 64 * 1024
const MAX_MESSAGES = 40
const MAX_TOOLS = 16
const MAX_TOOL_CALLS = 8
const MAX_OUTPUT_TOKENS = 1500
const DEFAULT_OUTPUT_TOKENS = 900
const MIN_PASSPHRASE = 12
const CONNECT_TIMEOUT = 45_000
const STREAM_TIMEOUT = 90_000
const FAIL_DELAY = 500
const ROLES = new Set(['system', 'user', 'assistant', 'tool'])
const NAME_RE = /^[A-Za-z0-9_-]{1,64}$/
const RATE_HEADERS = [
  'x-ratelimit-limit-requests',
  'x-ratelimit-limit-tokens',
  'x-ratelimit-remaining-requests',
  'x-ratelimit-remaining-tokens',
  'x-ratelimit-reset-requests',
  'x-ratelimit-reset-tokens',
  'retry-after',
]
const EXPOSED = ['x-gullak-provider', 'x-gullak-model', 'x-gullak-skipped', ...RATE_HEADERS].join(', ')
const BASE_HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }

class HttpError extends Error {
  constructor(status, error, detail) {
    super(error)
    this.status = status
    this.error = error
    this.detail = detail
  }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function json(status, body, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...BASE_HEADERS, 'content-type': 'application/json; charset=utf-8', ...headers },
  })
}

async function sha256(text) {
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function originAllowed(request, allowed) {
  const origin = request.headers.get('origin')
  if (origin) {
    let own
    try {
      own = new URL(request.url).origin
    } catch {
      return false
    }
    if (origin !== own) return allowed.has(origin)
  }
  const site = request.headers.get('sec-fetch-site')
  return !site || site === 'same-origin' || site === 'none'
}

async function authorized(request, expected) {
  const raw = request.headers.get('x-gullak-pass') || ''
  let given = raw
  try {
    given = decodeURIComponent(raw)
  } catch {
    // Not URI-encoded; compare as sent.
  }
  given = given.trim()
  if (!given || given.length > 512) return false
  const [a, b] = await Promise.all([sha256(given), expected])
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i]
  return diff === 0
}

async function readCapped(stream) {
  if (!stream) return ''
  const reader = stream.getReader()
  const chunks = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BODY) {
      reader.cancel().catch(() => {})
      throw new HttpError(413, 'too_large')
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

async function readJson(request) {
  if (Number(request.headers.get('content-length')) > MAX_BODY) throw new HttpError(413, 'too_large')
  if (!(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) {
    throw new HttpError(415, 'unsupported_media_type')
  }
  const text = await readCapped(request.body)
  try {
    return JSON.parse(text)
  } catch {
    throw new HttpError(400, 'bad_json')
  }
}

function cleanToolCall(call) {
  const fn = call?.function
  if (!isPlainObject(call) || typeof call.id !== 'string' || !call.id || !isPlainObject(fn) || !NAME_RE.test(fn.name ?? '')) {
    return null
  }
  const args = typeof fn.arguments === 'string' ? fn.arguments : JSON.stringify(fn.arguments ?? {})
  return { id: call.id.slice(0, 64), type: 'function', function: { name: fn.name, arguments: args } }
}

function cleanMessages(list) {
  if (!Array.isArray(list) || !list.length || list.length > MAX_MESSAGES) throw new HttpError(400, 'bad_request', 'messages')
  return list.map((m) => {
    if (!isPlainObject(m) || !ROLES.has(m.role)) throw new HttpError(400, 'bad_request', 'messages')
    const out = { role: m.role }
    if (typeof m.content === 'string') out.content = m.content
    else if (m.content == null && m.role === 'assistant') out.content = null
    else throw new HttpError(400, 'bad_request', 'messages')
    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) {
      if (m.tool_calls.length > MAX_TOOL_CALLS) throw new HttpError(400, 'bad_request', 'tool_calls')
      out.tool_calls = m.tool_calls.map((call) => {
        const clean = cleanToolCall(call)
        if (!clean) throw new HttpError(400, 'bad_request', 'tool_calls')
        return clean
      })
    } else if (out.content === null) {
      throw new HttpError(400, 'bad_request', 'messages')
    }
    if (m.role === 'tool') {
      if (typeof m.tool_call_id !== 'string' || !m.tool_call_id) throw new HttpError(400, 'bad_request', 'tool_call_id')
      out.tool_call_id = m.tool_call_id.slice(0, 64)
    }
    return out
  })
}

function cleanTools(list) {
  if (list == null) return null
  if (!Array.isArray(list) || list.length > MAX_TOOLS) throw new HttpError(400, 'bad_request', 'tools')
  if (!list.length) return null
  return list.map((tool) => {
    const fn = tool?.function
    if (tool?.type !== 'function' || !isPlainObject(fn) || !NAME_RE.test(fn.name ?? '')) {
      throw new HttpError(400, 'bad_request', 'tools')
    }
    return {
      type: 'function',
      function: {
        name: fn.name,
        description: typeof fn.description === 'string' ? fn.description.slice(0, 1024) : '',
        parameters: isPlainObject(fn.parameters) ? fn.parameters : { type: 'object', properties: {} },
      },
    }
  })
}

function cleanToolChoice(choice, tools) {
  if (choice === 'auto' || choice === 'none' || choice === 'required') return choice
  const name = choice?.function?.name
  if (choice?.type === 'function' && tools.some((t) => t.function.name === name)) {
    return { type: 'function', function: { name } }
  }
  return null
}

function sanitize(body) {
  if (!isPlainObject(body)) throw new HttpError(400, 'bad_request')
  const out = {
    messages: cleanMessages(body.messages),
    stream: body.stream === true,
    max_tokens: Number.isFinite(body.max_tokens)
      ? Math.min(MAX_OUTPUT_TOKENS, Math.max(1, Math.round(body.max_tokens)))
      : DEFAULT_OUTPUT_TOKENS,
  }
  const tools = cleanTools(body.tools)
  if (tools) {
    out.tools = tools
    const choice = cleanToolChoice(body.tool_choice, tools)
    if (choice) out.tool_choice = choice
  }
  if (Number.isFinite(body.temperature)) out.temperature = Math.min(1.5, Math.max(0, body.temperature))
  if (typeof body.provider === 'string') out.provider = body.provider.trim().toLowerCase().slice(0, 30)
  return out
}

function upstreamBody(provider, payload) {
  const body = { model: provider.model, messages: payload.messages, stream: payload.stream }
  if (payload.tools) {
    body.tools = payload.tools
    if (payload.tool_choice) body.tool_choice = payload.tool_choice
  }
  if (payload.temperature !== undefined) body.temperature = payload.temperature
  body[provider.tokenField || 'max_tokens'] = payload.max_tokens
  return { ...body, ...provider.extra?.(provider.model) }
}

async function upstreamCode(response) {
  try {
    const text = (await response.text()).slice(0, 4096)
    const err = JSON.parse(text)?.error
    const code = [err?.code, err?.type].find((value) => typeof value === 'string' && /^[\w.-]{1,48}$/.test(value))
    return code || ''
  } catch {
    return ''
  }
}

async function attempt(provider, payload, { fetchImpl, signal, origin }) {
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  let timer = setTimeout(abort, CONNECT_TIMEOUT)
  const release = () => {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
  let response
  try {
    response = await fetchImpl(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: payload.stream ? 'text/event-stream' : 'application/json',
        ...(provider.key && { authorization: `Bearer ${provider.key}` }),
        ...provider.headers?.(origin),
      },
      body: JSON.stringify(upstreamBody(provider, payload)),
      signal: controller.signal,
    })
  } catch {
    release()
    if (signal?.aborted) throw new HttpError(499, 'aborted')
    return { status: 0, reason: controller.signal.aborted ? 'timeout' : 'network' }
  }
  if (!response.ok) {
    const code = await upstreamCode(response)
    release()
    return { status: response.status, reason: String(response.status), code, retryAfter: response.headers.get('retry-after') }
  }
  clearTimeout(timer)
  timer = setTimeout(abort, STREAM_TIMEOUT)
  timer.unref?.()
  return { response, release }
}

function relayBody(upstream, release) {
  const reader = upstream.getReader()
  return new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read()
        if (done) {
          release()
          controller.close()
        } else {
          controller.enqueue(value)
        }
      } catch (err) {
        release()
        controller.error(err)
      }
    },
    cancel(reason) {
      release()
      return reader.cancel(reason)
    },
  })
}

function failure(failures, extra) {
  const attempts = failures.map((f) => `${f.id}:${f.reason}`)
  const all = (test) => failures.length > 0 && failures.every(test)
  if (all((f) => f.status === 429)) {
    const waits = failures.map((f) => Number(f.retryAfter)).filter((n) => Number.isFinite(n) && n >= 0)
    const retry = waits.length ? String(Math.ceil(Math.min(...waits))) : ''
    return json(429, { error: 'rate_limited', attempts }, { ...extra, ...(retry && { 'retry-after': retry }) })
  }
  if (all((f) => f.status === 401 || f.status === 403)) return json(502, { error: 'upstream_auth', attempts }, extra)
  if (all((f) => f.status === 0)) return json(504, { error: 'upstream_unreachable', attempts }, extra)
  const code = [...failures].reverse().find((f) => f.code)?.code
  return json(502, { error: 'upstream_error', attempts, ...(code && { code }) }, extra)
}

/**
 * Creates the relay handler. `env` holds AGENT_PASSPHRASE, provider keys and
 * options (see .env.example); `fetchImpl` and `delay` exist for tests.
 */
export function createAgentRelay(env = {}, { fetchImpl = globalThis.fetch, delay = wait } = {}) {
  const passphrase = typeof env.AGENT_PASSPHRASE === 'string' ? env.AGENT_PASSPHRASE.trim() : ''
  const providers = configuredProviders(env)
  const allowed = new Set(
    String(env.AGENT_ALLOWED_ORIGINS || '')
      .split(',')
      .map((origin) => origin.trim().replace(/\/+$/, ''))
      .filter(Boolean),
  )
  let expected = null

  return async function relay(request) {
    const origin = request.headers.get('origin')
    const cors = origin && allowed.has(origin)
      ? { 'access-control-allow-origin': origin, 'access-control-expose-headers': EXPOSED, vary: 'Origin' }
      : {}
    try {
      if (!originAllowed(request, allowed)) return json(403, { error: 'forbidden' })
      if (request.method === 'OPTIONS' && cors['access-control-allow-origin']) {
        return new Response(null, {
          status: 204,
          headers: {
            ...BASE_HEADERS,
            ...cors,
            'access-control-allow-methods': 'GET, POST',
            'access-control-allow-headers': 'content-type, x-gullak-pass',
            'access-control-max-age': '600',
          },
        })
      }
      if (request.method !== 'GET' && request.method !== 'POST') {
        return json(405, { error: 'method_not_allowed' }, { ...cors, allow: 'GET, POST' })
      }
      if (passphrase.length < MIN_PASSPHRASE) {
        return json(503, { error: 'not_configured', detail: 'passphrase' }, cors)
      }
      expected ??= sha256(passphrase)
      if (!(await authorized(request, expected))) {
        await delay(FAIL_DELAY)
        return json(401, { error: 'unauthorized' }, cors)
      }
      if (!providers.length) return json(503, { error: 'not_configured', detail: 'providers' }, cors)
      if (request.method === 'GET') {
        return json(200, { ok: true, providers: providers.map(({ id, label, model }) => ({ id, label, model })) }, cors)
      }

      const payload = sanitize(await readJson(request))
      const preferred = providers.find((p) => p.id === payload.provider)
      const order = preferred ? [preferred, ...providers.filter((p) => p !== preferred)] : providers
      const selfOrigin = new URL(request.url).origin
      const failures = []
      for (const provider of order) {
        if (request.signal?.aborted) throw new HttpError(499, 'aborted')
        const result = await attempt(provider, payload, { fetchImpl, signal: request.signal, origin: selfOrigin })
        if (!result.response) {
          failures.push({ id: provider.id, ...result })
          continue
        }
        const { response, release } = result
        const streaming = (response.headers.get('content-type') || '').includes('text/event-stream')
        const headers = {
          ...BASE_HEADERS,
          ...cors,
          'content-type': streaming ? 'text/event-stream; charset=utf-8' : 'application/json; charset=utf-8',
          'x-gullak-provider': provider.id,
          'x-gullak-model': provider.model,
        }
        if (streaming) headers['x-accel-buffering'] = 'no'
        if (failures.length) headers['x-gullak-skipped'] = failures.map((f) => `${f.id}:${f.reason}`).join(',')
        for (const name of RATE_HEADERS) {
          const value = response.headers.get(name)
          if (value) headers[name] = value
        }
        if (!response.body) {
          release()
          return new Response(null, { status: 200, headers })
        }
        return new Response(relayBody(response.body, release), { status: 200, headers })
      }
      return failure(failures, cors)
    } catch (err) {
      if (err instanceof HttpError) {
        return json(err.status, { error: err.error, ...(err.detail && { detail: err.detail }) }, cors)
      }
      return json(500, { error: 'relay_error' }, cors)
    }
  }
}
