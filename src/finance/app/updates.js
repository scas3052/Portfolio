// "Update available": at most once a day the app asks the Gullak site which APK is newest
// (/api/app, see api/app.js) and compares it with the installed build. Updates download in Chrome and install
// over the app, keeping its data, because every build is signed with the same key.

const SITE = String(import.meta.env.VITE_GULLAK_SITE_URL || '').replace(/\/+$/, '')
const KEY = 'gullak:app:update'
const DAY = 24 * 60 * 60 * 1000

/** Where the newest APK downloads from, or '' when this build doesn't know the site. */
export const downloadUrl = () => (SITE ? `${SITE}/api/app?download=1` : '')

function readCache() {
  try {
    return JSON.parse(window.localStorage.getItem(KEY) || 'null')
  } catch {
    return null
  }
}

/**
 * `{installed: {version, build}, latest, available}`, or null when the site isn't known. The site is asked at
 * most once a day unless `force` is set; otherwise the last answer is reused.
 */
export async function checkForUpdate({ force = false } = {}) {
  if (!SITE) return null
  const cached = readCache()
  const now = Date.now()
  let latest = cached?.latest || null
  if (force || !cached || now - cached.at > DAY) {
    const response = await fetch(`${SITE}/api/app`, { cache: 'no-store' })
    if (!response.ok) throw new Error(`The update check failed (${response.status}).`)
    latest = await response.json()
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ at: now, latest }))
    } catch {
      // Storage full: ask again next time.
    }
  }
  const { App } = await import('@capacitor/app')
  const info = await App.getInfo()
  const build = Number(info.build) || 0
  return {
    installed: { version: info.version, build },
    latest,
    available: Boolean(latest && Number(latest.versionCode) > build),
  }
}
