import { LuPlus, LuUndo2 } from 'react-icons/lu'
import { useActions } from '../../hooks/useActions'
import { cx, toneVar } from '../../lib/cx'
import { plural } from '../../lib/format'
import { hrefFor, VIEWS } from '../../lib/router'
import { useFinance } from '../../store/contexts'
import Brand from './Brand'

/** Desktop navigation: a strip of index tabs with a highlighter swipe on the active one. */
export default function Sidebar({ view }) {
  const { state } = useFinance()
  const { addEntry, goPortfolio } = useActions()
  const count = state.transactions.length

  return (
    <aside className="g-side">
      <Brand />
      <nav className="g-nav" aria-label="Sections">
        <ul>
          {VIEWS.map((item) => {
            const Icon = item.icon
            const active = item.id === view
            return (
              <li key={item.id}>
                <a
                  href={hrefFor(item.id)}
                  className={cx('g-nav__link', active && 'is-active')}
                  aria-current={active ? 'page' : undefined}
                  aria-keyshortcuts={item.key}
                  style={toneVar(item.tone)}
                >
                  <Icon className="g-nav__icon" aria-hidden="true" />
                  <span className="g-nav__label">{item.label}</span>
                  <kbd className="g-nav__key" aria-hidden="true">
                    {item.key}
                  </kbd>
                </a>
              </li>
            )
          })}
        </ul>
      </nav>

      <button
        type="button"
        className="g-side__add g-press"
        onClick={() => addEntry({ type: 'expense' })}
        aria-keyshortcuts="N"
      >
        <LuPlus aria-hidden="true" />
        Add entry
        <kbd className="g-kbd" aria-hidden="true">
          N
        </kbd>
      </button>

      <div className="g-side__foot">
        <p className="g-side__saved">
          <span key={count} className="g-side__led" aria-hidden="true" />
          Saved on this device · {plural(count, 'entry', 'entries')}
        </p>
        <button type="button" className="g-side__back" onClick={goPortfolio}>
          <LuUndo2 aria-hidden="true" />
          Back to portfolio
        </button>
      </div>
    </aside>
  )
}
