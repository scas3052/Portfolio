import { LuCloud, LuCloudAlert, LuCloudOff, LuRefreshCw } from 'react-icons/lu'
import { describeSync } from '../../cloud/describe'
import { cx, toneVar } from '../../lib/cx'
import { spotlight } from '../../lib/dom'
import { hrefFor, navigate } from '../../lib/router'
import { useCloud, useUi } from '../../store/contexts'

const ICONS = { off: LuCloudOff, busy: LuRefreshCw, ok: LuCloud, waiting: LuCloudAlert, problem: LuCloudAlert }

/** Top bar button showing the state of cloud sync. Opens sign-in, or the Sync settings once linked. */
export default function SyncBadge() {
  const cloud = useCloud()
  const ui = useUi()
  if (!cloud.available && !cloud.linked) return null

  const sync = describeSync(cloud)
  const Icon = ICONS[sync.mood]
  const label = `Sync: ${sync.label}`

  const open = () => {
    if (!cloud.linked) {
      ui.openSheet('cloudSignIn')
      return
    }
    if (window.location.hash === hrefFor('settings', { focus: 'sync' })) spotlight('g-settings-sync')
    else navigate('settings', { focus: 'sync' })
  }

  return (
    <button
      type="button"
      className={cx('g-icon-btn g-press g-sync-badge', `is-${sync.mood}`)}
      style={toneVar(sync.tone)}
      onClick={open}
      aria-label={label}
      title={label}
    >
      <Icon className={sync.mood === 'busy' ? 'g-sync-spin' : undefined} aria-hidden="true" />
      {cloud.linked && <span className="g-sync-badge__dot" aria-hidden="true" />}
    </button>
  )
}
