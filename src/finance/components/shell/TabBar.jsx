import { LuEllipsis, LuPlus } from 'react-icons/lu'
import { useActions } from '../../hooks/useActions'
import { cx, toneVar } from '../../lib/cx'
import { hrefFor, viewMeta } from '../../lib/router'
import { useUi } from '../../store/contexts'

const TABS = ['overview', 'activity', 'accounts']

function Tab({ id, active }) {
  const meta = viewMeta(id)
  const Icon = meta.icon
  return (
    <a
      href={hrefFor(id)}
      className={cx('g-tab', active && 'is-active')}
      aria-current={active ? 'page' : undefined}
      style={toneVar(meta.tone)}
    >
      <span className="g-tab__icon">
        <Icon aria-hidden="true" />
      </span>
      <span className="g-tab__label">{meta.short}</span>
    </a>
  )
}

/** Phone and tablet navigation pinned to the bottom, with the add button in the middle. */
export default function TabBar({ view }) {
  const { addEntry } = useActions()
  const { openSheet } = useUi()
  const inTabs = TABS.includes(view)
  const current = viewMeta(view)
  const MoreIcon = inTabs ? LuEllipsis : current.icon

  return (
    <nav className="g-tabs" aria-label="Sections">
      <Tab id="overview" active={view === 'overview'} />
      <Tab id="activity" active={view === 'activity'} />
      <button
        type="button"
        className="g-tabs__fab g-press"
        onClick={() => addEntry({ type: 'expense' })}
        aria-label="Add entry"
      >
        <LuPlus aria-hidden="true" />
      </button>
      <Tab id="accounts" active={view === 'accounts'} />
      <button
        type="button"
        className={cx('g-tab', !inTabs && 'is-active')}
        style={toneVar(inTabs ? 'tan' : current.tone)}
        onClick={() => openSheet('more')}
        aria-haspopup="dialog"
        aria-label={inTabs ? 'More sections' : `${current.label}. More sections`}
      >
        <span className="g-tab__icon">
          <MoreIcon aria-hidden="true" />
        </span>
        <span className="g-tab__label" aria-hidden="true">
          {inTabs ? 'More' : current.short}
        </span>
      </button>
    </nav>
  )
}
