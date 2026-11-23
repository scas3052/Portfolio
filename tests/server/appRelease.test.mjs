import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createAppRelease, LATEST_PATH, readLatest } from '../../server/appRelease.js'

const SHA = 'a'.repeat(64)
const PUBLISHED = {
  versionName: '1.0.12',
  versionCode: 12,
  url: 'https://store.public.blob.vercel-storage.com/gullak/apk/gullak-1.0.12-12-aaaaaaaa.apk',
  downloadUrl: 'https://store.public.blob.vercel-storage.com/gullak/apk/gullak-1.0.12-12-aaaaaaaa.apk?download=1',
  sha256: SHA,
  size: 6_400_000,
  publishedAt: '2026-11-20T10:00:00.000Z',
}

function setup({ blob = PUBLISHED, headError = null, status = 200 } = {}) {
  const calls = { head: [], fetch: [] }
  const release = createAppRelease({
    head: async (path) => {
      calls.head.push(path)
      if (headError) throw headError
      return { url: 'https://store.public.blob.vercel-storage.com/gullak/latest.json', uploadedAt: new Date('2026-11-20T10:00:05Z') }
    },
    fetchImpl: async (url) => {
      calls.fetch.push(url)
      return new Response(JSON.stringify(blob), { status })
    },
    log: { error: () => {} },
  })
  return { release, calls }
}

const get = (path = '/api/app') => new Request(`https://gullak.example${path}`)

test('describes the newest build, readable from any origin and cached briefly at the CDN', async () => {
  const { release, calls } = setup()
  const response = await release(get())
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('access-control-allow-origin'), '*')
  assert.match(response.headers.get('cache-control'), /s-maxage=300/)
  const body = await response.json()
  assert.deepEqual(body, {
    versionName: '1.0.12',
    versionCode: 12,
    sha256: SHA,
    size: 6_400_000,
    publishedAt: '2026-11-20T10:00:00.000Z',
    url: PUBLISHED.url,
  })
  assert.deepEqual(calls.head, [LATEST_PATH])
  // Asks for this write of latest.json, not a CDN copy of an older one.
  assert.equal(calls.fetch[0], `https://store.public.blob.vercel-storage.com/gullak/latest.json?v=${Date.parse('2026-11-20T10:00:05Z')}`)
})

test('?download redirects to the newest APK', async () => {
  const { release } = setup()
  const response = await release(get('/api/app?download=1'))
  assert.equal(response.status, 302)
  assert.equal(response.headers.get('location'), PUBLISHED.downloadUrl)
})

test('falls back to the plain URL when no download URL was stored', async () => {
  const { release } = setup({ blob: { ...PUBLISHED, downloadUrl: undefined } })
  const response = await release(get('/api/app?download=1'))
  assert.equal(response.headers.get('location'), PUBLISHED.url)
})

test('404 until a build is published, and that answer is not cached', async () => {
  const missing = Object.assign(new Error('Vercel Blob: The requested blob does not exist'), { name: 'BlobNotFoundError' })
  const { release, calls } = setup({ headError: missing })
  const response = await release(get())
  assert.equal(response.status, 404)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await response.json(), { error: 'not_published' })
  assert.equal(calls.fetch.length, 0)
})

test('503 when the Blob store is not connected or latest.json is unreadable', async () => {
  const noToken = new Error('Vercel Blob: No token found.')
  assert.equal((await setup({ headError: noToken }).release(get())).status, 503)
  assert.equal((await setup({ status: 500 }).release(get())).status, 503)
  assert.equal((await setup({ blob: { versionName: '1.0.0' } }).release(get())).status, 503)
})

test('answers CORS preflight and refuses other methods', async () => {
  const { release, calls } = setup()
  const preflight = await release(new Request('https://gullak.example/api/app', { method: 'OPTIONS' }))
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('access-control-allow-origin'), '*')
  const post = await release(new Request('https://gullak.example/api/app', { method: 'POST', body: '{}' }))
  assert.equal(post.status, 405)
  assert.equal(calls.head.length, 0)
})

test('readLatest keeps only well-formed fields', () => {
  assert.equal(readLatest(null), null)
  assert.equal(readLatest({ ...PUBLISHED, url: 'http://insecure.example/a.apk' }), null)
  assert.equal(readLatest({ ...PUBLISHED, versionCode: 0 }), null)
  assert.equal(readLatest({ ...PUBLISHED, versionName: '  ' }), null)
  const loose = readLatest({ ...PUBLISHED, versionCode: '12', sha256: 'nope', size: -1, publishedAt: 5 })
  assert.equal(loose.versionCode, 12)
  assert.equal(loose.sha256, null)
  assert.equal(loose.size, null)
  assert.equal(loose.publishedAt, null)
})
