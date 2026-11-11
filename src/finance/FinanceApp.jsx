import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import Overlays from './components/overlays/Overlays'
import Welcome from './components/overlays/Welcome'
import SampleBanner from './components/shell/SampleBanner'
import Sidebar from './components/shell/Sidebar'
import TabBar from './components/shell/TabBar'
import Topbar from './components/shell/Topbar'
import { useActions } from './hooks/useActions'
import { isTypingTarget, useKeydown } from './hooks/useKeydown'
import { useToday } from './hooks/useToday'
import { addMonths } from './lib/dates'
import { navigate, useHashRoute, viewMeta, VIEWS } from './lib/router'
import { useFinance, useUi } from './store/contexts'
import FinanceProvider from './store/FinanceProvider'
import UiProvider from './store/UiProvider'
import Accounts from './views/Accounts'
import Activity from './views/Activity'
import Emis from './views/Emis'
import Overview from './views/Overview'
import People from './views/People'
import Plan from './views/Plan'
import Settings from './views/Settings'
import Spending from './views/Spending'

const SCREENS = {
  overview: Overview,
  activity: Activity,
  spending: Spending,
  accounts: Accounts,
  emis: Emis,
  people: People,
  plan: Plan,
  settings: Settings,
}

const EASE_IN = [0.5, 0, 0.75, 0]

// Sections turn like ledger leaves: the new one slides in from the side it lives on, slightly sheared.
const LEAF = {
  enter: (dir) => ({ opacity: 0, x: dir * 48, skewX: dir * -3 }),
  center: { opacity: 1, x: 0, skewX: 0, transition: { type: 'spring', stiffness: 360, damping: 32 } },
  exit: (dir) => ({ opacity: 0, x: dir * -32, skewX: dir * 2, transition: { duration: 0.15, ease: EASE_IN } }),
}

const LEAVE_WELCOME = { opacity: 0, y: 50, scale: 0.94, transition: { duration: 0.28, ease: EASE_IN } }

const toTop = () => window.scrollTo({ top: 0, left: 0, behavior: 'instant' })

function skipToMain(event) {
  event.preventDefault()
  document.getElementById('g-main')?.focus()
}

function Shell() {
  const { state } = useFinance()
  const {
    locked,
    sheet,
    paletteOpen,
    setPaletteOpen,
    agentOpen,
    setAgentOpen,
    toggleAgent,
    openSheet,
    togglePrivacy,
    toggleTheme,
    month,
    firstMonth,
    currentMonth,
    setMonth,
  } = useUi()
  const { addEntry, lockNow } = useActions()
  const { view, params, direction } = useHashRoute()
  const meta = viewMeta(view)
  const Screen = SCREENS[meta.id]

  // Keep the books out of the page while the vault is shut: they never render behind the doors on
  // load, and they unmount once the closing doors cover the screen.
  const open = !locked && state.settings.onboarded
  const [shown, setShown] = useState(open)
  if (open && !shown) setShown(true)

  useEffect(() => {
    if (!locked) return undefined
    const timer = setTimeout(() => setShown(false), 700)
    return () => clearTimeout(timer)
  }, [locked])

  useEffect(() => {
    document.title = `${meta.label} · Gullak`
  }, [meta.label])

  useKeydown((event) => {
    // Autofill fires keydown events without a key.
    if (!event.key || event.defaultPrevented || event.isComposing || locked || sheet) return
    const mod = event.metaKey || event.ctrlKey
    if (mod && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      setPaletteOpen((value) => !value)
      return
    }
    if (mod && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'j' && state.settings.onboarded) {
      event.preventDefault()
      setPaletteOpen(false)
      toggleAgent()
      return
    }
    if (mod || event.altKey || paletteOpen || isTypingTarget(event.target)) return
    // Single letters belong to the page; inside Munshi's panel they would fire behind the user's back.
    if (event.target instanceof Element && event.target.closest('.g-mk-layer')) return

    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
    const stepsMonth = key === '[' || key === ']'
    if (event.repeat && !stepsMonth) return

    const jump = VIEWS.find((item) => item.key === key)
    if (jump) navigate(jump.id)
    else if (key === '/') setPaletteOpen(true)
    else if (key === 'n') addEntry({ type: 'expense' })
    else if (key === 'i') addEntry({ type: 'income' })
    else if (key === 'h') togglePrivacy()
    else if (key === 't') toggleTheme()
    else if (key === 'l') lockNow()
    else if (key === 'a' && state.settings.onboarded) {
      if (agentOpen) document.getElementById('g-mk-input')?.focus()
      else setAgentOpen(true)
    } else if (key === '?') openSheet('shortcuts')
    else if (stepsMonth && meta.month) {
      const next = addMonths(month, key === '[' ? -1 : 1)
      if (next < firstMonth || next > currentMonth) return
      setMonth(next)
    } else return
    event.preventDefault()
  })

  if (!shown) return null

  return (
    <div className="g-app" inert={locked}>
      <a className="g-skip" href="#g-main" onClick={skipToMain}>
        Skip to content
      </a>
      <Sidebar view={meta.id} />
      <div className="g-stage">
        <Topbar view={meta.id} />
        <SampleBanner />
        <main id="g-main" className="g-main" tabIndex={-1}>
          <AnimatePresence mode="wait" initial={false} custom={direction} onExitComplete={toTop}>
            <motion.div key={meta.id} custom={direction} variants={LEAF} initial="enter" animate="center" exit="exit">
              <Screen params={params} />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <TabBar view={meta.id} />
    </div>
  )
}

function Gate() {
  const { state } = useFinance()
  const onboarded = state.settings.onboarded

  useEffect(() => {
    if (!onboarded) document.title = 'Welcome · Gullak'
  }, [onboarded])

  return (
    <>
      <AnimatePresence mode="wait">
        {onboarded ? (
          <Shell key="app" />
        ) : (
          <motion.div key="welcome" exit={LEAVE_WELCOME}>
            <Welcome />
          </motion.div>
        )}
      </AnimatePresence>
      <Overlays />
    </>
  )
}

/** Gullak: a private money book that lives entirely in this browser. */
export default function FinanceApp() {
  const today = useToday()
  return (
    <FinanceProvider today={today}>
      <UiProvider>
        <Gate />
      </UiProvider>
    </FinanceProvider>
  )
}
