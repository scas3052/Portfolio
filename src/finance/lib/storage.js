import { emptyState, normalizeState } from './schema'

export const DATA_KEY = 'gullak:v1'
export const THEME_KEY = 'gullak:theme'
export const THEME_COLORS = { paper: '#f2eee3', ink: '#121212' }

export function loadState() {
  try {
    const raw = window.localStorage.getItem(DATA_KEY)
    return raw ? normalizeState(JSON.parse(raw)) : emptyState()
  } catch {
    return emptyState()
  }
}

/** Writes an already-serialized state. Returns false when storage is full or unavailable. */
export function persist(serialized) {
  try {
    window.localStorage.setItem(DATA_KEY, serialized)
    return true
  } catch {
    return false
  }
}

export function readTheme() {
  try {
    return window.localStorage.getItem(THEME_KEY) === 'ink' ? 'ink' : 'paper'
  } catch {
    return 'paper'
  }
}

export function writeTheme(theme) {
  try {
    window.localStorage.setItem(THEME_KEY, theme)
  } catch {
    // Storage can be unavailable (private mode); the theme still applies for this visit.
  }
}

/** Background colour of the portfolio page, used for the curtain when leaving. */
export function portfolioBackground() {
  try {
    return window.localStorage.getItem('theme') === 'light' ? '#f8f9fc' : '#07070d'
  } catch {
    return '#07070d'
  }
}
