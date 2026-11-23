// Which Gullak Android build is newest. The "Android app" GitHub workflow signs each APK and publishes it to
// Vercel Blob with scripts/upload-apk.mjs, which also writes gullak/latest.json describing it. api/app.js serves
// this, for the website's "Get the Android app" sheet and the app's own update check:
//
//   GET /api/app             {versionName, versionCode, sha256, size, publishedAt, url}  (404 until one is published)
//   GET /api/app?download=1  302 to the newest APK
//
// Everything here is public (the APK is a public download), so any origin may read it, including the app itself
// (https://localhost).

export const LATEST_PATH = 'gullak/latest.json'
export const APK_PREFIX = 'gullak/apk/'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-max-age': '86400',
}
// Vercel's CDN keeps an answer for 5 minutes, so a new build shows up within 5 minutes of publishing.
const CACHED = 'public, max-age=0, s-maxage=300, stale-while-revalidate=600'

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS, ...headers },
  })
}

// Vercel Blob's head() throws BlobNotFoundError for a missing blob; matched by name and message so this file
// doesn't depend on the SDK's error classes.
function notFound(error) {
  const name = error?.name || error?.constructor?.name || ''
  return name === 'BlobNotFoundError' || /does not exist|not[_ ]found/i.test(String(error?.message || ''))
}

const isHttps = (value) => typeof value === 'string' && /^https:\/\//.test(value)

/** The published description, or null if it's missing anything the website or app relies on. */
export function readLatest(data) {
  if (!data || typeof data !== 'object') return null
  const versionCode = Number(data.versionCode)
  const versionName = typeof data.versionName === 'string' ? data.versionName.trim() : ''
  if (!Number.isInteger(versionCode) || versionCode < 1 || !versionName || !isHttps(data.url)) return null
  return {
    versionName,
    versionCode,
    url: data.url,
    downloadUrl: isHttps(data.downloadUrl) ? data.downloadUrl : data.url,
    sha256: /^[0-9a-f]{64}$/i.test(String(data.sha256 || '')) ? String(data.sha256).toLowerCase() : null,
    size: Number(data.size) > 0 ? Number(data.size) : null,
    publishedAt: typeof data.publishedAt === 'string' ? data.publishedAt : null,
  }
}

/**
 * The /api/app handler. `head(pathname)` is Vercel Blob's head() (it finds latest.json and when it was last
 * written); `fetchImpl` reads it. Both are injected so tests run without a Blob store.
 */
export function createAppRelease({ head, fetchImpl = globalThis.fetch, log = console } = {}) {
  async function latest() {
    let blob
    try {
      blob = await head(LATEST_PATH)
    } catch (error) {
      if (notFound(error)) return null
      throw error
    }
    // latest.json is overwritten on every publish and blob URLs are CDN-cached, so ask for this write's copy.
    const stamp = new Date(blob.uploadedAt).getTime() || Date.now()
    const response = await fetchImpl(`${blob.url}?v=${stamp}`, { cache: 'no-store' })
    if (!response.ok) throw new Error(`Reading ${LATEST_PATH} failed (${response.status}).`)
    const found = readLatest(await response.json())
    if (!found) throw new Error(`${LATEST_PATH} is missing the version or download URL.`)
    return found
  }

  return async function release(request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    if (request.method !== 'GET') return json(405, { error: 'method_not_allowed' }, { allow: 'GET, OPTIONS' })

    let found
    try {
      found = await latest()
    } catch (error) {
      // Usually: no Blob store connected to this Vercel project (BLOB_READ_WRITE_TOKEN missing).
      log.error?.('[api/app]', error?.message || error)
      return json(503, { error: 'unavailable' }, { 'cache-control': 'no-store' })
    }
    if (!found) return json(404, { error: 'not_published' }, { 'cache-control': 'no-store' })

    if (new URL(request.url).searchParams.has('download')) {
      return new Response(null, { status: 302, headers: { ...CORS, location: found.downloadUrl, 'cache-control': CACHED } })
    }
    const { versionName, versionCode, sha256, size, publishedAt, url } = found
    return json(200, { versionName, versionCode, sha256, size, publishedAt, url }, { 'cache-control': CACHED })
  }
}
