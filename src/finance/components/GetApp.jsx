import { useEffect, useState } from 'react'
import { LuDownload, LuRefreshCw, LuSmartphone } from 'react-icons/lu'
import { useApp, useUi } from '../store/contexts'

const onAndroid = () => typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '')
const site = () => (typeof window !== 'undefined' ? window.location.origin : '')

function size(bytes) {
  const mb = Number(bytes) / (1024 * 1024)
  return mb > 0 ? `${mb.toFixed(1)} MB` : ''
}

/** "Get the Android app": on the website, in Chrome on an Android phone only. */
export function GetAppButton() {
  const app = useApp()
  const { openSheet } = useUi()
  if (app || !onAndroid()) return null
  return (
    <button type="button" className="g-btn g-btn--ink g-press" onClick={() => openSheet('getApp')}>
      <LuSmartphone aria-hidden="true" /> Get the Android app
    </button>
  )
}

const STEPS = [
  ['Download', 'Tap the button above, then open the file from Chrome’s download bar.'],
  [
    'Let it install',
    'If Play Protect stops it, open Play Store → your profile → Play Protect → ⚙ and pause scanning for a moment. Allow Chrome to install apps when Android asks, then tap Install.',
  ],
  [
    'Allow restricted settings',
    'Settings → Apps → Gullak → ⋮ → Allow restricted settings. Android needs this before Gullak can read bank SMS and payment notifications.',
  ],
  [
    'Sign in and switch on capture',
    'Open Gullak, sign in with the Google account you use here, then Settings → Payment capture.',
  ],
  ['Tidy up', 'Turn Play Protect back on. For Gullak, turn off “Pause app activity if unused” so payment alerts keep coming.'],
]

/** The download and install guide, with the newest build's version and checksum from /api/app. */
export function GetAppSheet({ onDone }) {
  const [info, setInfo] = useState({ state: 'loading', latest: null })

  useEffect(() => {
    let alive = true
    fetch(`${site()}/api/app`, { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then(
        (latest) => alive && setInfo({ state: 'ready', latest }),
        () => alive && setInfo({ state: 'missing', latest: null }),
      )
    return () => {
      alive = false
    }
  }, [])

  const { state, latest } = info
  return (
    <div className="g-form g-getapp">
      <p className="g-form__note">
        Gullak as an app on this phone: payments from bank SMS and UPI apps are caught for you, it asks what each one was for,
        and Munshi helps you file them. Sign in with Google and it shows the same book as this site.
      </p>
      {state === 'missing' ? (
        <p className="g-callout" role="note">
          The app isn’t published from this site yet. Run the “Android app” workflow on GitHub first.
        </p>
      ) : (
        <a
          className="g-btn g-btn--ink g-press g-getapp__download"
          href={`${site()}/api/app?download=1`}
          aria-disabled={state !== 'ready'}
          onClick={(event) => state !== 'ready' && event.preventDefault()}
        >
          <LuDownload aria-hidden="true" />
          {state === 'ready' ? `Download Gullak ${latest.versionName}${latest.size ? ` · ${size(latest.size)}` : ''}` : 'Checking the latest build…'}
        </a>
      )}
      <ol className="g-getapp__steps">
        {STEPS.map(([title, body]) => (
          <li key={title}>
            <strong>{title}.</strong> {body}
          </li>
        ))}
      </ol>
      {latest?.sha256 && (
        <p className="g-settings__fine g-getapp__sum">
          SHA-256 {latest.sha256}
          {latest.publishedAt && ` · published ${new Date(latest.publishedAt).toLocaleDateString()}`}
        </p>
      )}
      <div className="g-form__actions">
        <button type="button" className="g-btn g-btn--ghost g-press" onClick={onDone}>
          Close
        </button>
      </div>
    </div>
  )
}

/** Settings → About in the app: the installed version, and a manual update check. */
export function AppVersion() {
  const app = useApp()
  const { toast } = useUi()
  const update = app?.update
  if (!update) return null
  const installed = update.installed
  const link = update.link

  const check = async () => {
    try {
      const found = await update.recheck()
      if (!found) toast('This build doesn’t know where to look for updates.', { tone: 'butter' })
      else if (!found.available) toast(`You have the latest Gullak (${found.installed.version}).`, { tone: 'mint' })
    } catch {
      toast('Couldn’t check for updates. Are you online?', { tone: 'rose' })
    }
  }

  return (
    <div className="g-settings__row">
      <span className="g-settings__label">
        Gullak {installed ? `${installed.version} (build ${installed.build})` : 'app'}
        <small>{update.available ? `Version ${update.latest?.versionName} is out.` : 'Updates keep your book: same app, same key.'}</small>
      </span>
      {update.available && link ? (
        <a className="g-btn g-btn--ink g-press" href={link} target="_blank" rel="noopener noreferrer">
          <LuDownload aria-hidden="true" /> Download update
        </a>
      ) : (
        <button type="button" className="g-btn g-press" onClick={check} disabled={update.checking}>
          <LuRefreshCw aria-hidden="true" /> Check for updates
        </button>
      )}
    </div>
  )
}
