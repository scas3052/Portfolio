import { useState, useSyncExternalStore } from 'react'
import {
  LuBell,
  LuCircleCheck,
  LuFileSpreadsheet,
  LuInfo,
  LuMail,
  LuMessageSquareText,
  LuPause,
  LuPlus,
  LuRefreshCw,
  LuScale,
  LuSearch,
  LuShieldAlert,
  LuSmartphone,
  LuTrash2,
} from 'react-icons/lu'
import { Segmented } from '../components/bits'
import { categoryMeta, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../lib/categories'
import { cx } from '../lib/cx'
import { relativeDay, toISODate } from '../lib/dates'
import { plural } from '../lib/format'
import { useApp, useFinance, useUi } from '../store/contexts'
import { checkable, readChecks, REMINDER_HOUR, subscribeChecks, updateChecks } from './balance'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const PICKER_SHOWN = 60

const LOOKBACK = [
  { value: '0', label: 'None' },
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
]

const RULES_SHOWN = 12
const clock = (at) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

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

/**
 * Settings → Payment capture → Add app: the apps on this phone (those that send notifications first), to read
 * payment alerts from one Gullak doesn't know out of the box.
 */
function AddApp({ inbox, ui }) {
  const [apps, setApps] = useState(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const show = async () => {
    setOpen(true)
    setApps(await inbox.listApps())
  }

  const add = async (app) => {
    await inbox.addApp(app.package, app.label)
    setApps((list) => list.map((a) => (a.package === app.package ? { ...a, read: true } : a)))
    ui.toast(`Gullak now reads ${app.label}’s payment alerts`, { tone: 'lime' })
  }

  if (!open) {
    return (
      <div className="g-settings__actions">
        <button type="button" className="g-btn g-btn--sm g-press" onClick={show}>
          <LuPlus aria-hidden="true" /> Add another app
        </button>
      </div>
    )
  }

  const words = query.trim().toLowerCase()
  const listed = (apps || [])
    .filter((a) => !a.read && (!words || a.label.toLowerCase().includes(words) || a.package.toLowerCase().includes(words)))
    .sort((a, b) => b.lastSeen - a.lastSeen || a.label.localeCompare(b.label))

  return (
    <div className="g-capture__picker">
      <label className="g-capture__search">
        <LuSearch aria-hidden="true" />
        <input
          className="g-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search your apps"
          aria-label="Search your apps"
          autoComplete="off"
        />
      </label>
      {apps === null && <p className="g-settings__note">Looking at your apps…</p>}
      {apps !== null && listed.length === 0 && <p className="g-settings__note">No other apps match.</p>}
      <ul className="g-capture__apps">
        {listed.slice(0, PICKER_SHOWN).map((app) => (
          <li key={app.package} className="g-capture__app">
            <span className="g-capture__payee">
              {app.label}
              <small>{app.lastSeen > 0 ? 'Sends you notifications' : app.package}</small>
            </span>
            <button type="button" className="g-btn g-btn--sm g-press" onClick={() => add(app)}>
              <LuPlus aria-hidden="true" /> Add
            </button>
          </li>
        ))}
      </ul>
      <p className="g-settings__fine">
        <LuInfo aria-hidden="true" /> Add the apps that tell you about payments: your bank’s app, a wallet, another UPI app.
        Gullak reads only the notifications that look like a payment, and only from the apps you add.
      </p>
      <button type="button" className="g-link" onClick={() => setOpen(false)}>
        Done adding apps
      </button>
    </div>
  )
}

/** What the Bank emails section says about the phone's mail apps and the last email from a listed sender. */
function mailNote(mail, today) {
  const apps = Array.isArray(mail.apps) ? mail.apps : []
  if (!apps.length) return 'No mail app found on this phone. Install Gmail or Outlook and sign in with the address your bank writes to.'
  const last = mail.last?.at > 0 ? mail.last : null
  if (!last) return `No email from these senders yet. Gullak reads the ${apps.join(', ')} notifications for them.`
  const when = `${relativeDay(toISODate(new Date(last.at)), today)}, ${clock(last.at)}`
  return `Last email from ${last.sender}: ${when} · ${last.payment ? 'a payment, caught' : 'not a payment, skipped'}.`
}

/**
 * Settings → Payment capture → Bank emails, for accounts that email instead of texting (slice does): Gullak reads
 * the mail app's notification for the senders listed here and ignores every other email.
 */
function MailSettings({ inbox, ui, status, today }) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const mail = status.mail || {}
  const senders = Array.isArray(mail.senders) ? mail.senders : []
  const on = status.sources?.mail !== false

  const add = async (event) => {
    event.preventDefault()
    const typed = name.trim()
    if (!typed) return
    const result = await inbox.addMailSender(typed)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setName('')
    setError('')
    ui.toast(`Gullak now reads payment emails from ${typed}`, { tone: 'lime' })
  }

  const remove = (sender) => {
    void inbox.removeMailSender(sender)
    ui.toast(`Gullak no longer reads emails from ${sender}`, { tone: 'gray' })
  }

  return (
    <div className="g-capture__more">
      <h3 className="g-capture__title">Bank emails</h3>
      <div className="g-settings__row">
        <span className="g-settings__label">
          <span>
            <LuMail aria-hidden="true" /> Read bank emails
          </span>
          <small>For accounts that email you instead of texting. Gullak reads the notification your mail app shows.</small>
        </span>
        <Switch on={on} label="Read bank emails" disabled={status.paused} onToggle={() => inbox.setPrefs({ sources: { mail: !on } })} />
      </div>
      {senders.length > 0 ? (
        <ul className="g-capture__apps" aria-label="Email senders Gullak reads">
          {senders.map((sender) => (
            <li key={sender} className="g-capture__app">
              <span className="g-capture__payee">
                {sender}
                <small>Payment emails from this sender</small>
              </span>
              <button type="button" className="g-icon-btn g-press" aria-label={`Stop reading emails from ${sender}`} onClick={() => remove(sender)}>
                <LuTrash2 aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="g-settings__note">No senders yet. Add the name your bank’s emails come from.</p>
      )}
      <form className="g-capture__add" onSubmit={add}>
        <input
          className="g-input"
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            setError('')
          }}
          placeholder="Sender’s name, as your mail app shows it"
          aria-label="Sender’s name"
          autoComplete="off"
          maxLength={60}
        />
        <button type="submit" className="g-btn g-btn--sm g-press" disabled={!name.trim()}>
          <LuPlus aria-hidden="true" /> Add
        </button>
      </form>
      {error && (
        <p className="g-settings__note" role="alert">
          {error}
        </p>
      )}
      {on && senders.length > 0 && <p className="g-settings__note">{mailNote(mail, today)}</p>}
      <p className="g-settings__fine">
        <LuInfo aria-hidden="true" /> Gullak sees only the emails your phone notifies you about, and nothing from other
        senders. Gmail notifies for the Primary tab by default: if slice’s emails land in Updates, open one in Gmail on a
        computer → ⋮ → <strong>Filter messages like these</strong> → <strong>Create filter</strong> → Categorise as{' '}
        <strong>Primary</strong>.
      </p>
    </div>
  )
}

/** Settings → Payment capture → Weekly balance check: on or off, which day, and which accounts. */
function BalanceCheckSettings({ inbox, ui, accounts }) {
  const checks = useSyncExternalStore(subscribeChecks, readChecks, readChecks)
  const candidates = checkable(accounts)

  const remind = (next) => inbox.setBalanceReminder({ enabled: next.enabled && next.accounts.length > 0, weekday: next.weekday, hour: REMINDER_HOUR })

  const change = (patch) => {
    const next = updateChecks((current) => ({ ...current, ...patch }))
    void remind(next)
    return next
  }

  const toggleOn = () => {
    const turningOn = !checks.enabled
    const chosen = checks.accounts.filter((id) => candidates.some((a) => a.id === id))
    change({ enabled: turningOn, accounts: turningOn && chosen.length === 0 ? candidates.map((a) => a.id) : chosen })
    if (turningOn) ui.toast(`Gullak will ask every ${WEEKDAYS[checks.weekday]} evening`, { tone: 'lime' })
  }

  const toggleAccount = (id) =>
    change({ accounts: checks.accounts.includes(id) ? checks.accounts.filter((a) => a !== id) : [...checks.accounts, id] })

  return (
    <div className="g-capture__more">
      <div className="g-settings__row">
        <span className="g-settings__label">
          <span>
            <LuScale aria-hidden="true" /> Weekly balance check
          </span>
          <small>Once a week Gullak asks what your bank shows and finds the payments it never heard about.</small>
        </span>
        <Switch on={checks.enabled} label="Weekly balance check" onToggle={toggleOn} disabled={candidates.length === 0} />
      </div>
      {candidates.length === 0 && <p className="g-settings__note">Add your bank accounts in Accounts to check them here.</p>}
      {checks.enabled && candidates.length > 0 && (
        <>
          <div className="g-settings__row">
            <span className="g-settings__label">
              Ask me on
              <small>In the evening, as a notification.</small>
            </span>
            <select
              className="g-input g-select g-capture__day"
              aria-label="Day of the week"
              value={checks.weekday}
              onChange={(event) => change({ weekday: Number(event.target.value) })}
            >
              {WEEKDAYS.map((day, index) => (
                <option key={day} value={index}>
                  {day}
                </option>
              ))}
            </select>
          </div>
          <div className="g-chips" role="group" aria-label="Accounts to check">
            {candidates.map((account) => {
              const on = checks.accounts.includes(account.id)
              return (
                <button key={account.id} type="button" className={cx('g-chip', on && 'is-active')} aria-pressed={on} onClick={() => toggleAccount(account.id)}>
                  {account.name}
                </button>
              )
            })}
          </div>
        </>
      )}
      <div className="g-settings__actions">
        <button type="button" className="g-btn g-btn--sm g-press" onClick={() => ui.openSheet('balance')} disabled={candidates.length === 0}>
          <LuScale aria-hidden="true" /> Check a balance now
        </button>
      </div>
    </div>
  )
}

/** Settings → Payment capture (Android app): what Gullak may read, how far back, and what it has learned. */
export default function CaptureSettings() {
  const inbox = useApp()?.inbox
  const { state, today } = useFinance()
  const ui = useUi()
  const [showAll, setShowAll] = useState(false)
  const [scanning, setScanning] = useState(false)
  if (!inbox) return null

  if (!inbox.available) {
    return (
      <p className="g-settings__note">
        Payment capture runs in the Gullak app on an Android phone, where it can read bank SMS, UPI app notifications and
        bank emails.
      </p>
    )
  }
  const status = inbox.status
  if (!status) return <p className="g-settings__note">Checking what Gullak is allowed to read…</p>

  const smsOn = status.sms === 'granted'
  const smsRefused = status.sms === 'denied'
  const notifyOn = status.notifications === 'granted'
  const restricted = status.sdk >= 33 && (!smsOn || !status.listener)
  const apps = Array.isArray(status.apps) ? status.apps : []
  const sourceRows = [
    { id: 'sms', label: 'Bank SMS', hint: 'Debits and credits your banks text you' },
    ...apps
      .filter((a) => !a.builtIn || a.installed)
      .map((a) => ({ id: a.id, label: a.label, hint: a.builtIn ? `Payment notifications from ${a.label}` : 'Added by you', removable: !a.builtIn })),
  ]
  const notInstalled = apps.filter((a) => a.builtIn && !a.installed)

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
        Gullak catches payments from bank SMS, UPI apps and bank emails and keeps them as <strong>unfiled spends</strong>.
        Nothing goes into your book until you say what each one was for.
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
          title="Read payment app alerts"
          body="Notification access. Gullak reads only the apps and bank emails switched on below and ignores everything else."
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
        {sourceRows.map(({ id, label, hint, removable }) => (
          <div key={id} className="g-settings__row">
            <span className="g-settings__label">
              {label}
              <small>{hint}</small>
            </span>
            {removable && (
              <button
                type="button"
                className="g-icon-btn g-press"
                aria-label={`Stop reading ${label}`}
                onClick={() => {
                  void inbox.removeApp(id)
                  ui.toast(`Gullak no longer reads ${label}`, { tone: 'gray' })
                }}
              >
                <LuTrash2 aria-hidden="true" />
              </button>
            )}
            <Switch
              on={status.sources?.[id] !== false}
              label={label}
              disabled={status.paused}
              onToggle={() => inbox.setPrefs({ sources: { [id]: status.sources?.[id] === false } })}
            />
          </div>
        ))}
        {notInstalled.length > 0 && (
          <p className="g-settings__note">
            Also read when installed: {notInstalled.map((a) => a.label).join(', ')}.
          </p>
        )}
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

      <AddApp inbox={inbox} ui={ui} />

      <MailSettings inbox={inbox} ui={ui} status={status} today={today} />

      <div className="g-capture__more">
        <h3 className="g-capture__title">When nothing tells Gullak</h3>
        <p className="g-settings__note">
          Some accounts send no SMS, no app alert and no email. For those, import the bank’s statement whenever you like,
          or let the weekly balance check find what’s missing.
        </p>
        <div className="g-settings__actions">
          <button type="button" className="g-btn g-btn--sm g-press" onClick={() => ui.openSheet('statement')}>
            <LuFileSpreadsheet aria-hidden="true" /> Import a statement
          </button>
        </div>
      </div>

      <BalanceCheckSettings inbox={inbox} ui={ui} accounts={state.accounts} />

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
        the amount, payee, account and your notes. Rules, statement lines and balance checks live on this phone only. To
        list apps under Add app, Gullak notes which apps post notifications, never what they say.
        {status.lastScanAt > 0 && ` Last checked ${new Date(status.lastScanAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}.`}
        {inbox.mock && ' (Browser preview with sample payments.)'}
      </p>
    </div>
  )
}

