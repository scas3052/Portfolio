// Remembers which Google account this device syncs with. It sits next to the book in localStorage,
// so every tab sees it, and a device without it is simply not linked.
// When the device was last in step with the cloud is kept under its own key, so a late write of
// that time from a tab that has not heard about a sign-out yet can never bring the link back.
export const MARKER_KEY = 'gullak:cloud'
export const SYNCED_KEY = 'gullak:cloud:synced'

function readJson(key) {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || 'null')
    return value && typeof value === 'object' ? value : null
  } catch {
    return null
  }
}

/** { uid, email, lastSyncedAt } for a linked device, or null. */
export function readMarker() {
  const marker = readJson(MARKER_KEY)
  if (!marker || typeof marker.uid !== 'string' || !marker.uid) return null
  const synced = readJson(SYNCED_KEY)
  return {
    uid: marker.uid,
    email: typeof marker.email === 'string' ? marker.email : '',
    lastSyncedAt: synced?.uid === marker.uid && Number.isFinite(synced.at) ? synced.at : null,
  }
}

/** Returns false when the marker could not be saved (storage full or blocked). */
export function writeMarker({ uid, email = '' }) {
  try {
    window.localStorage.setItem(MARKER_KEY, JSON.stringify({ uid, email }))
    return true
  } catch {
    return false
  }
}

export function noteSynced(uid, at) {
  try {
    window.localStorage.setItem(SYNCED_KEY, JSON.stringify({ uid, at }))
  } catch {
    // Only a convenience for the status line.
  }
}

export function clearMarker() {
  try {
    window.localStorage.removeItem(MARKER_KEY)
    window.localStorage.removeItem(SYNCED_KEY)
  } catch {
    // Nothing to forget if storage is unavailable.
  }
}
