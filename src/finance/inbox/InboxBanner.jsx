import { LuArrowRight, LuDownload, LuSmartphoneNfc } from 'react-icons/lu'
import { plural } from '../lib/format'
import { navigate } from '../lib/router'
import { useApp, useUi } from '../store/contexts'

/** Home notes in the app: an update to install, unfiled spends to file, or capture still to switch on. */
export default function InboxBanner() {
  const app = useApp()
  const { openSheet } = useUi()
  const inbox = app?.inbox
  if (!inbox) return null
  const { update } = app
  const count = inbox.unfiled.length
  const noted = inbox.unfiled.filter((s) => s.hint).length
  const status = inbox.status
  const switchedOn = status && (status.sms === 'granted' || status.listener)
  const showSetup = inbox.available && status && !switchedOn && !status.paused
  const link = update?.link

  if (!count && !showSetup && !(update?.available && link)) return null

  return (
    <div className="g-inbox-notes">
      {update?.available && link && (
        <a className="g-inbox-note g-inbox-note--update g-press" href={link} target="_blank" rel="noopener noreferrer">
          <LuDownload className="g-inbox-note__icon" aria-hidden="true" />
          <span className="g-inbox-note__text">
            <strong>Update available</strong> · Gullak {update.latest?.versionName}. Tap to download it in Chrome; your book stays.
          </span>
          <LuArrowRight className="g-inbox-note__go" aria-hidden="true" />
        </a>
      )}
      {count > 0 && (
        <button type="button" className="g-inbox-note g-press" onClick={() => openSheet('inbox')}>
          <span className="g-inbox-note__count" aria-hidden="true">
            {count > 99 ? '99+' : count}
          </span>
          <span className="g-inbox-note__text">
            <strong>{plural(count, 'unfiled spend')}</strong> · tap to file{noted > 0 && ` · ${noted} with your notes`}
          </span>
          <LuArrowRight className="g-inbox-note__go" aria-hidden="true" />
        </button>
      )}
      {!count && showSetup && (
        <button type="button" className="g-inbox-note g-inbox-note--setup g-press" onClick={() => navigate('settings', { focus: 'capture' })}>
          <LuSmartphoneNfc className="g-inbox-note__icon" aria-hidden="true" />
          <span className="g-inbox-note__text">
            <strong>Catch payments automatically.</strong> Gullak can read bank SMS and UPI app alerts, then ask what each
            payment was for.
          </span>
          <LuArrowRight className="g-inbox-note__go" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
