import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { clearChat } from '../agent/agentConfig'
import { cloudAvailable, firebaseConfig } from '../cloud/config'
import { createCloudController } from '../cloud/controller'
import { CloudContext, useFinance, useUi } from './contexts'

// The Firebase SDK is a separate chunk that only loads once sync is in use.
const loadApi = () => import('../cloud/firebase').then((module) => module.connect(firebaseConfig))

/** Cloud sync: links this browser to a Google account and keeps its book in step with the cloud. */
export default function CloudProvider({ children }) {
  const { bridge, dispatch } = useFinance()
  const { sheet, openSheet, closeSheet, toast, unlock, setAgentOpen } = useUi()
  const [controller] = useState(() => createCloudController({ available: cloudAvailable, loadApi, bridge, dispatch }))
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)

  useEffect(() => {
    controller.setUi({
      openSheet,
      closeSheet,
      toast,
      unlock,
      forgetDevice: () => {
        setAgentOpen(false)
        clearChat()
      },
    })
  }, [controller, openSheet, closeSheet, toast, unlock, setAgentOpen])

  const sheetKind = sheet?.kind ?? null
  const sheetKey = sheet?.key ?? null
  useEffect(() => {
    controller.noteSheet(sheetKind)
  }, [controller, sheetKind, sheetKey])

  useEffect(() => {
    const stop = controller.start()
    const onStorage = (event) => controller.noteStorage(event.key)
    // Edits still waiting for their debounce go out before the page is put away.
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') controller.flush()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('online', controller.noteOnline)
    window.addEventListener('pagehide', controller.flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('online', controller.noteOnline)
      window.removeEventListener('pagehide', controller.flush)
      document.removeEventListener('visibilitychange', onVisibility)
      stop()
    }
  }, [controller])

  const value = useMemo(() => ({ ...snapshot, ...controller.actions }), [snapshot, controller])

  return <CloudContext.Provider value={value}>{children}</CloudContext.Provider>
}
