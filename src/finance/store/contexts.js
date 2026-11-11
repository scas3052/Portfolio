import { createContext, useContext } from 'react'

export const FinanceContext = createContext(null)
export const UiContext = createContext(null)
export const CloudContext = createContext(null)

const noop = () => {}

/** What cloud sync looks like when it is not set up for this site (no Firebase config). */
export const CLOUD_OFF = Object.freeze({
  available: false,
  linked: false,
  email: '',
  status: 'off',
  detail: null,
  pending: 0,
  lastSyncedAt: null,
  linking: null,
  sdk: 'idle',
  notice: null,
  prepare: noop,
  startLink: noop,
  chooseLink: noop,
  cloudCopy: () => null,
  retry: noop,
  reupload: noop,
  signOutDevice: noop,
  confirmWithGoogle: () => Promise.resolve({ ok: false, message: null }),
})

export function useFinance() {
  const value = useContext(FinanceContext)
  if (!value) throw new Error('useFinance must be used inside <FinanceProvider>')
  return value
}

export function useUi() {
  const value = useContext(UiContext)
  if (!value) throw new Error('useUi must be used inside <UiProvider>')
  return value
}

export function useCloud() {
  return useContext(CloudContext) || CLOUD_OFF
}
