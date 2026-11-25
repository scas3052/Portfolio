import { useEffect, useRef, useState } from 'react'
import { LuCircleCheck, LuQrCode, LuTriangleAlert } from 'react-icons/lu'
import { AmountInput, ChipGroup, Field, FormActions } from '../components/forms/fields'
import { evaluate } from '../lib/calc'
import { formatINR, MASK } from '../lib/format'
import { useApp, useFinance, useUi } from '../store/contexts'
import { buildPayUri, parseUpiResponse, parseUpiUri } from './upi'

// The account and UPI app used last time, so the next payment needs no choosing. Kept on this phone only.
const PREFS_KEY = 'gullak:inbox:scanpay'

function readPrefs() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(PREFS_KEY) || '{}')
    return saved && typeof saved === 'object' ? saved : {}
  } catch {
    return {}
  }
}

function writePrefs(prefs) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // Storage full or blocked: the choice is asked again next time.
  }
}

const amountOf = (scan, typed) => {
  if (scan?.amount) return scan.amount
  const value = evaluate(typed)
  return value > 0 && value < 1e7 ? Math.round(value * 100) / 100 : null
}

/**
 * Scan & Pay: scan a UPI QR in Gullak, pay in your UPI app, and the payment is in Gullak the moment you come
 * back, with what it was for. It works for any bank, including one that sends no SMS and whose app sends no
 * alert. Steps: scanning → confirm → paying → done, with `ask` when the UPI app doesn't say how it went and
 * `failed` when it says the payment failed.
 */
export default function ScanPaySheet({ onDone }) {
  const inbox = useApp()?.inbox
  const { state } = useFinance()
  const ui = useUi()
  const scanQr = inbox?.scanQr
  const listUpiApps = inbox?.listUpiApps
  const [step, setStep] = useState('scanning')
  const [scan, setScan] = useState(null)
  const [scanned, setScanned] = useState('')
  const [typed, setTyped] = useState('')
  const [note, setNote] = useState('')
  const [accountId, setAccountId] = useState(() => readPrefs().accountId || '')
  const [apps, setApps] = useState([])
  const [appPkg, setAppPkg] = useState(() => readPrefs().app || '')
  const [answer, setAnswer] = useState(null)
  const [error, setError] = useState('')
  const [recorded, setRecorded] = useState(null)
  const started = useRef(false)

  const accounts = state.accounts.filter((a) => a.kind !== 'cash')
  const amount = amountOf(scan, typed)
  const shown = (value) => (ui.privacy ? MASK : formatINR(value))
  const payee = scan ? scan.name || scan.vpa : ''
  const app = apps.find((a) => a.package === appPkg) || null

  const startScan = async () => {
    if (!scanQr) return
    const result = await scanQr()
    if (!result.ok) {
      setError(result.error)
      setStep('invalid')
      return
    }
    if (result.value?.cancelled || !result.value?.value) {
      onDone()
      return
    }
    const found = parseUpiUri(result.value.value)
    setScanned(String(result.value.value))
    setScan(found)
    setStep(found ? 'confirm' : 'invalid')
  }

  // Straight to the scanner when the sheet opens (the shortcut and the Home button both expect it).
  useEffect(() => {
    if (started.current) return
    started.current = true
    queueMicrotask(() => void startScan())
  })

  useEffect(() => {
    let alive = true
    listUpiApps?.().then((list) => {
      if (!alive) return
      setApps(list)
      setAppPkg((current) => (list.some((a) => a.package === current) ? current : list[0]?.package || ''))
    })
    return () => {
      alive = false
    }
  }, [listUpiApps])

  if (!inbox) return null

  const record = async (said) => {
    const account = accounts.find((a) => a.id === accountId) || null
    const result = await inbox.recordPayment({
      amountPaise: Math.round(amount * 100),
      party: scan.name || null,
      vpa: scan.vpa,
      ref: said?.ref || null,
      note: note.trim(),
      accountId: account?.id || null,
      account: account?.last4 || null,
      bank: account?.bank || null,
      app: app?.label || null,
    })
    if (!result.ok) {
      setError(result.error)
      setStep('confirm')
      return
    }
    setRecorded({ id: result.value?.id || null, duplicate: Boolean(result.value?.duplicate), pending: said?.status === 'submitted' })
    setStep('done')
  }

  const pay = async () => {
    const uri = buildPayUri(scan, amount)
    if (!uri) {
      setError('Enter the amount first.')
      return
    }
    writePrefs({ accountId, app: appPkg })
    setError('')
    setStep('paying')
    const result = await inbox.payUpi(uri, appPkg)
    if (!result.ok) {
      setError(result.error)
      setStep('confirm')
      return
    }
    const said = parseUpiResponse(result.value)
    setAnswer(said)
    if (said.status === 'failure') setStep('failed')
    else if (said.status === 'unknown') setStep('ask')
    else await record(said)
  }

  const paidElsewhere = async () => {
    if (!amount) {
      setError('Enter the amount first.')
      return
    }
    writePrefs({ accountId, app: appPkg })
    await record(null)
  }

  const scanAgain = () => {
    setError('')
    setStep('scanning')
    void startScan()
  }

  const fileNow = () => {
    if (recorded?.id) ui.openSheet('inbox', { focus: recorded.id })
    else onDone()
  }

  if (step === 'scanning') {
    return (
      <div className="g-form g-scanpay">
        <p className="g-scanpay__wait">
          <LuQrCode aria-hidden="true" /> Point the camera at the QR code…
        </p>
      </div>
    )
  }

  if (step === 'invalid') {
    return (
      <div className="g-form g-scanpay">
        <div className="g-callout" role="alert">
          <LuTriangleAlert aria-hidden="true" />
          <span>
            {error || (
              <>
                That QR isn’t a UPI payment code{scanned ? <> (it says “{scanned.slice(0, 80)}”)</> : null}.
              </>
            )}
          </span>
        </div>
        <FormActions>
          <button type="button" className="g-btn g-btn--ghost g-press" onClick={onDone}>
            Close
          </button>
          <button type="button" className="g-btn g-btn--ink g-press" onClick={scanAgain}>
            Scan again
          </button>
        </FormActions>
      </div>
    )
  }

  if (step === 'paying') {
    return (
      <div className="g-form g-scanpay">
        <p className="g-scanpay__wait">Finish the payment in {app?.label || 'your UPI app'}. Gullak records it when you come back.</p>
      </div>
    )
  }

  if (step === 'ask') {
    return (
      <div className="g-form g-scanpay">
        <p className="g-scanpay__question">
          Did the {shown(amount)} payment to <strong>{payee}</strong> go through?
        </p>
        <p className="g-field__hint">{app?.label || 'The UPI app'} didn’t say. Check it there if you’re not sure.</p>
        <FormActions>
          <button type="button" className="g-btn g-btn--ghost g-press" onClick={onDone}>
            No, it didn’t
          </button>
          <button type="button" className="g-btn g-btn--ink g-press" onClick={() => record(answer)}>
            Yes, record it
          </button>
        </FormActions>
      </div>
    )
  }

  if (step === 'failed') {
    return (
      <div className="g-form g-scanpay">
        <div className="g-callout" role="alert">
          <LuTriangleAlert aria-hidden="true" />
          <span>
            <strong>{app?.label || 'The UPI app'} says the payment failed.</strong> Nothing was recorded. Some apps refuse payments
            to a person’s UPI ID when another app starts them; if that keeps happening, pay in the app and choose “Paid another
            way” here.
          </span>
        </div>
        <FormActions>
          <button type="button" className="g-btn g-btn--ghost g-press" onClick={() => setStep('confirm')}>
            Back
          </button>
          <button type="button" className="g-btn g-btn--ink g-press" onClick={pay}>
            Try again
          </button>
        </FormActions>
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="g-form g-scanpay">
        <p className="g-scanpay__done">
          <LuCircleCheck aria-hidden="true" />
          <span>
            {recorded?.duplicate ? (
              <>This payment is already in Gullak.</>
            ) : (
              <>
                {shown(amount)} to <strong>{payee}</strong> is in your unfiled spends
                {note.trim() ? <> with your note “{note.trim()}”</> : null}.
                {recorded?.pending && ' The bank is still finishing it; check the app if it doesn’t go through.'}
              </>
            )}
          </span>
        </p>
        <FormActions>
          <button type="button" className="g-btn g-btn--ghost g-press" onClick={onDone}>
            Done
          </button>
          {recorded?.id && (
            <button type="button" className="g-btn g-btn--ink g-press" onClick={fileNow}>
              File it now
            </button>
          )}
        </FormActions>
      </div>
    )
  }

  return (
    <div className="g-form g-scanpay">
      <div className="g-scanpay__payee">
        <span className="g-scanpay__badge" aria-hidden="true">
          <LuQrCode />
        </span>
        <div className="g-scanpay__who">
          <p className="g-scanpay__name">{payee}</p>
          <p className="g-scanpay__vpa">
            {scan.vpa}
            {scan.merchant ? ' · shop' : ''}
          </p>
        </div>
      </div>

      {scan.amount ? (
        <p className="g-scanpay__fixed">
          <strong>{shown(scan.amount)}</strong> · the amount is set by the QR
        </p>
      ) : (
        <Field label="Amount" hint={typed && !amount ? 'Enter an amount above zero.' : undefined}>
          {(id, describedBy) => <AmountInput id={id} value={typed} onChange={setTyped} describedBy={describedBy} autoFocus />}
        </Field>
      )}

      <Field label="What’s it for?" hint="Optional. Saved with the payment, so filing it later takes one tap.">
        {(id, describedBy) => (
          <input
            id={id}
            className="g-input"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={scan.note || 'e.g. tea with Ravi'}
            maxLength={200}
            autoComplete="off"
            aria-describedby={describedBy}
          />
        )}
      </Field>

      {accounts.length > 0 && (
        <Field label="Paying from" hint="The account your UPI app will take it from.">
          {(id, describedBy) => (
            <select id={id} className="g-input g-select" value={accountId} onChange={(event) => setAccountId(event.target.value)} aria-describedby={describedBy}>
              <option value="">Not sure</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.last4 ? ` ••${a.last4}` : ''}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}

      {apps.length > 1 && (
        <ChipGroup legend="Pay with" options={apps.map((a) => ({ value: a.package, label: a.label }))} value={appPkg} onChange={setAppPkg} />
      )}

      {error && (
        <p className="g-field__error" role="alert">
          {error}
        </p>
      )}

      <FormActions>
        <button type="button" className="g-btn g-btn--ghost g-press" onClick={paidElsewhere} disabled={!amount}>
          Paid another way
        </button>
        <button type="button" className="g-btn g-btn--ink g-press" onClick={pay} disabled={!amount || apps.length === 0}>
          Pay {amount ? shown(amount) : ''}
          {app ? ` with ${app.label}` : ''}
        </button>
      </FormActions>
      {apps.length === 0 && <p className="g-field__hint">No UPI app on this phone can take the payment. You can still record it.</p>}
    </div>
  )
}
