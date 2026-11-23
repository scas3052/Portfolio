// Captured payments in the app: the list from the phone, permission status, and the actions that file,
// dismiss and restore them. The phone's SQLite store stays the source of truth; this mirrors it and updates
// optimistically so cards move the moment you tap.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { loadCapture } from './bridge'
import { normalizeSpend } from './enrich'
import { readRules, subscribeRules, updateRules, withAlias, withoutRule, withRule } from './rules'

/** Fired by the app shell when Gullak comes back to the foreground. */
export const RESUME_EVENT = 'gullak:resume'

const warn = (err) => console.warn('Gullak payment capture:', err)

export function useInboxState() {
  const [capture, setCapture] = useState(undefined)
  const [status, setStatus] = useState(null)
  const [spends, setSpends] = useState([])
  const [opening, setOpening] = useState(null)
  const book = useSyncExternalStore(subscribeRules, readRules, readRules)
  const plugin = useRef(null)
  const current = useRef([])

  useLayoutEffect(() => {
    current.current = spends
  })

  useEffect(() => {
    let alive = true
    loadCapture().then(
      (loaded) => alive && setCapture(loaded?.plugin || null),
      (err) => {
        warn(err)
        if (alive) setCapture(null)
      },
    )
    return () => {
      alive = false
    }
  }, [])

  const call = useCallback(async (method, args) => {
    const target = plugin.current
    if (!target || typeof target[method] !== 'function') return null
    try {
      return await target[method](args)
    } catch (err) {
      warn(err)
      return null
    }
  }, [])

  const refresh = useCallback(async () => {
    const [nextStatus, listed] = await Promise.all([call('getStatus'), call('list')])
    if (nextStatus) setStatus(nextStatus)
    if (listed) setSpends((listed.spends || []).map(normalizeSpend).filter(Boolean))
  }, [call])

  /** Catches up on the SMS inbox. `days` picks the first look-back (0, 7 or 30); omit it afterwards. */
  const scan = useCallback(
    async (days) => {
      const result = await call('scanInbox', days == null ? {} : { days })
      await refresh()
      return result
    },
    [call, refresh],
  )

  useEffect(() => {
    if (!capture) return undefined
    plugin.current = capture
    let alive = true
    const handles = []
    const listen = (event, fn) =>
      Promise.resolve(capture.addListener(event, fn)).then(
        (handle) => (alive ? handles.push(handle) : handle?.remove?.()),
        warn,
      )
    listen('changed', () => void refresh())
    // A payment notification or a share opened Gullak on this spend.
    listen('openSpend', (data) => {
      if (data?.id) setOpening({ id: String(data.id), at: Date.now() })
    })
    // Catch up on the SMS inbox now (queued: the list updates once the phone answers) and whenever Gullak
    // comes back to the foreground.
    const onBack = () => void scan()
    queueMicrotask(onBack)
    const onVisible = () => {
      if (document.visibilityState === 'visible') onBack()
    }
    window.addEventListener(RESUME_EVENT, onBack)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      handles.forEach((handle) => handle?.remove?.())
      window.removeEventListener(RESUME_EVENT, onBack)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [capture, refresh, scan])

  const patch = useCallback((id, change) => setSpends((list) => list.map((s) => (s.id === id ? { ...s, ...change } : s))), [])

  const markFiled = useCallback(
    (id, entryIds = []) => {
      patch(id, { status: 'filed', entryIds, closedAt: Date.now(), hasOriginal: false })
      void call('markFiled', { id, entryIds })
    },
    [patch, call],
  )
  const dismiss = useCallback(
    (id) => {
      patch(id, { status: 'dismissed', closedAt: Date.now(), hasOriginal: false })
      void call('dismiss', { id })
    },
    [patch, call],
  )
  const restore = useCallback(
    (id) => {
      patch(id, { status: 'unfiled', entryIds: [], closedAt: 0 })
      void call('restore', { id })
    },
    [patch, call],
  )
  const setHint = useCallback(
    (id, hint) => {
      patch(id, { hint: String(hint || '').trim() || null, hintAt: Date.now() })
      void call('setHint', { id, hint: String(hint || '') })
    },
    [patch, call],
  )

  /** Teaches a rule and returns the one it replaced (for Undo). */
  const learn = useCallback((key, rule) => {
    const previous = readRules().rules[key] || null
    updateRules((b) => withRule(b, key, rule))
    return previous
  }, [])
  const setRule = useCallback((key, rule) => updateRules((b) => (rule ? withRule(b, key, rule) : withoutRule(b, key))), [])
  const setAlias = useCallback((digits, accountId) => updateRules((b) => withAlias(b, digits, accountId)), [])
  const find = useCallback((id) => current.current.find((s) => s.id === id) || null, [])

  const withStatus = useCallback(
    async (method, args) => {
      const next = await call(method, args)
      if (next && typeof next === 'object' && 'sms' in next) setStatus(next)
      return next
    },
    [call],
  )
  const requestSms = useCallback(() => withStatus('requestSms').then(() => scan()), [withStatus, scan])
  const requestNotifications = useCallback(() => withStatus('requestNotifications'), [withStatus])
  const setPrefs = useCallback((prefs) => withStatus('setPrefs', prefs), [withStatus])
  const openListenerSettings = useCallback(() => call('openListenerSettings'), [call])
  const openAppSettings = useCallback(() => call('openAppSettings'), [call])
  const getOriginal = useCallback(async (id) => (await call('getOriginal', { id }))?.messages || [], [call])
  const clearOpening = useCallback(() => setOpening(null), [])

  const unfiled = useMemo(() => spends.filter((s) => s.status === 'unfiled').sort((a, b) => b.at - a.at), [spends])

  return useMemo(
    () => ({
      available: Boolean(capture),
      loading: capture === undefined,
      mock: Boolean(status?.mock),
      status,
      spends,
      unfiled,
      book,
      opening,
      clearOpening,
      refresh,
      scan,
      requestSms,
      requestNotifications,
      openListenerSettings,
      openAppSettings,
      setPrefs,
      getOriginal,
      markFiled,
      dismiss,
      restore,
      setHint,
      learn,
      setRule,
      setAlias,
      find,
    }),
    [
      capture,
      status,
      spends,
      unfiled,
      book,
      opening,
      clearOpening,
      refresh,
      scan,
      requestSms,
      requestNotifications,
      openListenerSettings,
      openAppSettings,
      setPrefs,
      getOriginal,
      markFiled,
      dismiss,
      restore,
      setHint,
      learn,
      setRule,
      setAlias,
      find,
    ],
  )
}
