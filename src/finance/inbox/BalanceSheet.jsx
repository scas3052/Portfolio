import { useState, useSyncExternalStore } from 'react'
import { LuCircleCheck, LuFileSpreadsheet, LuInbox, LuScale } from 'react-icons/lu'
import { commitEntry } from '../agent/commit'
import { AmountInput, Field, FormActions } from '../components/forms/fields'
import { evaluate } from '../lib/calc'
import { cx } from '../lib/cx'
import { relativeDay } from '../lib/dates'
import { formatINR, MASK, plural } from '../lib/format'
import { useApp, useFinance, useUi } from '../store/contexts'
import { adjustmentEntry, balanceGap, checkable, dueChecks, pendingFor, readChecks, subscribeChecks, updateChecks, withCheck } from './balance'
import { matchAccount } from './enrich'

/**
 * The weekly balance check: type what the bank shows, see what Gullak's book says, and deal with the difference:
 * file the unfiled spends that explain part of it, import a statement to find the rest, or book the rest as one
 * entry. For a credit card the question is how much you owe, which the book keeps as a negative balance.
 */
export default function BalanceSheet({ accountId: initialAccount = '', onDone }) {
  const inbox = useApp()?.inbox
  const finance = useFinance()
  const { state, derived, today } = finance
  const ui = useUi()
  const checks = useSyncExternalStore(subscribeChecks, readChecks, readChecks)
  const accounts = checkable(state.accounts)
  const due = dueChecks(checks, state.accounts, today)
  const [accountId, setAccountId] = useState(initialAccount || due[0]?.id || accounts[0]?.id || '')
  const [typed, setTyped] = useState('')

  const account = accounts.find((a) => a.id === accountId) || null
  if (!account) {
    return (
      <div className="g-form g-balance">
        <p className="g-field__hint">Add a bank account or card in Accounts first.</p>
        <FormActions>
          <button type="button" className="g-btn g-btn--ghost g-press" onClick={onDone}>
            Close
          </button>
        </FormActions>
      </div>
    )
  }

  const credit = account.kind === 'credit'
  const value = evaluate(typed)
  const entered = typed.trim() !== '' && value != null && value >= 0 && value < 1e9
  const actual = entered ? (credit ? -value : value) : null
  const book = derived.balances.get(account.id) || 0
  const unfiled = (inbox?.spends || []).filter((s) => s.status === 'unfiled')
  const accountOf = (spend) => matchAccount(spend, state.accounts, inbox?.book?.aliases).account
  const pending = pendingFor(account.id, unfiled, accountOf)
  const pendingCount = unfiled.filter((s) => accountOf(s)?.id === account.id).length
  const gap = entered ? balanceGap({ actual, book, pending }) : null
  const last = checks.last[account.id]
  const shown = (amount) => (ui.privacy ? MASK : formatINR(amount))
  const owed = (amount) => shown(credit ? -amount : amount)
  const lastDay = last ? relativeDay(last.date, today) : ''
  const lastWhen = /^(?:Today|Yesterday)$/.test(lastDay) ? lastDay.toLowerCase() : `on ${lastDay}`

  let verdict = ''
  if (gap && !gap.square) {
    const missing = shown(Math.abs(gap.unexplained))
    if (credit) {
      verdict = gap.unexplained < 0 ? `${missing} more was spent on this card than Gullak knows about.` : `You owe ${missing} less than Gullak thinks: a payment or refund it missed.`
    } else {
      verdict = gap.unexplained < 0 ? `${missing} left this account that Gullak doesn’t know about.` : `${missing} more is in this account than Gullak knows about.`
    }
  }

  const save = () => updateChecks((current) => withCheck(current, account.id, { date: today, actual, book }))

  const addEntry = () => {
    const entry = adjustmentEntry(account, gap.unexplained, today)
    if (!entry) return
    commitEntry({ dispatch: finance.dispatch, derived, ui }, entry)
    updateChecks((current) => withCheck(current, account.id, { date: today, actual, book: book + (entry.type === 'income' ? entry.amount : -entry.amount) }))
    onDone()
  }

  const findThem = () => {
    save()
    ui.openSheet('statement', { accountId: account.id })
  }

  const fileFirst = () => {
    save()
    ui.openSheet('inbox')
  }

  const done = () => {
    save()
    ui.toast(gap?.square ? `${account.name} matches your bank` : `Balance check saved for ${account.name}`, { tone: 'lime' })
    onDone()
  }

  return (
    <div className="g-form g-balance">
      {accounts.length > 1 && (
        <Field label="Account">
          {(id, describedBy) => (
            <select
              id={id}
              className="g-input g-select"
              value={accountId}
              onChange={(event) => {
                setAccountId(event.target.value)
                setTyped('')
              }}
              aria-describedby={describedBy}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.last4 ? ` ••${a.last4}` : ''}
                  {due.some((d) => d.id === a.id) ? ' · due' : ''}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}

      <Field
        label={credit ? `How much do you owe on ${account.name} right now?` : `What does ${account.name} show right now?`}
        hint={
          last
            ? `Last checked ${lastWhen}: the bank showed ${owed(last.actual)}.`
            : credit
              ? 'Open the card’s app and type the amount you owe today.'
              : 'Open the bank’s app and type the balance it shows.'
        }
      >
        {(id, describedBy) => <AmountInput id={id} value={typed} onChange={setTyped} describedBy={describedBy} autoFocus />}
      </Field>

      {gap && (
        <div className={cx('g-balance__card', gap.square && 'is-square')}>
          <dl className="g-balance__rows">
            <div>
              <dt>{credit ? 'Gullak says you owe' : 'Gullak’s balance'}</dt>
              <dd>{owed(book)}</dd>
            </div>
            <div>
              <dt>{credit ? 'The bank says you owe' : 'The bank shows'}</dt>
              <dd>{owed(actual)}</dd>
            </div>
            {pending !== 0 && (
              <div>
                <dt>{plural(pendingCount, 'unfiled spend')}</dt>
                <dd>{shown(pending)}</dd>
              </div>
            )}
          </dl>
          {gap.square ? (
            <p className="g-balance__verdict">
              <LuCircleCheck aria-hidden="true" />
              {pending !== 0 ? `It matches once your ${plural(pendingCount, 'unfiled spend')} are filed.` : 'All square. Nothing is missing.'}
            </p>
          ) : (
            <p className="g-balance__verdict">
              <LuScale aria-hidden="true" />
              {verdict}
              {pending !== 0 && ` That’s after the ${plural(pendingCount, 'unfiled spend')} you still have to file.`}
            </p>
          )}
        </div>
      )}

      {gap && !gap.square && (
        <div className="g-balance__actions">
          <button type="button" className="g-btn g-btn--sm g-press" onClick={findThem}>
            <LuFileSpreadsheet aria-hidden="true" /> Find them in a statement
          </button>
          <button type="button" className="g-btn g-btn--sm g-press" onClick={addEntry}>
            Book {shown(Math.abs(gap.unexplained))} as one “Unaccounted” entry
          </button>
        </div>
      )}

      <FormActions>
        {pendingCount > 0 ? (
          <button type="button" className="g-btn g-btn--ghost g-press" onClick={entered ? fileFirst : () => ui.openSheet('inbox')}>
            <LuInbox aria-hidden="true" /> File unfiled spends
          </button>
        ) : (
          <button type="button" className="g-btn g-btn--ghost g-press" onClick={onDone}>
            Later
          </button>
        )}
        <button type="button" className="g-btn g-btn--ink g-press" onClick={done} disabled={!entered}>
          {gap && !gap.square ? 'Save, I’ll sort it later' : 'Save check'}
        </button>
      </FormActions>
    </div>
  )
}
