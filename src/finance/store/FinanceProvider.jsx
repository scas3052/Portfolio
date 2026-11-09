import { useEffect, useMemo, useReducer, useRef } from 'react'
import { normalizeState } from '../lib/schema'
import { deriveAll } from '../lib/selectors'
import { DATA_KEY, loadState, persist } from '../lib/storage'
import { FinanceContext } from './contexts'
import { reducer } from './reducer'

export default function FinanceProvider({ today, children }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState)
  const lastSaved = useRef(null)

  useEffect(() => {
    const serialized = JSON.stringify(state)
    if (serialized === lastSaved.current) return
    if (persist(serialized)) lastSaved.current = serialized
    else window.dispatchEvent(new CustomEvent('gullak:save-failed'))
  }, [state])

  // Keep several open tabs in sync.
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key !== DATA_KEY || event.newValue === null) return
      try {
        const next = normalizeState(JSON.parse(event.newValue))
        lastSaved.current = JSON.stringify(next)
        dispatch({ type: 'data/replace', state: next })
      } catch {
        // Ignore malformed writes from elsewhere.
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const derived = useMemo(() => deriveAll(state, today), [state, today])
  const value = useMemo(() => ({ state, dispatch, derived, today }), [state, derived, today])

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>
}
