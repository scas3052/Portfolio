import { useState } from 'react'
import {
  LuBell,
  LuCircleCheck,
  LuInfo,
  LuMessageSquareText,
  LuPause,
  LuRefreshCw,
  LuShieldAlert,
  LuSmartphone,
  LuTrash2,
} from 'react-icons/lu'
import { Segmented } from '../components/bits'
import { categoryMeta, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../lib/categories'
import { cx } from '../lib/cx'
import { plural } from '../lib/format'
import { useApp, useFinance, useUi } from '../store/contexts'

const SOURCE_ROWS = [
  ['sms', 'Bank SMS', 'Debits and credits your banks text you'],
  ['gpay', 'Google Pay', 'Payment notifications from GPay'],
  ['phonepe', 'PhonePe', 'Payment notifications from PhonePe'],
  ['paytm', 'Paytm', 'Payment notifications from Paytm'],
]

const LOOKBACK = [
  { value: '0', label: 'None' },
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
]

const RULES_SHOWN = 12

function Switch({ on, label, onToggle, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={cx('g-switch', on && 'is-on')} onClick={onToggle} disabled={disabled}>
      <span className="g-switch__knob" aria-hidden="true" />
    </button>
  )
}

function Step({ done, icon: Icon, title, body, children }) {
  return (
    <li className={cx('g-capture__step', done && 'is-done')}>
      <span className="g-capture__mark" aria-hidden="true">
        {done ? <LuCircleCheck /> : <Icon />}
      </span>
      <span className="g-capture__what">
        <strong>{title}</strong>
        <small>{body}</small>
      </span>
      {done ? <span className="g-capture__ok">On</span> : children}
      <span className="sr-only">{done ? '(done)' : '(to do)'}</span>
    </li>
  )
}

/** Settings → Payment capture (Android app): what Gullak may read, how far back, and what it has learned. */
export default function CaptureSettings() {
  const inbox = useApp()?.inbox
  const { state } = useFinance()
  const ui = useUi()
  const [showAll, setShowAll] = useState(false)
  const [scanning, setScanning] = useState(false)
  if (!inbox) return null

  if (!inbox.available) {
    return (
      <p className="g-settings__note">
        Payment capture runs in the Gullak app on an Android phone, where it can read bank SMS and UPI app notifications.
      </p>
    )
  }
  const status = inbox.status
  if (!status) return <p className="g-settings__note">Checking what Gullak is allowed to read…</p>

  const smsOn = status.sms === 'granted'
  const smsRefused = status.sms === 'denied'
  const notifyOn = status.notifications === 'granted'
  const restricted = status.sdk >= 33 && (!smsOn || !status.listener)

  const scanFrom = async (value) => {
    setScanning(true)
    try {
      const result = await inbox.scan(Number(value))
      const added = result?.added || 0
      ui.toast(added ? `Found ${plural(added, 'payment')} to file` : 'No missed payments found', { tone: 'lime' })
    } finally {
      setScanning(false)
    }
  }

  const rules = Object.entries(inbox.book.rules).sort(([, a], [, b]) => b.uses - a.uses || b.at - a.at)
  const shownRules = showAll ? rules : rules.slice(0, RULES_SHOWN)
  const aliases = Object.entries(inbox.book.aliases)
  const accountName = (id) => state.accounts.find((a) => a.id === id)?.name || 'Removed account'

  return (
    <div className="g-capture">
      <p className="g-settings__note">
        Gullak catches payments from bank SMS and UPI apps and keeps them as <strong>unfiled spends</strong>. Nothing goes
        into your book until you say what each one was for.
      </p>

      <ol className="g-capture__steps">
        <Step done={smsOn} icon={LuMessageSquareText} title="Read bank SMS" body="Only messages from bank sender ids; personal texts and OTPs are skipped.">
          {smsRefused ? (
            <button type="button" className="g-btn g-btn--sm g-press" onClick={inbox.openAppSettings}>
              Open App info
            </button>
          ) : (
            <button type="button" className="g-btn g-btn--sm g-btn--ink g-press" onClick={inbox.requestSms}>
              Allow
            </button>
          )}
        </Step>
        <Step
          done={status.listener}
          icon={LuSmartphone}
          title="Read GPay, PhonePe and Paytm alerts"
          body="Notification access. Gullak ignores every other app."
        >
          <button type="button" className="g-btn g-btn--sm g-btn--ink g-press" onClick={inbox.openListenerSettings}>
            Turn on
          </button>
        </Step>
        <Step done={notifyOn} icon={LuBell} title="Ask me after each payment" body="“₹500 at Swiggy, what was it for?” with a Reply box.">
          <button type="button" className="g-btn g-btn--sm g-btn--ink g-press" onClick={inbox.requestNotifications}>
            Allow
          </button>
        </Step>
      </ol>

      {restricted && (
        <div className="g-callout g-capture__help" role="note">
          <LuShieldAlert aria-hidden="true" />
          <span>
            <strong>Greyed out, or “Restricted setting”?</strong> Android blocks these for apps installed from Chrome until you
            allow them: open <strong>App info → ⋮ → Allow restricted settings</strong>, then come back and try again.{' '}
            <button type="button" className="g-link" onClick={inbox.openAppSettings}>
              Open App info
            </button>
          </span>
        </div>
      )}

      {smsOn && !status.lookbackSet && (
        <div className="g-settings__row">
          <span className="g-settings__label">
            Catch up on earlier payments?
            <small>Reads your SMS inbox once for payments from before today.</small>
          </span>
          <Segmented label="Look back" size="sm" value="" onChange={scanFrom} options={LOOKBACK} />
        </div>
      )}

      <div className="g-capture__sources" role="group" aria-label="What to read">
        {SOURCE_ROWS.map(([id, label, hint]) => (
          <div key={id} className="g-settings__row">
            <span className="g-settings__label">
              {label}
              <small>{hint}</small>
            </span>
            <Switch
              on={status.sources?.[id] !== false}
              label={label}
              disabled={status.paused}
              onToggle={() => inbox.setPrefs({ sources: { [id]: status.sources?.[id] === false } })}
            />
          </div>
        ))}
        <div className="g-settings__row">
          <span className="g-settings__label">
            <span>
              <LuPause aria-hidden="true" /> Pause capture
            </span>
            <small>Stops reading new messages. Payments already caught stay here.</small>
          </span>
          <Switch on={Boolean(status.paused)} label="Pause capture" onToggle={() => inbox.setPrefs({ paused: !status.paused })} />
        </div>
      </div>

      {smsOn && status.lookbackSet && (
        <div className="g-settings__actions">
          <button type="button" className="g-btn g-btn--sm g-press" disabled={scanning} onClick={() => scanFrom(7)}>
            <LuRefreshCw aria-hidden="true" /> Check the last 7 days again
          </button>
        </div>
      )}

      {(rules.length > 0 || aliases.length > 0) && (
        <div className="g-capture__learned">
          <h3 className="g-capture__title">What Gullak has learned</h3>
          <ul className="g-capture__rules">
            {shownRules.map(([key, rule]) => {
              const list = rule.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
              return (
                <li key={key} className="g-capture__rule">
                  <span className="g-capture__payee">{rule.label || key}</span>
                  <select
                    className="g-input g-select"
                    aria-label={`Category for ${rule.label || key}`}
                    value={rule.category}
                    onChange={(event) => inbox.setRule(key, { ...rule, category: event.target.value })}
                  >
                    {list.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="g-icon-btn g-press"
                    aria-label={`Forget ${rule.label || key}`}
                    onClick={() => {
                      inbox.setRule(key, null)
                      ui.toast(`Forgot ${rule.label || key} (was ${categoryMeta(rule.category).short})`, {
                        tone: 'gray',
                        action: { label: 'Undo', run: () => inbox.setRule(key, rule) },
                      })
                    }}
                  >
                    <LuTrash2 aria-hidden="true" />
                  </button>
                </li>
              )
            })}
            {aliases.map(([digits, accountId]) => (
              <li key={`alias-${digits}`} className="g-capture__rule">
                <span className="g-capture__payee">••{digits}</span>
                <span className="g-capture__is">is {accountName(accountId)}</span>
                <button type="button" className="g-icon-btn g-press" aria-label={`Forget ••${digits}`} onClick={() => inbox.setAlias(digits, null)}>
                  <LuTrash2 aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          {rules.length > RULES_SHOWN && (
            <button type="button" className="g-link" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show fewer' : `Show all ${rules.length}`}
            </button>
          )}
        </div>
      )}

      <p className="g-settings__fine">
        <LuInfo aria-hidden="true" /> Message text stays on this phone and is deleted once a payment is filed. Munshi only sees
        the amount, payee, account and your notes. Rules live on this phone only.
        {status.lastScanAt > 0 && ` Last checked ${new Date(status.lastScanAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}.`}
        {inbox.mock && ' (Browser preview with sample payments.)'}
      </p>
    </div>
  )
}

