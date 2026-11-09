import { createContext, useContext } from 'react'

export const FinanceContext = createContext(null)
export const UiContext = createContext(null)

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
