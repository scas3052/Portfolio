import { useId, useMemo, useState } from 'react'
import { LuFileSpreadsheet, LuTriangleAlert, LuUpload } from 'react-icons/lu'
import { Segmented } from '../components/bits'
import { Field, FormActions } from '../components/forms/fields'
import { cx } from '../lib/cx'
import { shortDate } from '../lib/dates'
import { formatINR, MASK, plural } from '../lib/format'
import { useApp, useFinance, useUi } from '../store/contexts'
import { matchAccount } from './enrich'
import { describeLine, MAX_FILE_BYTES, planImport, readStatement, readStatementFile, toImportRows } from './statement'

const SHOWN_LINES = 200

const FILE_ERRORS = {
  'old-excel': 'That’s an old Excel (.xls) file. Open it and save it as .xlsx or CSV, or download the CSV or Excel (.xlsx) version from your bank.',
  'too-big': `That file is over ${MAX_FILE_BYTES / 1024 / 1024} MB. Download a shorter period, a month or two.`,
  empty: 'That file is empty.',
  unreadable: 'Gullak couldn’t read that file. Download the statement as CSV or Excel (.xlsx); PDF statements can’t be read yet.',
}

const READ_ERRORS = {
  'no-header': 'Gullak couldn’t find the date and amount columns in that file. Statements with columns like Date, Narration, Withdrawal and Deposit work best.',
  'no-rows': 'Found the columns, but no transactions under them.',
}

const COLUMN_FIELDS = [
  ['date', 'Date'],
  ['description', 'Description'],
  ['debit', 'Money out'],
  ['credit', 'Money in'],
  ['amount', 'Amount (one column)'],
  ['type', 'Dr / Cr'],
]

const ORDERS = [
  { value: 'dmy', label: 'Day first' },
  { value: 'mdy', label: 'Month first' },
]

/** One column choice in the "Columns" fold: which header holds this field, or none. */
function ColumnPick({ field, label, headers, value, onChange }) {
  const id = useId()
  return (
    <label className="g-statement__column" htmlFor={id}>
      <span>{label}</span>
      <select id={id} className="g-input g-select" value={value ?? ''} onChange={(event) => onChange(field, event.target.value === '' ? null : Number(event.target.value))}>
        <option value="">None</option>
        {headers.map((header, index) => (
          <option key={`${field}-${index}`} value={index}>
            {header || `Column ${index + 1}`}
          </option>
        ))}
      </select>
    </label>
  )
}

/**
 * Statement import: a bank's CSV or Excel export, checked against the book and the payments Gullak already
 * caught. Only what's missing is added, as unfiled spends on the chosen account, to file like any other.
 */
export default function StatementSheet({ accountId: initialAccount = '', onDone }) {
  const inbox = useApp()?.inbox
  const { state } = useFinance()
  const ui = useUi()
  const spends = inbox?.spends
  const aliases = inbox?.book?.aliases
  const accounts = useMemo(() => state.accounts.filter((a) => a.kind !== 'cash'), [state.accounts])
  const [accountId, setAccountId] = useState(initialAccount || accounts[0]?.id || '')
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState(null)
  const [columns, setColumns] = useState(null)
  const [order, setOrder] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [skipped, setSkipped] = useState([])
  const fileId = useId()

  const account = accounts.find((a) => a.id === accountId) || null
  const result = useMemo(() => (rows ? readStatement(rows, { columns, order }) : null), [rows, columns, order])
  const plan = useMemo(() => {
    if (!result?.ok || !account) return null
    return planImport(result.transactions, {
      accountId: account.id,
      transactions: state.transactions,
      spends: spends || [],
      onAccount: (spend) => {
        const found = matchAccount(spend, state.accounts, aliases).account
        return !found || found.id === account.id
      },
    })
  }, [result, account, state.transactions, state.accounts, spends, aliases])

  if (!inbox) return null

  const shown = (value) => (ui.privacy ? MASK : formatINR(value))
  const chosen = plan ? plan.fresh.filter((_, i) => !skipped.includes(i)) : []

  const onFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true)
    setError('')
    setRows(null)
    setColumns(null)
    setOrder(null)
    setSkipped([])
    try {
      setRows(await readStatementFile(file))
      setFileName(file.name)
    } catch (err) {
      setError(FILE_ERRORS[err?.code] || FILE_ERRORS.unreadable)
    } finally {
      setBusy(false)
    }
  }

  const setColumn = (field, index) => {
    setSkipped([])
    setColumns((current) => ({ ...(current || {}), [field]: index, ...(field === 'date' ? { valueDate: null } : {}) }))
  }

  const toggle = (index) => setSkipped((list) => (list.includes(index) ? list.filter((i) => i !== index) : [...list, index]))

  const importNow = async () => {
    if (!chosen.length || !account) return
    setBusy(true)
    const outcome = await inbox.importSpends(toImportRows(chosen, account))
    setBusy(false)
    if (!outcome.ok) {
      setError(outcome.error)
      return
    }
    const { added = 0, merged = 0 } = outcome.value || {}
    if (added > 0) {
      ui.toast(`Added ${plural(added, 'payment')} to file from ${account.name}`, { tone: 'lime' })
      ui.openSheet('inbox')
      return
    }
    ui.toast(merged > 0 ? 'Those were already caught; their details were added' : 'Nothing new to add', { tone: 'gray' })
    onDone()
  }

  const dates = result?.ok ? result.transactions.map((t) => t.date).sort() : []

  return (
    <div className="g-form g-statement">
      <p className="g-settings__note">
        For an account whose payments Gullak can’t catch as they happen: download its statement as CSV or Excel from the
        bank’s app or netbanking, and Gullak adds only what it doesn’t already have.
      </p>

      {accounts.length === 0 ? (
        <p className="g-field__hint">Add the bank account in Accounts first, so the payments land on it.</p>
      ) : (
        <Field label="Statement of">
          {(id, describedBy) => (
            <select id={id} className="g-input g-select" value={accountId} onChange={(event) => setAccountId(event.target.value)} aria-describedby={describedBy}>
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

      <div className="g-statement__file">
        {/* No `accept` filter: Android's picker greys out downloads saved with an unknown type. The file is checked after. */}
        <input
          id={fileId}
          className="sr-only"
          type="file"
          onChange={onFile}
          disabled={busy || !account}
        />
        <label htmlFor={fileId} className={cx('g-btn g-press', !rows && 'g-btn--ink', (busy || !account) && 'is-disabled')}>
          {rows ? <LuFileSpreadsheet aria-hidden="true" /> : <LuUpload aria-hidden="true" />}
          {rows ? 'Choose another file' : 'Choose the statement file'}
        </label>
        {fileName && <span className="g-statement__name">{fileName}</span>}
      </div>

      {(error || (result && !result.ok)) && (
        <div className="g-callout" role="alert">
          <LuTriangleAlert aria-hidden="true" />
          <span>{error || READ_ERRORS[result.error] || READ_ERRORS['no-rows']}</span>
        </div>
      )}

      {result?.headers?.length > 0 && (
        <details className="g-statement__columns">
          <summary>Columns and dates</summary>
          <div className="g-statement__grid">
            {COLUMN_FIELDS.map(([field, label]) => (
              <ColumnPick
                key={field}
                field={field}
                label={label}
                headers={result.headers}
                value={field === 'date' ? (result.columns.date ?? result.columns.valueDate) : result.columns[field]}
                onChange={setColumn}
              />
            ))}
          </div>
          <div className="g-settings__row">
            <span className="g-settings__label">
              Dates like 03/04
              <small>{result.order === 'mdy' ? 'Read as 4 March' : 'Read as 3 April'}</small>
            </span>
            <Segmented label="Date order" size="sm" value={result.order} onChange={setOrder} options={ORDERS} />
          </div>
        </details>
      )}

      {plan && (
        <>
          <p className="g-statement__summary">
            {plural(result.transactions.length, 'transaction')} from {shortDate(dates[0])} to {shortDate(dates[dates.length - 1])}:{' '}
            {plan.inBook.length} already in your book, {plan.caught.length} already caught, <strong>{plan.fresh.length} new</strong>.
            {result.skipped > 0 && ` ${plural(result.skipped, 'row')} without a date and amount skipped.`}
          </p>
          {plan.fresh.length > 0 && (
            <ol className="g-statement__list">
              {plan.fresh.slice(0, SHOWN_LINES).map((line, index) => {
                const about = describeLine(line.description)
                const incoming = line.direction === 'in'
                return (
                  <li key={`${line.date}-${index}`}>
                    <label className={cx('g-statement__line', skipped.includes(index) && 'is-off')}>
                      <input type="checkbox" checked={!skipped.includes(index)} onChange={() => toggle(index)} />
                      <span className="g-statement__date">{shortDate(line.date)}</span>
                      <span className="g-statement__what">{about.party || line.description || (incoming ? 'Money in' : 'Payment')}</span>
                      <span className={cx('g-statement__amount', incoming && 'is-in')}>
                        {incoming ? '+' : '−'}
                        {shown(line.amount)}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ol>
          )}
          {plan.fresh.length > SHOWN_LINES && <p className="g-field__hint">Showing the first {SHOWN_LINES}; all ticked ones are added.</p>}
        </>
      )}

      <FormActions>
        <button type="button" className="g-btn g-btn--ghost g-press" onClick={onDone}>
          Cancel
        </button>
        <button type="button" className="g-btn g-btn--ink g-press" onClick={importNow} disabled={busy || !chosen.length}>
          {chosen.length ? `Add ${plural(chosen.length, 'payment')} to file` : 'Nothing to add'}
        </button>
      </FormActions>
    </div>
  )
}
