import { useSyncExternalStore } from 'react'
import { LuArrowRight, LuDownload, LuQrCode, LuScale, LuSmartphoneNfc } from 'react-icons/lu'
import { plural } from '../lib/format'
import { navigate } from '../lib/router'
import { useApp, useFinance, useUi } from '../store/contexts'
import { dueChecks, readChecks, subscribeChecks } from './balance'

/**
 * Home notes in the app: an update to install, unfiled spends to file, a balance check that's due, or capture
 * still to switch on; and the Scan & Pay button.
 */
export default function InboxBanner() {
  const app = useApp()
  const { openSheet } = useUi()
  const { state, today } = useFinance()
  const checks = useSyncExternalStore(subscribeChecks, readChecks, readChecks)
  const inbox = app?.inbox
  if (!inbox) return null
  const { update } = app
  const count = inbox.unfiled.length
  const noted = inbox.unfiled.filter((s) => s.hint).length
  const status = inbox.status
  const switchedOn = status && (status.sms === 'granted' || status.listener)
  const showSetup = inbox.available && status && !switchedOn && !status.paused
  const due = inbox.available ? dueChecks(checks, state.accounts, today) : []
  const link = update?.link

  if (!inbox.available && !(update?.available && link)) return null

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
      {due.length > 0 && (
        <button type="button" className="g-inbox-note g-inbox-note--balance g-press" onClick={() => openSheet('balance', { accountId: due[0].id })}>
          <LuScale className="g-inbox-note__icon" aria-hidden="true" />
          <span className="g-inbox-note__text">
            <strong>Balance check</strong> · what does {due[0].name} show right now?
            {due.length > 1 && ` ${plural(due.length - 1, 'more account')} after that.`}
          </span>
          <LuArrowRight className="g-inbox-note__go" aria-hidden="true" />
        </button>
      )}
      {!count && showSetup && (
        <button type="button" className="g-inbox-note g-inbox-note--setup g-press" onClick={() => navigate('settings', { focus: 'capture' })}>
          <LuSmartphoneNfc className="g-inbox-note__icon" aria-hidden="true" />
          <span className="g-inbox-note__text">
            <strong>Catch payments automatically.</strong> Gullak can read bank SMS and payment app alerts, then ask what each
            payment was for.
          </span>
          <LuArrowRight className="g-inbox-note__go" aria-hidden="true" />
        </button>
      )}
      {inbox.available && (
        <div className="g-inbox-quick">
          <button type="button" className="g-btn g-btn--sm g-btn--ink g-press" onClick={() => openSheet('scanpay')}>
            <LuQrCode aria-hidden="true" /> Scan &amp; Pay
          </button>
          <span className="g-inbox-quick__hint">Pay any UPI QR and it’s in Gullak straight away.</span>
        </div>
      )}
    </div>
  )
}
