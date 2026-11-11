import { useSyncExternalStore } from 'react'

// Assistant settings live outside the finance state: they're per-browser, never
// exported in backups, and survive "Erase everything".
const SETTINGS_KEY = 'gullak:agent'
const PASS_KEY = 'gullak:agent:pass'
const CHAT_KEY = 'gullak:agent:chat'
const CHAT_LIMIT = 50

export const DEFAULT_ENDPOINT = '/api/agent'
const DEFAULTS = { endpoint: DEFAULT_ENDPOINT, provider: '', quickAdd: true, voiceLang: 'en-IN' }

const listeners = new Set()
const chatCleared = new Set()
let snapshot = null

function storage(kind) {
  try {
    return kind === 'session' ? window.sessionStorage : window.localStorage
  } catch {
    return null
  }
}

function read(key, kind = 'local') {
  try {
    return storage(kind)?.getItem(key) ?? null
  } catch {
    return null
  }
}

function write(key, value, kind = 'local') {
  try {
    if (value === null) storage(kind)?.removeItem(key)
    else storage(kind)?.setItem(key, value)
    return true
  } catch {
    return false
  }
}

export function validEndpoint(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (/^\/(?!\/)/.test(text)) return text
  try {
    const url = new URL(text)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href.replace(/\/+$/, '') : ''
  } catch {
    return ''
  }
}

function readSettings() {
  let stored
  try {
    stored = JSON.parse(read(SETTINGS_KEY) || '{}') || {}
  } catch {
    stored = {}
  }
  return {
    endpoint: validEndpoint(stored.endpoint) || DEFAULTS.endpoint,
    provider: typeof stored.provider === 'string' ? stored.provider.slice(0, 30) : DEFAULTS.provider,
    quickAdd: typeof stored.quickAdd === 'boolean' ? stored.quickAdd : DEFAULTS.quickAdd,
    voiceLang: typeof stored.voiceLang === 'string' && /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(stored.voiceLang)
      ? stored.voiceLang
      : DEFAULTS.voiceLang,
  }
}

function emit() {
  snapshot = null
  listeners.forEach((listener) => listener())
}

export function getPass() {
  return (read(PASS_KEY) || read(PASS_KEY, 'session') || '').trim()
}

/** The current settings plus whether a passphrase is saved (never the passphrase itself). */
export function getAgentConfig() {
  if (!snapshot) {
    const remembered = Boolean(read(PASS_KEY))
    snapshot = { ...readSettings(), hasPass: Boolean(getPass()), remembered }
  }
  return snapshot
}

export function saveAgentSettings(patch) {
  const next = { ...readSettings(), ...patch }
  next.endpoint = validEndpoint(next.endpoint) || DEFAULTS.endpoint
  write(SETTINGS_KEY, JSON.stringify(next))
  emit()
}

/** Keeps the passphrase in localStorage when remembered, otherwise only for this tab. */
export function setPass(pass, remember) {
  const value = String(pass || '').trim()
  write(PASS_KEY, null)
  write(PASS_KEY, null, 'session')
  if (value) write(PASS_KEY, value, remember ? 'local' : 'session')
  emit()
}

export function forgetPass() {
  setPass('', false)
}

function subscribe(listener) {
  listeners.add(listener)
  const onStorage = (event) => {
    if (!event.key || event.key.startsWith(SETTINGS_KEY)) {
      snapshot = null
      listener()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function useAgentConfig() {
  return useSyncExternalStore(subscribe, getAgentConfig, getAgentConfig)
}

export function loadChat() {
  try {
    const list = JSON.parse(read(CHAT_KEY) || '[]')
    return Array.isArray(list) ? list.filter((m) => m && typeof m.id === 'string' && typeof m.role === 'string') : []
  } catch {
    return []
  }
}

export function saveChat(messages) {
  const kept = messages.slice(-CHAT_LIMIT).map((message) => {
    const copy = { ...message }
    delete copy.streaming
    return copy
  })
  return write(CHAT_KEY, JSON.stringify(kept))
}

export function clearChat() {
  write(CHAT_KEY, null)
  chatCleared.forEach((listener) => listener())
}

/** Lets an open chat reset itself when Settings → Erase wipes the stored history. */
export function onChatCleared(listener) {
  chatCleared.add(listener)
  return () => chatCleared.delete(listener)
}
