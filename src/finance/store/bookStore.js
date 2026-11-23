// The book as a small store outside React. Every change is saved to localStorage the moment it
// happens, so other tabs and cloud sync always read the latest book, and edits made here are told
// apart from books that arrive from elsewhere (another tab or the cloud): only edits are reported
// to `subscribeLocal` listeners, as (previous state, next state).
import { normalizeState } from '../lib/schema'
import { DATA_KEY, loadSaved, persist } from '../lib/storage'
import { reducer } from './reducer'

export function createBookStore() {
  const boot = loadSaved()
  let state = boot.state
  // What localStorage holds as far as this tab knows, and the state it was written from.
  let saved = { state: null, raw: boot.raw }
  const views = new Set()
  const editListeners = new Set()

  function save(next) {
    if (next === saved.state) return
    const raw = JSON.stringify(next)
    if (raw !== saved.raw && !persist(raw)) {
      window.dispatchEvent(new CustomEvent('gullak:save-failed'))
      return
    }
    saved = { state: next, raw }
  }

  function show(next) {
    state = next
    for (const view of views) view()
  }

  function readRaw() {
    try {
      return window.localStorage.getItem(DATA_KEY)
    } catch {
      return null
    }
  }

  /** Takes in a book another tab saved since this one last looked. */
  function refresh() {
    const raw = readRaw()
    if (raw === null || raw === saved.raw) return
    try {
      const fresh = normalizeState(JSON.parse(raw))
      saved = { state: fresh, raw }
      show(fresh)
    } catch {
      // A malformed write from elsewhere: keep this book, and write it back on the next change.
      saved = { state: null, raw }
    }
  }

  function dispatch(action) {
    refresh()
    const prev = state
    const next = reducer(prev, action)
    if (next === prev) return
    save(next)
    show(next)
    for (const listener of editListeners) {
      try {
        listener(prev, next)
      } catch (err) {
        // The edit is already saved; a sync hiccup must not break bookkeeping.
        console.error(err)
      }
    }
  }

  /** Replaces the book without reporting it as an edit (for books that come from the cloud). */
  function applyRemote(next) {
    if (next === state) return
    save(next)
    show(next)
  }

  function getState() {
    refresh()
    return state
  }

  return {
    getSnapshot: () => state,
    subscribe(view) {
      views.add(view)
      return () => {
        views.delete(view)
      }
    },
    dispatch,
    /** Writes the book as loaded (normalizeState may have upgraded an older one). */
    saveNow() {
      refresh()
      save(state)
    },
    refresh,
    bridge: {
      getState,
      applyRemote,
      subscribeLocal(listener) {
        editListeners.add(listener)
        return () => {
          editListeners.delete(listener)
        }
      },
    },
  }
}
