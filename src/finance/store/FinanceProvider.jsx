import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { deriveAll } from '../lib/selectors'
import { DATA_KEY } from '../lib/storage'
import { createBookStore } from './bookStore'
import { FinanceContext } from './contexts'

export default function FinanceProvider({ today, children }) {
  const [store] = useState(createBookStore)
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)

  useEffect(() => {
    store.saveNow()
    // Keep several open tabs in sync.
    const onStorage = (event) => {
      if (event.key === DATA_KEY) store.refresh()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [store])

  const derived = useMemo(() => deriveAll(state, today), [state, today])
  const value = useMemo(
    () => ({ state, dispatch: store.dispatch, derived, today, bridge: store.bridge }),
    [state, derived, today, store],
  )

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>
}
