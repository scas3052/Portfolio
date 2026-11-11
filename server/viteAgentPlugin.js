import { Readable } from 'node:stream'
import { loadEnv } from 'vite'
import { createAgentRelay } from './agentRelay.js'

const ROUTE = /^\/api\/agent\/?$/

function toRequest(req, signal) {
  const protocol = req.socket?.encrypted ? 'https' : 'http'
  const url = new URL(req.originalUrl || req.url || '/', `${protocol}://${req.headers.host || 'localhost'}`)
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (key.startsWith(':') || value === undefined) continue
    if (Array.isArray(value)) value.forEach((item) => headers.append(key, item))
    else headers.set(key, value)
  }
  const init = { method: req.method, headers, signal }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = Readable.toWeb(req)
    init.duplex = 'half'
  }
  return new Request(url, init)
}

async function send(res, response) {
  res.statusCode = response.status
  response.headers.forEach((value, key) => res.setHeader(key, value))
  if (!response.body) {
    res.end()
    return
  }
  res.flushHeaders?.()
  const reader = response.body.getReader()
  const stop = () => reader.cancel().catch(() => {})
  res.once('close', stop)
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done || res.destroyed) break
      if (!res.write(value)) {
        await new Promise((resolve) => {
          res.once('drain', resolve)
          res.once('close', resolve)
        })
      }
    }
  } finally {
    res.off('close', stop)
    if (!res.destroyed) res.end()
  }
}

/**
 * Serves the assistant relay at /api/agent during `vite` and `vite preview`, so
 * the same code that runs on Vercel/Netlify works locally with keys from .env.local.
 */
export default function agentRelay() {
  let env = {}
  let relay = null

  async function handle(req, res, next) {
    const path = (req.originalUrl || req.url || '').split('?')[0]
    if (!ROUTE.test(path)) return next()
    relay ??= createAgentRelay(env)
    const controller = new AbortController()
    res.once('close', () => {
      if (!res.writableEnded) controller.abort()
    })
    try {
      await send(res, await relay(toRequest(req, controller.signal)))
    } catch {
      if (res.headersSent) res.destroy()
      else {
        res.statusCode = 500
        res.setHeader('content-type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ error: 'relay_crashed' }))
      }
    }
  }

  return {
    name: 'gullak-agent-relay',
    configResolved(config) {
      // All variables (not just VITE_*) — they stay on the dev server, never in the bundle.
      env = config.envDir === false ? { ...process.env } : loadEnv(config.mode, config.envDir || config.root, '')
    },
    // Registered directly (not as a post hook) so the relay answers before Vite's
    // SPA fallback; the passphrase is what guards it.
    configureServer(server) {
      server.middlewares.use(handle)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handle)
    },
  }
}
