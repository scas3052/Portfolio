import { MotionConfig } from 'motion/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/manrope'
import '@fontsource-variable/geist-mono'
import '../styles/tokens.css'
import '../styles/base.css'
import '../styles/layout.css'
import '../styles/components.css'
import '../styles/overlays.css'
import '../styles/views.css'
import '../styles/agent.css'
import '../styles/sync.css'
import '../inbox/inbox.css'
import './app.css'
import FinanceApp from '../FinanceApp.jsx'
import AppShell from './AppShell.jsx'
import { nativeAuth } from './nativeAuth'
import { isNativeApp } from './platform'

// Gullak as an Android app (and its browser preview, npm run dev:app): the same book, plus the app shell.
const APP = { Shell: AppShell, nativeAuth: isNativeApp() ? nativeAuth : null }

createRoot(document.getElementById('gullak-root')).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <FinanceApp app={APP} />
    </MotionConfig>
  </StrictMode>,
)
