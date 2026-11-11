import { useEffect, useState } from 'react'
import { FcGoogle } from 'react-icons/fc'
import { LuCloudUpload, LuLoaderCircle, LuLogOut, LuRefreshCw, LuRotateCw } from 'react-icons/lu'
import { describeSync, linkingWords, syncedAgo } from '../../cloud/describe'
import { cx, toneVar } from '../../lib/cx'
import { plural } from '../../lib/format'
import { useCloud, useUi } from '../../store/contexts'

function GoogleG() {
  return (
    <span className="g-sync-google__g" aria-hidden="true">
      <FcGoogle />
    </span>
  )
}

/** The current time, refreshed every half minute so "synced 3 min ago" stays true. */
function useNow(every = 30_000) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), every)
    return () => clearInterval(timer)
  }, [every])
  return now
}

/** The "Sync" group in Settings: where the book syncs, how it's going, and the one fix that helps. */
export default function SyncSettings() {
  const cloud = useCloud()
  const ui = useUi()
  const now = useNow()
  const sync = describeSync(cloud, now)
  const busy = linkingWords(cloud.linking)
  const working = Boolean(cloud.linking)

  const fixes = {
    signIn: {
      label: cloud.linked ? 'Sign in again' : 'Turn on sync',
      icon: GoogleG,
      run: () => ui.openSheet('cloudSignIn'),
    },
    retry: { label: 'Try again', icon: LuRotateCw, run: cloud.retry },
    reupload: { label: 'Upload this device’s book', icon: LuCloudUpload, run: () => void cloud.reupload() },
    reload: { label: 'Reload Gullak', icon: LuRefreshCw, run: () => window.location.reload() },
  }
  const fix = sync.action ? fixes[sync.action] : null

  return (
    <>
      <div className="g-sync-set__head">
        <span className={cx('g-sync-set__state', `is-${sync.mood}`)} style={toneVar(sync.tone)}>
          {sync.mood === 'busy' ? (
            <LuLoaderCircle className="g-sync-spin" aria-hidden="true" />
          ) : (
            <span className="g-sync-set__dot" aria-hidden="true" />
          )}
          {sync.label}
        </span>
        {busy && sync.mood !== 'busy' && (
          <span className="g-sync-set__busy" role="status">
            <LuLoaderCircle className="g-sync-spin" aria-hidden="true" /> {busy}
          </span>
        )}
      </div>

      <p className="g-settings__note">{sync.line}</p>

      {cloud.linked && (
        <dl className="g-sync-set__facts">
          <div>
            <dt>Account</dt>
            <dd>{cloud.email || 'Your Google account'}</dd>
          </div>
          <div>
            <dt>Last synced</dt>
            <dd>{syncedAgo(cloud.lastSyncedAt, now) ?? 'Not yet'}</dd>
          </div>
          <div>
            <dt>Waiting to send</dt>
            <dd>{cloud.pending ? plural(cloud.pending, 'change') : 'Nothing'}</dd>
          </div>
        </dl>
      )}

      {(fix || cloud.linked) && (
        <div className="g-settings__actions">
          {fix && (
            <button type="button" className="g-btn g-btn--ink g-press" onClick={fix.run} disabled={working}>
              <fix.icon aria-hidden="true" /> {fix.label}
            </button>
          )}
          {cloud.linked && (
            <button
              type="button"
              className="g-btn g-btn--ghost g-press"
              onClick={() => cloud.signOutDevice()}
              disabled={working}
            >
              <LuLogOut aria-hidden="true" /> Sign out of this device
            </button>
          )}
        </div>
      )}

      <p className="g-settings__fine">
        {cloud.linked
          ? 'Entries, accounts, loans, people, goals, budgets, your name and the PIN sync. Hiding amounts stays per device.'
          : 'Uses Google sign-in. The book is kept in this site’s own Firebase project, and only the owner’s account can open it.'}
      </p>
    </>
  )
}
