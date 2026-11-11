// Shared fixtures for the Munshi tests: the sample book on a fixed day, plus browser stand-ins.
import { buildSample } from '../../src/finance/lib/sample.js'
import { deriveAll } from '../../src/finance/lib/selectors.js'
import { reducer } from '../../src/finance/store/reducer.js'

export const TODAY = '2026-11-10'

/**
 * The tool/commit context the app builds: {state, derived, today, dispatch, ui}.
 * dispatch runs the real reducer and re-derives, so tests can check both the actions sent and
 * the book they leave behind. Every action, toast and celebration is recorded.
 */
export function makeCtx({ today = TODAY, state = buildSample(today), privacy = false } = {}) {
  const ctx = {
    state,
    derived: deriveAll(state, today),
    today,
    actions: [],
    toasts: [],
    celebrations: [],
  }
  ctx.dispatch = (action) => {
    ctx.actions.push(action)
    ctx.state = reducer(ctx.state, action)
    ctx.derived = deriveAll(ctx.state, today)
  }
  ctx.ui = {
    privacy,
    toast: (message, options = {}) => ctx.toasts.push({ message, ...options }),
    celebrate: (kind, message) => ctx.celebrations.push({ kind, message }),
  }
  return ctx
}

export function memoryStorage() {
  const map = new Map()
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    clear: () => map.clear(),
    key: (index) => [...map.keys()][index] ?? null,
    get length() {
      return map.size
    },
  }
}

/** Installs a minimal `window` (storage + events) for modules that persist settings. */
export function installWindow() {
  const previous = globalThis.window
  const listeners = new Map()
  globalThis.window = {
    localStorage: memoryStorage(),
    sessionStorage: memoryStorage(),
    addEventListener: (type, fn) => listeners.set(fn, type),
    removeEventListener: (type, fn) => listeners.delete(fn),
    dispatchEvent: () => true,
  }
  return () => {
    if (previous === undefined) delete globalThis.window
    else globalThis.window = previous
  }
}

/** Replaces global fetch; `handler(url, init, call, count)` returns a Response. */
export function mockFetch(handler) {
  const previous = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init = {}) => {
    // Like the real fetch, an already-aborted signal fails before anything is sent.
    if (init.signal?.aborted) throw new DOMException('This operation was aborted', 'AbortError')
    const call = { url: String(url), init, body: typeof init.body === 'string' ? JSON.parse(init.body) : null }
    calls.push(call)
    return handler(call.url, init, call, calls.length)
  }
  return {
    calls,
    restore: () => {
      globalThis.fetch = previous
    },
  }
}

/** A JSON response, the shape the relay returns for non-streamed calls. */
export const jsonResponse = (body, { status = 200, headers = {} } = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

/** An SSE response whose body arrives in the given chunks (split anywhere, even mid-line). */
export function sseResponse(chunks, { status = 200, headers = {} } = {}) {
  const encoder = new TextEncoder()
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(body, { status, headers: { 'content-type': 'text/event-stream', ...headers } })
}

/** SSE frames for an OpenAI-style streamed chat completion, one `data:` event per delta. */
export const sseFrames = (deltas, { done = true } = {}) =>
  deltas.map((delta) => `data: ${JSON.stringify({ choices: [{ index: 0, delta }] })}\n\n`).concat(done ? ['data: [DONE]\n\n'] : [])
