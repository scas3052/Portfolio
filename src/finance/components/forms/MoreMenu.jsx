import { LuEye, LuEyeOff, LuInbox, LuKeyboard, LuKeyRound, LuLock, LuMoon, LuSearch, LuSun, LuUndo2 } from 'react-icons/lu'
import { useActions } from '../../hooks/useActions'
import { TYPE_META } from '../../lib/categories'
import { cx, toneVar } from '../../lib/cx'
import { hrefFor, useHashRoute, VIEWS } from '../../lib/router'
import { useApp, useFinance, useUi } from '../../store/contexts'

const QUICK = [
  { type: 'expense', label: 'Spend' },
  { type: 'income', label: 'Income' },
  { type: 'emi', label: 'EMI' },
  { type: 'lend', label: 'Lend' },
  { type: 'borrow', label: 'Borrow' },
  { type: 'transfer', label: 'Transfer' },
]

/** The phone "More" tab: every section, quick adds and the odd utilities in one sheet. */
export default function MoreMenu({ onDone }) {
  const { state } = useFinance()
  const ui = useUi()
  const { addEntry, lockNow, goPortfolio } = useActions()
  const { view } = useHashRoute()
  const app = useApp()
  const ink = ui.theme === 'ink'
  const hasPin = Boolean(state.settings.pinHash)

  const tools = [
    {
      id: 'search',
      label: 'Search',
      icon: LuSearch,
      run: () => {
        onDone()
        ui.setPaletteOpen(true)
      },
    },
    {
      id: 'privacy',
      label: ui.privacy ? 'Show amounts' : 'Hide amounts',
      icon: ui.privacy ? LuEye : LuEyeOff,
      pressed: ui.privacy,
      run: ui.togglePrivacy,
    },
    {
      id: 'theme',
      label: ink ? 'Paper theme' : 'Ink theme',
      icon: ink ? LuSun : LuMoon,
      run: () => {
        onDone()
        ui.toggleTheme()
      },
    },
    hasPin
      ? { id: 'lock', label: 'Lock now', icon: LuLock, run: lockNow }
      : { id: 'pin', label: 'Set a PIN', icon: LuKeyRound, run: () => ui.openSheet('pin') },
    app
      ? { id: 'inbox', label: 'Unfiled spends', icon: LuInbox, run: () => ui.openSheet('inbox') }
      : { id: 'keys', label: 'Shortcuts', icon: LuKeyboard, run: () => ui.openSheet('shortcuts') },
  ]

  return (
    <div className="g-more">
      <nav aria-label="All sections">
        <ul className="g-more__views">
          {VIEWS.map((item, index) => {
            const Icon = item.icon
            const active = item.id === view
            return (
              <li key={item.id} style={{ '--i': index }}>
                <a
                  href={hrefFor(item.id)}
                  className={cx('g-more__view g-press', active && 'is-active')}
                  style={toneVar(item.tone)}
                  aria-current={active ? 'page' : undefined}
                  onClick={onDone}
                >
                  <span className="g-more__icon" aria-hidden="true">
                    <Icon />
                  </span>
                  <span className="g-more__label">{item.label}</span>
                </a>
              </li>
            )
          })}
        </ul>
      </nav>

      <section className="g-more__group" aria-label="Quick add">
        <p className="g-kicker">Quick add</p>
        <div className="g-more__quick">
          {QUICK.map(({ type, label }) => {
            const meta = TYPE_META[type]
            const Icon = meta.icon
            return (
              <button
                key={type}
                type="button"
                className="g-more__add g-press"
                style={toneVar(meta.tone)}
                onClick={() => addEntry({ type })}
              >
                <Icon aria-hidden="true" />
                {label}
              </button>
            )
          })}
        </div>
      </section>

      <section className="g-more__group" aria-label="Tools">
        <p className="g-kicker">Tools</p>
        <div className="g-more__tools">
          {tools.map((tool) => {
            const Icon = tool.icon
            return (
              <button
                key={tool.id}
                type="button"
                className="g-more__tool g-press"
                aria-pressed={tool.pressed}
                onClick={tool.run}
              >
                <Icon aria-hidden="true" />
                <span>{tool.label}</span>
              </button>
            )
          })}
        </div>
      </section>

      {!app && (
        <button
          type="button"
          className="g-more__back"
          onClick={() => {
            onDone()
            goPortfolio()
          }}
        >
          <LuUndo2 aria-hidden="true" />
          Back to the portfolio
        </button>
      )}
    </div>
  )
}
