import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TONES } from '../lib/categories'
import { monthOf } from '../lib/dates'
import { runBlinds } from '../lib/effects'
import { uid } from '../lib/id'
import { THEME_COLORS, writeTheme } from '../lib/storage'
import { UiContext, useFinance } from './contexts'

const LOCK_AFTER_MS = 2 * 60 * 1000

function makeParticles() {
  return Array.from({ length: 28 }, (_, i) => {
    const angle = (i / 28) * Math.PI * 2 + (Math.random() - 0.5) * 0.5
    const distance = 140 + Math.random() * 190
    return {
      id: i,
      coin: i % 3 === 0,
      tone: TONES[i % TONES.length],
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance * 0.8 - 40,
      rotate: (Math.random() - 0.5) * 540,
      delay: Math.random() * 0.08,
    }
  })
}

export default function UiProvider({ children }) {
  const { state, dispatch, derived, today } = useFinance()
  const [sheet, setSheet] = useState(null)
  const [toasts, setToasts] = useState([])
  const [celebration, setCelebration] = useState(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [lockedState, setLocked] = useState(() => Boolean(state.settings.pinHash))
  const [pickedMonth, setPickedMonth] = useState(() => monthOf(today))
  const [theme, setTheme] = useState(() => (document.documentElement.dataset.finTheme === 'ink' ? 'ink' : 'paper'))
  const [agent, setAgent] = useState({ open: false, closedAt: 0, prompt: null })
  const hiddenAt = useRef(0)

  const pinHash = state.settings.pinHash
  const locked = lockedState && Boolean(pinHash)
  const currentMonth = monthOf(today)
  const firstMonth = derived.firstMonth < currentMonth ? derived.firstMonth : currentMonth
  const month = pickedMonth > currentMonth ? currentMonth : pickedMonth < firstMonth ? firstMonth : pickedMonth

  const openSheet = useCallback((kind, props = {}) => setSheet({ kind, props, key: uid('sheet') }), [])
  const closeSheet = useCallback(() => setSheet(null), [])

  const dismissToast = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), [])
  const toast = useCallback((message, options = {}) => {
    const id = uid('toast')
    const next = {
      id,
      message,
      tone: options.tone || 'ink',
      icon: options.icon || null,
      action: options.action || null,
      duration: options.duration ?? 4200,
    }
    setToasts((list) => [...list, next].slice(-3))
    return id
  }, [])

  const celebrate = useCallback((kind, detail = '') => {
    setCelebration({ id: uid('party'), kind, detail, particles: makeParticles() })
  }, [])
  const endCelebration = useCallback(() => setCelebration(null), [])

  const setMonth = useCallback((value) => setPickedMonth(value), [])

  const toggleTheme = useCallback(() => {
    const next = theme === 'ink' ? 'paper' : 'ink'
    runBlinds(THEME_COLORS[next], () => {
      document.documentElement.dataset.finTheme = next
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[next])
      writeTheme(next)
      setTheme(next)
    })
  }, [theme])

  // `closedAt` lets the launcher show an unread dot for replies that land after the panel was closed.
  const setAgentOpen = useCallback((next) => {
    const now = Date.now()
    setAgent((current) => {
      const open = Boolean(typeof next === 'function' ? next(current.open) : next)
      if (open === current.open) return current
      return open ? { ...current, open } : { open, closedAt: now, prompt: null }
    })
  }, [])
  const toggleAgent = useCallback(() => setAgentOpen((open) => !open), [setAgentOpen])

  // Other surfaces (the command palette) can hand Munshi a question to send as soon as it opens.
  const askAgent = useCallback((text) => {
    const question = String(text || '').trim()
    setAgent((current) => ({ ...current, open: true, prompt: question ? { id: uid('ask'), text: question } : null }))
  }, [])
  const takeAgentPrompt = useCallback((id) => {
    setAgent((current) => (current.prompt?.id === id ? { ...current, prompt: null } : current))
  }, [])

  const lock = useCallback(() => {
    if (!pinHash) return false
    setPaletteOpen(false)
    setSheet(null)
    setAgentOpen(false)
    setLocked(true)
    return true
  }, [pinHash, setAgentOpen])
  const unlock = useCallback(() => setLocked(false), [])

  const privacy = state.settings.privacy
  const togglePrivacy = useCallback(() => {
    dispatch({ type: 'settings/update', patch: { privacy: !privacy } })
  }, [dispatch, privacy])

  // Lock again when the tab has been in the background for a while. The timer locks while the page
  // is still hidden, so balances never flash on return; the elapsed check covers throttled timers.
  useEffect(() => {
    if (!pinHash) return undefined
    let timer = 0
    const lockAway = () => {
      setSheet(null)
      setPaletteOpen(false)
      setAgentOpen(false)
      setLocked(true)
    }
    const onVisibility = () => {
      window.clearTimeout(timer)
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now()
        timer = window.setTimeout(lockAway, LOCK_AFTER_MS)
      } else {
        if (hiddenAt.current && Date.now() - hiddenAt.current > LOCK_AFTER_MS) lockAway()
        hiddenAt.current = 0
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [pinHash, setAgentOpen])

  useEffect(() => {
    const onFail = () =>
      toast('Couldn’t save. Browser storage is full or blocked, so export a backup from Settings.', {
        tone: 'rose',
        duration: 9000,
      })
    window.addEventListener('gullak:save-failed', onFail)
    return () => window.removeEventListener('gullak:save-failed', onFail)
  }, [toast])

  const value = useMemo(
    () => ({
      sheet,
      openSheet,
      closeSheet,
      toasts,
      toast,
      dismissToast,
      celebration,
      celebrate,
      endCelebration,
      paletteOpen,
      setPaletteOpen,
      agentOpen: agent.open,
      agentClosedAt: agent.closedAt,
      agentPrompt: agent.prompt,
      setAgentOpen,
      toggleAgent,
      askAgent,
      takeAgentPrompt,
      locked,
      lock,
      unlock,
      month,
      firstMonth,
      currentMonth,
      setMonth,
      theme,
      toggleTheme,
      privacy,
      togglePrivacy,
    }),
    [
      sheet,
      openSheet,
      closeSheet,
      toasts,
      toast,
      dismissToast,
      celebration,
      celebrate,
      endCelebration,
      paletteOpen,
      agent,
      setAgentOpen,
      toggleAgent,
      askAgent,
      takeAgentPrompt,
      locked,
      lock,
      unlock,
      month,
      firstMonth,
      currentMonth,
      setMonth,
      theme,
      toggleTheme,
      privacy,
      togglePrivacy,
    ],
  )

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>
}
