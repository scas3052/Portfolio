import { useState } from 'react'
import { LuEye, LuEyeOff, LuLock, LuMoon, LuSearch, LuSun } from 'react-icons/lu'
import { useActions } from '../../hooks/useActions'
import { currentHour, formatDay, greeting } from '../../lib/dates'
import { MOD_KEY } from '../../lib/dom'
import { viewMeta } from '../../lib/router'
import { useFinance, useUi } from '../../store/contexts'
import SyncBadge from '../cloud/SyncBadge'
import Brand from './Brand'
import MonthSwitcher from './MonthSwitcher'

// Keyed by today, so the greeting is re-read once a day rather than on every render.
function Greeting({ name, today }) {
  const [hour] = useState(currentHour)
  return (
    <div className="g-greet">
      <p className="g-greet__hello">
        {greeting(hour)}
        {name && <span className="g-greet__name">, {name}</span>}
      </p>
      <p className="g-greet__date">{formatDay(today, { year: true })}</p>
    </div>
  )
}

export default function Topbar({ view }) {
  const { state, today } = useFinance()
  const ui = useUi()
  const { lockNow } = useActions()
  const meta = viewMeta(view)
  const ink = ui.theme === 'ink'

  return (
    <header className="g-top">
      <div className="g-top__lead">
        <Brand compact className="g-top__brand" />
        <Greeting key={today} name={state.settings.name} today={today} />
      </div>

      {meta.month && <MonthSwitcher />}

      <div className="g-top__tools">
        <button
          type="button"
          className="g-search g-press"
          onClick={() => ui.setPaletteOpen(true)}
          aria-label="Search entries and commands"
          aria-keyshortcuts="Control+K Meta+K /"
        >
          <LuSearch aria-hidden="true" />
          <span className="g-search__text" aria-hidden="true">
            Search…
          </span>
          <kbd className="g-kbd" aria-hidden="true">
            {MOD_KEY} K
          </kbd>
        </button>
        <SyncBadge />
        <button
          type="button"
          className="g-icon-btn g-press"
          onClick={ui.togglePrivacy}
          aria-pressed={ui.privacy}
          aria-label="Hide amounts"
          aria-keyshortcuts="H"
          title="Hide amounts (H)"
        >
          {ui.privacy ? <LuEyeOff aria-hidden="true" /> : <LuEye aria-hidden="true" />}
        </button>
        <button
          type="button"
          className="g-icon-btn g-press"
          onClick={ui.toggleTheme}
          aria-label={ink ? 'Switch to paper theme' : 'Switch to ink theme'}
          aria-keyshortcuts="T"
          title="Theme (T)"
        >
          {ink ? <LuSun aria-hidden="true" /> : <LuMoon aria-hidden="true" />}
        </button>
        {state.settings.pinHash && (
          <button
            type="button"
            className="g-icon-btn g-press"
            onClick={lockNow}
            aria-label="Lock Gullak"
            aria-keyshortcuts="L"
            title="Lock (L)"
          >
            <LuLock aria-hidden="true" />
          </button>
        )}
      </div>
    </header>
  )
}
