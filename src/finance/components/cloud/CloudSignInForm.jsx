import { useEffect } from 'react'
import { FcGoogle } from 'react-icons/fc'
import { LuKeyRound, LuLoaderCircle, LuMerge, LuRotateCw, LuShieldCheck, LuWifiOff } from 'react-icons/lu'
import { linkingWords } from '../../cloud/describe'
import { onThisDevice } from '../../lib/where'
import { useCloud } from '../../store/contexts'

const POINTS = [
  { icon: LuShieldCheck, text: 'Private: the cloud only opens for the owner’s Google account.' },
  { icon: LuMerge, text: 'If this device and the cloud both have a book, you choose what to keep.' },
  { icon: LuKeyRound, text: 'Your PIN travels with the book, so every device asks for it.' },
  { icon: LuWifiOff, text: 'Works offline too. Changes wait here and sync when you’re back.' },
]

function GoButton({ cloud, busy }) {
  if (busy) {
    return (
      <button type="button" className="g-btn g-btn--ink g-sync-google" disabled>
        <LuLoaderCircle className="g-sync-spin" aria-hidden="true" /> {busy}
      </button>
    )
  }
  if (cloud.sdk === 'failed') {
    return (
      <button type="button" className="g-btn g-btn--ink g-press g-sync-google" onClick={cloud.prepare}>
        <LuRotateCw aria-hidden="true" /> Try again
      </button>
    )
  }
  if (cloud.sdk !== 'ready') {
    return (
      <button type="button" className="g-btn g-btn--ink g-sync-google" disabled>
        <LuLoaderCircle className="g-sync-spin" aria-hidden="true" /> Getting ready…
      </button>
    )
  }
  return (
    // startLink opens Google's popup, so it has to run straight from the click.
    <button type="button" className="g-btn g-btn--ink g-press g-sync-google" onClick={() => void cloud.startLink()}>
      <span className="g-sync-google__g" aria-hidden="true">
        <FcGoogle />
      </span>
      {cloud.linked ? 'Sign in again' : 'Continue with Google'}
    </button>
  )
}

/** Turns on cloud sync with a Google account, or signs a syncing device back in. */
export default function CloudSignInForm({ onDone }) {
  const cloud = useCloud()
  const { prepare } = cloud
  const busy = linkingWords(cloud.linking)

  // Firebase loads while the sheet is open, so the click can go straight to Google's popup.
  useEffect(() => {
    prepare()
  }, [prepare])

  if (!cloud.available) {
    return (
      <div className="g-form g-sync-signin">
        <p className="g-form__note">This copy of Gullak isn’t connected to a cloud, so your book stays {onThisDevice()}.</p>
        <div className="g-form__actions">
          <button type="button" className="g-btn g-btn--ghost g-press" onClick={onDone}>
            Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="g-form g-sync-signin">
      {cloud.linked ? (
        <p className="g-form__note">
          This device syncs with <strong>{cloud.email || 'your Google account'}</strong>. Sign in with that account to
          carry on. Anything you changed in the meantime is kept and syncs too.
        </p>
      ) : (
        <>
          <p className="g-sync-signin__lead">
            Sign in with Google and Gullak shows the same book on your phone, your laptop and any browser you use.
          </p>
          <ul className="g-sync-points">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text}>
                <span className="g-sync-points__icon" aria-hidden="true">
                  <Icon />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="g-sync-signin__go">
        <GoButton cloud={cloud} busy={busy} />
        {cloud.sdk === 'failed' && !busy && (
          <p className="g-field__error" role="alert">
            Google sign-in didn’t load. Check your connection and try again.
          </p>
        )}
        {cloud.notice && (
          <p className="g-field__error" role="alert">
            {cloud.notice}
          </p>
        )}
        <p className="sr-only" role="status">
          {busy || ''}
        </p>
      </div>

      {!cloud.linked && (
        <p className="g-form__foot">
          The book is kept in this site’s own Firebase project, and only the owner can open it. Gullak never sees your
          Google password.
        </p>
      )}

      <div className="g-form__actions">
        <button type="button" className="g-btn g-btn--ghost g-press" onClick={onDone}>
          Not now
        </button>
      </div>
    </div>
  )
}
