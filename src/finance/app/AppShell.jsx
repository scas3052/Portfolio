import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useAgentConfig } from '../agent/agentConfig'
import { spendContext } from '../agent/spends'
import BalanceSheet from '../inbox/BalanceSheet'
import CaptureSettings from '../inbox/CaptureSettings'
import InboxBanner from '../inbox/InboxBanner'
import InboxSheet from '../inbox/InboxSheet'
import StatementSheet from '../inbox/StatementSheet'
import { RESUME_EVENT, useInboxState } from '../inbox/useInbox'
import { plural } from '../lib/format'
import { LOCK_AFTER_MS } from '../lib/pin'
import { AppContext, useFinance, useUi } from '../store/contexts'
import { shareFile, shareText } from './native'
import { isNativeApp } from './platform'
import { checkForUpdate, downloadUrl } from './updates'

// Capacitor injects its bridge before any page script runs, so this is settled at load.
const NATIVE = isNativeApp()

// Sheets and slots the shared screens show only in the app.
const SHEETS = {
  inbox: { Form: InboxSheet, tone: 'lime', kicker: 'Payments', title: () => 'Unfiled spends', wide: true },
  statement: { Form: StatementSheet, tone: 'sky', kicker: 'Payments', title: () => 'Import a bank statement', wide: true },
  balance: { Form: BalanceSheet, tone: 'butter', kicker: 'Weekly check', title: () => 'Balance check' },
}
const SLOTS = { home: InboxBanner, settings: CaptureSettings }

const HANDED_KEY = 'gullak:inbox:handed'
const warn = (err) => console.warn('Gullak app:', err)

function readHanded() {
  try {
    const list = JSON.parse(window.localStorage.getItem(HANDED_KEY) || '[]')
    return new Set(Array.isArray(list) ? list : [])
  } catch {
    return new Set()
  }
}

function writeHanded(ids) {
  try {
    window.localStorage.setItem(HANDED_KEY, JSON.stringify([...ids].slice(-200)))
  } catch {
    // Storage full: worst case a note is offered to Munshi again.
  }
}

/** Status bar colours, the back button, locking after time away and the keyboard, on the phone only. */
function useNativeChrome() {
  const ui = useUi()
  const live = useRef(ui)
  useLayoutEffect(() => {
    live.current = ui
  })

  const { theme } = ui
  useEffect(() => {
    if (!NATIVE) return
    // Paper wants dark icons on the status bar, ink wants light ones.
    import('@capacitor/core')
      .then(({ SystemBars, SystemBarsStyle }) => SystemBars?.setStyle({ style: theme === 'ink' ? SystemBarsStyle.Dark : SystemBarsStyle.Light }))
      .catch(warn)
  }, [theme])

  useEffect(() => {
    if (!NATIVE) return undefined
    let alive = true
    let awayAt = 0
    const handles = []
    const keep = (pending) => pending.then((handle) => (alive ? handles.push(handle) : handle.remove()), warn)
    const root = document.documentElement

    import('@capacitor/app')
      .then(({ App }) => {
        if (!alive) return
        // Back closes the open sheet, then the palette, then Munshi, and otherwise puts Gullak away.
        keep(
          App.addListener('backButton', () => {
            const current = live.current
            if (current.sheet) current.closeSheet()
            else if (current.paletteOpen) current.setPaletteOpen(false)
            else if (current.agentOpen) current.setAgentOpen(false)
            else void App.minimizeApp()
          }),
        )
        keep(
          App.addListener('appStateChange', ({ isActive }) => {
            if (!isActive) {
              awayAt = Date.now()
              return
            }
            if (awayAt && Date.now() - awayAt > LOCK_AFTER_MS) live.current.lock()
            awayAt = 0
            window.dispatchEvent(new Event(RESUME_EVENT))
          }),
        )
      })
      .catch(warn)

    // The tab bar would float above the keyboard; hide it while typing.
    import('@capacitor/keyboard')
      .then(({ Keyboard }) => {
        if (!alive) return
        keep(
          Keyboard.addListener('keyboardWillShow', () => {
            root.dataset.keyboard = 'open'
          }),
        )
        keep(
          Keyboard.addListener('keyboardWillHide', () => {
            delete root.dataset.keyboard
          }),
        )
      })
      .catch(warn)

    return () => {
      alive = false
      handles.forEach((handle) => handle.remove())
      delete root.dataset.keyboard
    }
  }, [])
}

/** Asks the site once a day whether a newer APK is out. */
function useUpdateCheck() {
  const [result, setResult] = useState(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    if (!NATIVE) return undefined
    let alive = true
    checkForUpdate().then((found) => alive && setResult(found), warn)
    return () => {
      alive = false
    }
  }, [])

  const recheck = useCallback(async () => {
    if (!NATIVE) return null
    setChecking(true)
    try {
      const found = await checkForUpdate({ force: true })
      setResult(found)
      return found
    } finally {
      setChecking(false)
    }
  }, [])

  return useMemo(() => ({ ...(result || {}), link: downloadUrl(), checking, recheck }), [result, checking, recheck])
}

/**
 * Opens a payment from a notification tap or a share, opens the balance check from the weekly reminder, and hands
 * reply notes to Munshi.
 */
function InboxEffects({ inbox }) {
  const finance = useFinance()
  const { openSheet, askAgent, toast, locked } = useUi()
  const { hasPass } = useAgentConfig()
  const ready = finance.state.settings.onboarded && !locked
  const { opening, clearOpening, intent, clearIntent, unfiled } = inbox
  const live = useRef(finance)
  useLayoutEffect(() => {
    live.current = finance
  })

  // After the PIN, if one is set.
  useEffect(() => {
    if (!opening || !ready) return
    clearOpening()
    openSheet('inbox', { focus: opening.id })
  }, [opening, ready, clearOpening, openSheet])

  useEffect(() => {
    if (!intent || !ready) return
    clearIntent()
    if (intent.kind === 'balance') openSheet('balance')
  }, [intent, ready, clearIntent, openSheet])

  // "dinner, split with Ravi" typed on the notification: Munshi drafts the entries when Gullak opens.
  // Without Munshi (no passphrase, or offline) the note waits on the card and fills the entry form.
  useEffect(() => {
    if (!ready || !hasPass || navigator.onLine === false) return
    const handed = readHanded()
    const noted = unfiled.filter((s) => s.hint && !handed.has(s.id))
    if (!noted.length) return
    noted.forEach((s) => handed.add(s.id))
    writeHanded(handed)
    const ctx = { ...live.current, inbox }
    const context = noted.map((spend) => spendContext(spend, ctx)).join('\n')
    const what = plural(noted.length, 'noted payment')
    askAgent(`File my ${what}`, { context: `${context}\nFile each with propose_file_spend, following my note.`, chip: what })
    toast(`Munshi is drafting ${plural(noted.length, 'noted spend')}…`, { tone: 'lilac' })
  }, [ready, hasPass, unfiled, inbox, askAgent, toast])

  return null
}

/** The Android app around the shared Gullak screens: captured payments, native sharing and updates. */
export default function AppShell({ children }) {
  const inbox = useInboxState()
  const update = useUpdateCheck()
  useNativeChrome()

  const value = useMemo(
    () => ({
      native: NATIVE,
      inbox,
      update,
      slots: SLOTS,
      sheets: SHEETS,
      saveFile: NATIVE ? shareFile : null,
      shareText: NATIVE ? shareText : null,
    }),
    [inbox, update],
  )

  return (
    <AppContext.Provider value={value}>
      {children}
      <InboxEffects inbox={inbox} />
    </AppContext.Provider>
  )
}
