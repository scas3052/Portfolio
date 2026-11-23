// Keys edited on this device that the cloud has not confirmed yet, kept in localStorage so they
// survive a reload, a crash or a closed tab, and are shared by every open tab.
// Each key carries a token naming the edit; a tab only clears a key if the token is still the one
// it sent, so a newer edit made meanwhile is never forgotten.
export const OUTBOX_KEY = 'gullak:cloud:outbox'

const TAB = Math.random().toString(36).slice(2, 8)
let counter = 0

export const newToken = () => `${TAB}.${(counter += 1)}`

export function readOutbox() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(OUTBOX_KEY) || '{}')
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    const out = {}
    for (const [key, token] of Object.entries(raw)) if (key.includes(':') && typeof token === 'string') out[key] = token
    return out
  } catch {
    return {}
  }
}

function writeOutbox(outbox) {
  try {
    if (Object.keys(outbox).length) window.localStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox))
    else window.localStorage.removeItem(OUTBOX_KEY)
  } catch {
    // Without storage the edits still sync from memory; they just won't outlive this tab.
  }
}

export function addToOutbox(keys, token) {
  if (!keys.length) return
  const outbox = readOutbox()
  for (const key of keys) outbox[key] = token
  writeOutbox(outbox)
}

/** Clears the keys in `sent` (key → token) whose token has not changed since. */
export function ackOutbox(sent) {
  const outbox = readOutbox()
  let changed = false
  for (const [key, token] of sent) {
    if (outbox[key] === token) {
      delete outbox[key]
      changed = true
    }
  }
  if (changed) writeOutbox(outbox)
}

export function clearOutbox() {
  writeOutbox({})
}
