import { MotionConfig } from 'motion/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/manrope'
import '@fontsource-variable/geist-mono'
import './styles/tokens.css'
import './styles/base.css'
import './styles/layout.css'
import './styles/components.css'
import './styles/overlays.css'
import './styles/views.css'
import './styles/agent.css'
import './styles/sync.css'
import FinanceApp from './FinanceApp.jsx'

createRoot(document.getElementById('gullak-root')).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <FinanceApp />
    </MotionConfig>
  </StrictMode>,
)
