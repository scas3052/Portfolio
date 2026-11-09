import { useMemo, useRef, useState } from 'react'
import { LuHistory, LuLandmark, LuPlus, LuTrash2, LuUserPlus, LuWalletCards } from 'react-icons/lu'
import { useActions } from '../../hooks/useActions'
import { evaluate } from '../../lib/calc'
import {
  accountKindLabel,
  categoryMeta,
  EXPENSE_CATEGORIES,
  EXPENSE_IDS,
  INCOME_CATEGORIES,
  INCOME_IDS,
  PEOPLE_TYPES,
  TYPE_META,
} from '../../lib/categories'
import { cx, toneFor, toneVar } from '../../lib/cx'
import { isISODate } from '../../lib/dates'
import { MOD_KEY } from '../../lib/dom'
import { formatINR, plural, round2 } from '../../lib/format'
import { stamp, uid } from '../../lib/id'
import { frequentEntries, PERSON_SIGN } from '../../lib/selectors'
import { useFinance, useUi } from '../../store/contexts'
import { Avatar, Segmented, Sticker } from '../bits'
import { Money } from '../Money'
import { AmountInput, ChipGroup, DateChips, Field, FieldSet, FormActions } from './fields'

const TYPE_ORDER = ['expense', 'income', 'transfer', 'emi', 'lend', 'borrow', 'collect', 'repay']
const TYPE_OPTIONS = TYPE_ORDER.map((type) => ({
  value: type,
  label: TYPE_META[type].label,
  icon: TYPE_META[type].icon,
  tone: TYPE_META[type].tone,
}))
const toOptions = (list) => list.map((c) => ({ value: c.id, label: c.short, icon: c.icon, tone: c.tone }))
const EXPENSE_OPTIONS = toOptions(EXPENSE_CATEGORIES)
const INCOME_OPTIONS = toOptions(INCOME_CATEGORIES)

const ACCOUNT_LABEL = {
  expense: 'Paid from',
  emi: 'Paid from',
  lend: 'Paid from',
  repay: 'Paid from',
  income: 'Received in',
  borrow: 'Received in',
  collect: 'Received in',
  transfer: 'From account',
}

const PERSON_LABEL = {
  lend: 'Who did you lend to?',
  borrow: 'Who did you borrow from?',
  collect: 'Who paid you back?',
  repay: 'Who are you paying back?',
}

const NOTE_HINT = {
  expense: 'e.g. Lunch with the team',
  income: 'e.g. July salary',
  transfer: 'e.g. Card bill, wallet top-up',
  emi: 'e.g. July instalment',
  lend: 'e.g. Concert tickets',
  borrow: 'e.g. Rent shortfall',
  collect: 'e.g. Paid back over UPI',
  repay: 'e.g. Settled half',
}

const isPeople = (type) => PEOPLE_TYPES.includes(type)
const hasCategory = (type) => type === 'expense' || type === 'income'

function parseAmount(input) {
  const value = evaluate(input)
  return value === null ? NaN : round2(value)
}

function fitCategory(type, category) {
  if (type === 'expense') return EXPENSE_IDS.has(category) ? category : ''
  if (type === 'income') return INCOME_IDS.has(category) ? category : ''
  return ''
}

function lastAccount(sorted, accounts, types) {
  const ids = new Set(accounts.map((a) => a.id))
  const hit = sorted.find((t) => types.includes(t.type) && ids.has(t.accountId))
  return hit?.accountId || accounts.find((a) => a.kind !== 'credit')?.id || accounts[0]?.id || ''
}

function initialDraft(txn, prefill, state, derived, today) {
  const source = txn || prefill || {}
  const type = TYPE_ORDER.includes(source.type) ? source.type : 'expense'
  const loan = source.loanId ? state.loans.find((l) => l.id === source.loanId) : null
  let amount = ''
  if (Number(source.amount) > 0) amount = String(source.amount)
  else if (type === 'emi' && loan?.emi > 0) amount = String(loan.emi)
  const fallbackAccount = loan?.accountId || lastAccount(derived.sorted, state.accounts, [type])
  return {
    type,
    amount,
    date: isISODate(source.date) ? source.date : today,
    note: source.note || '',
    category: fitCategory(type, source.category),
    accountId: source.accountId ?? fallbackAccount,
    toAccountId: source.toAccountId || '',
    personId: source.personId || '',
    loanId: source.loanId || '',
  }
}

function validate(draft, newPerson) {
  const errors = {}
  const value = parseAmount(draft.amount)
  if (!(value > 0)) errors.amount = draft.amount.trim() ? 'That doesn’t work out to an amount above zero.' : 'How much was it?'
  else if (value >= 1e9) errors.amount = 'Keep it under ₹100 crore.'
  if (hasCategory(draft.type) && !draft.category) errors.category = 'Pick a category.'
  if (draft.type === 'transfer') {
    if (!draft.accountId) errors.accountId = 'Where did the money leave from?'
    if (!draft.toAccountId) errors.toAccountId = 'Where did it go?'
    else if (draft.toAccountId === draft.accountId) errors.toAccountId = 'Pick two different accounts.'
  }
  if (isPeople(draft.type) && (newPerson !== null ? !newPerson.trim() : !draft.personId)) {
    errors.personId = 'Who was it with?'
  }
  if (!isISODate(draft.date)) errors.date = 'Pick a date.'
  return errors
}

function accountName(account) {
  return `${account.name}${account.last4 ? ` ••${account.last4}` : ''} · ${accountKindLabel(account.kind)}`
}

function OweHint({ person, type, onFill }) {
  if (Math.abs(person.net) < 0.005) {
    return <p className="g-field__hint">You’re all square with {person.name} right now.</p>
  }
  const theyOwe = person.net > 0
  const fits = (theyOwe && type === 'collect') || (!theyOwe && type === 'repay')
  return (
    <p className="g-owe-hint">
      {theyOwe ? `${person.name} owes you ` : `You owe ${person.name} `}
      <Money value={Math.abs(person.net)} tone={theyOwe ? 'pos' : 'neg'} />
      {fits && (
        <button type="button" className="g-link" onClick={onFill}>
          Fill full amount
        </button>
      )}
    </p>
  )
}

function TxnEditor({ txn, prefill, round, onDone, onAnother }) {
  const { state, dispatch, derived, today } = useFinance()
  const ui = useUi()
  const { deleteEntry } = useActions()
  const form = useRef(null)
  const [draft, setDraft] = useState(() => initialDraft(txn, prefill, state, derived, today))
  const [newPerson, setNewPerson] = useState(state.people.length ? null : '')
  const [tried, setTried] = useState(false)

  const { type } = draft
  const errors = tried ? validate(draft, newPerson) : {}
  const set = (patch) => setDraft((current) => ({ ...current, ...patch }))
  const accounts = state.accounts

  const frequent = useMemo(
    () => (txn ? [] : frequentEntries(state.transactions, today, 6)),
    [txn, state.transactions, today],
  )

  const people = useMemo(() => {
    const want = type === 'collect' ? 1 : type === 'repay' ? -1 : 0
    const score = (p) => (want && Math.sign(p.net) === want ? 2 : Math.abs(p.net) > 0.005 ? 1 : 0)
    return [...derived.people].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name))
  }, [derived.people, type])
  const selectedPerson = newPerson === null ? derived.people.find((p) => p.id === draft.personId) : null

  const loanChoices = derived.loans.filter((s) => !s.done || s.loan.id === draft.loanId)
  const loanOptions = [
    ...loanChoices.map((s) => ({
      value: s.loan.id,
      label: s.loan.name,
      icon: LuLandmark,
      tone: s.loan.color,
      hint: ui.privacy ? plural(s.remaining, 'EMI left', 'EMIs left') : `${formatINR(s.loan.emi)} · ${s.remaining} left`,
    })),
    { value: '', label: 'Not tracked' },
  ]

  const changeType = (next) =>
    setDraft((current) => {
      const patch = { type: next, category: fitCategory(next, current.category) }
      if (next === 'transfer' && current.toAccountId === current.accountId) patch.toAccountId = ''
      return { ...current, ...patch }
    })

  const pickLoan = (id) => {
    const loan = state.loans.find((l) => l.id === id)
    const previous = state.loans.find((l) => l.id === draft.loanId)
    const patch = { loanId: id }
    const untouched = !draft.amount.trim() || (previous && parseAmount(draft.amount) === previous.emi)
    if (loan?.emi > 0 && untouched) patch.amount = String(loan.emi)
    if (loan?.accountId) patch.accountId = loan.accountId
    set(patch)
  }

  const applyFrequent = (entry) =>
    set({
      type: 'expense',
      note: entry.note,
      category: entry.category,
      amount: String(entry.amount),
      accountId: accounts.some((a) => a.id === entry.accountId) ? entry.accountId : draft.accountId,
    })

  const celebrateNew = (record, personBefore) => {
    if (record.type === 'emi' && record.loanId) {
      const status = derived.loans.find((s) => s.loan.id === record.loanId)
      if (!status || status.done) return
      const left = status.remaining - 1
      if (left <= 0) ui.celebrate('paidoff', `${status.loan.name} is fully paid off`)
      else ui.celebrate('emi', `${status.loan.name} · ${plural(left, 'EMI')} to go`)
    } else if (personBefore && Math.abs(personBefore.net) >= 0.005) {
      const after = round2(personBefore.net + PERSON_SIGN[record.type] * record.amount)
      if (Math.abs(after) < 0.005) ui.celebrate('settled', `All square with ${personBefore.name}`)
    }
  }

  const save = (another) => {
    const found = validate(draft, newPerson)
    if (Object.keys(found).length) {
      setTried(true)
      const node = form.current
      requestAnimationFrame(() => node?.querySelector('.is-invalid input, .is-invalid select')?.focus())
      return
    }
    const amount = parseAmount(draft.amount)
    let personId = isPeople(type) ? draft.personId : ''
    let personBefore = isPeople(type) ? derived.people.find((p) => p.id === personId) : null
    if (isPeople(type) && newPerson !== null) {
      const name = newPerson.trim().slice(0, 40)
      const existing = derived.people.find((p) => p.name.toLowerCase() === name.toLowerCase())
      if (existing) {
        personId = existing.id
        personBefore = existing
      } else {
        personId = uid('p')
        personBefore = null
        dispatch({ type: 'person/add', person: { id: personId, name } })
      }
    }

    const record = {
      id: txn?.id || uid('t'),
      type,
      amount,
      date: draft.date,
      note: draft.note.trim(),
      category: hasCategory(type) ? draft.category : type === 'emi' ? 'emi' : '',
      accountId: draft.accountId || '',
      toAccountId: type === 'transfer' ? draft.toAccountId : '',
      personId,
      loanId: type === 'emi' ? draft.loanId : '',
      createdAt: txn?.createdAt || stamp(),
    }

    const what = hasCategory(type) ? categoryMeta(record.category).short : TYPE_META[type].label
    const amountText = ui.privacy ? '' : ` ${formatINR(amount)}`
    if (txn) {
      dispatch({ type: 'txn/update', txn: record })
      ui.toast(`Updated${amountText} · ${what}`, {
        tone: 'sky',
        action: { label: 'Undo', run: () => dispatch({ type: 'txn/update', txn }) },
      })
    } else {
      dispatch({ type: 'txn/add', txn: record })
      ui.toast(`${TYPE_META[type].verb}${amountText} · ${what}`, {
        tone: TYPE_META[type].tone,
        action: { label: 'Undo', run: () => dispatch({ type: 'txn/delete', id: record.id }) },
      })
      celebrateNew(record, personBefore)
    }

    if (another) onAnother({ type, date: draft.date, accountId: draft.accountId, toAccountId: draft.toAccountId })
    else onDone()
  }

  return (
    <form
      ref={form}
      className="g-form g-txnform"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        save(false)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !txn) {
          event.preventDefault()
          save(true)
        }
      }}
    >
      <Segmented
        options={TYPE_OPTIONS}
        value={type}
        onChange={changeType}
        label="Entry type"
        size="sm"
        className="g-seg--types"
      />

      <Field label="Amount" error={errors.amount} hint="Maths works here too — try 240+65 or 1200/4.">
        {(id, describedBy) => (
          <AmountInput
            id={id}
            value={draft.amount}
            onChange={(amount) => set({ amount })}
            describedBy={describedBy}
            invalid={Boolean(errors.amount)}
            autoFocus
          />
        )}
      </Field>

      {type === 'expense' && frequent.length > 0 && (
        <div className="g-quick" role="group" aria-label="Frequent entries">
          <span className="g-quick__label">
            <LuHistory aria-hidden="true" /> Again?
          </span>
          {frequent.map((entry) => {
            const meta = categoryMeta(entry.category)
            const Icon = meta.icon
            return (
              <button
                key={entry.key}
                type="button"
                className="g-chip g-chip--quick"
                style={toneVar(meta.tone)}
                onClick={() => applyFrequent(entry)}
              >
                <Icon className="g-chip__icon" aria-hidden="true" />
                <span className="g-chip__label">{entry.note}</span>
                {!ui.privacy && <span className="g-chip__hint">{formatINR(entry.amount)}</span>}
              </button>
            )
          })}
        </div>
      )}

      <div key={isPeople(type) ? 'people' : type} className="g-form__swap">
        {hasCategory(type) && (
          <ChipGroup
            legend="Category"
            options={type === 'expense' ? EXPENSE_OPTIONS : INCOME_OPTIONS}
            value={draft.category}
            onChange={(category) => set({ category })}
            error={errors.category}
            variant="grid"
          />
        )}

        {type === 'emi' &&
          (state.loans.length ? (
            <ChipGroup
              legend="Which loan?"
              options={loanOptions}
              value={draft.loanId}
              onChange={pickLoan}
              hint="Linking the loan keeps “paid vs left” up to date."
            />
          ) : (
            <p className="g-callout" style={toneVar('coral')}>
              <LuLandmark aria-hidden="true" />
              <span>
                Add your loan once and Gullak tracks every EMI paid and left.{' '}
                <button type="button" className="g-link" onClick={() => ui.openSheet('loan')}>
                  Add a loan
                </button>
              </span>
            </p>
          ))}

        {isPeople(type) && (
          <FieldSet legend={PERSON_LABEL[type]} error={errors.personId}>
            <div className="g-chips">
              {people.map((person) => {
                const checked = newPerson === null && draft.personId === person.id
                return (
                  <label key={person.id} className={cx('g-chip g-chip--person', checked && 'is-active')}>
                    <input
                      className="sr-only"
                      type="radio"
                      name="txn-person"
                      value={person.id}
                      checked={checked}
                      onChange={() => {
                        setNewPerson(null)
                        set({ personId: person.id })
                      }}
                    />
                    <Avatar name={person.name} tone={toneFor(person.id)} size="xs" />
                    <span className="g-chip__label">{person.name}</span>
                  </label>
                )
              })}
              <button
                type="button"
                className={cx('g-chip g-chip--new', newPerson !== null && 'is-active')}
                aria-pressed={newPerson !== null}
                onClick={() => setNewPerson((current) => (current === null ? '' : current))}
              >
                <LuUserPlus className="g-chip__icon" aria-hidden="true" />
                <span className="g-chip__label">New person</span>
              </button>
            </div>
            {newPerson !== null && (
              <input
                className="g-input"
                value={newPerson}
                maxLength={40}
                placeholder="Their name"
                aria-label="New person’s name"
                autoComplete="off"
                autoFocus={people.length > 0}
                onChange={(event) => setNewPerson(event.target.value)}
              />
            )}
            {selectedPerson && (
              <OweHint
                person={selectedPerson}
                type={type}
                onFill={() => set({ amount: String(Math.abs(selectedPerson.net)) })}
              />
            )}
          </FieldSet>
        )}
      </div>

      <div className="g-form__grid">
        <Field label="Date" error={errors.date}>
          {(id, describedBy) => (
            <DateChips id={id} value={draft.date} onChange={(date) => set({ date })} today={today} describedBy={describedBy} />
          )}
        </Field>

        {accounts.length > 0 ? (
          <Field label={ACCOUNT_LABEL[type]} error={errors.accountId}>
            {(id, describedBy) => (
              <select
                id={id}
                className="g-input g-select"
                value={draft.accountId}
                aria-describedby={describedBy}
                onChange={(event) => {
                  const accountId = event.target.value
                  set(accountId === draft.toAccountId ? { accountId, toAccountId: '' } : { accountId })
                }}
              >
                <option value="">{type === 'transfer' ? 'Choose an account…' : 'Not linked to an account'}</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {accountName(account)}
                  </option>
                ))}
              </select>
            )}
          </Field>
        ) : (
          <p className="g-callout" style={toneVar('butter')}>
            <LuWalletCards aria-hidden="true" />
            <span>
              No accounts yet.{' '}
              <button type="button" className="g-link" onClick={() => ui.openSheet('account')}>
                Add a bank or wallet
              </button>{' '}
              to track balances.
            </span>
          </p>
        )}

        {type === 'transfer' && accounts.length > 0 && (
          <Field
            label="To account"
            error={errors.toAccountId}
            hint="Card bill? Move money from your bank to the card."
          >
            {(id, describedBy) => (
              <select
                id={id}
                className="g-input g-select"
                value={draft.toAccountId}
                aria-describedby={describedBy}
                onChange={(event) => set({ toAccountId: event.target.value })}
              >
                <option value="">Choose an account…</option>
                {accounts
                  .filter((account) => account.id !== draft.accountId)
                  .map((account) => (
                    <option key={account.id} value={account.id}>
                      {accountName(account)}
                    </option>
                  ))}
              </select>
            )}
          </Field>
        )}
      </div>

      <Field label="Note (optional)">
        {(id, describedBy) => (
          <input
            id={id}
            className="g-input"
            value={draft.note}
            maxLength={140}
            placeholder={NOTE_HINT[type]}
            autoComplete="off"
            aria-describedby={describedBy}
            onChange={(event) => set({ note: event.target.value })}
          />
        )}
      </Field>

      <FormActions>
        {txn ? (
          <button
            type="button"
            className="g-btn g-btn--ghost g-press"
            style={toneVar('rose')}
            onClick={() => {
              deleteEntry(txn)
              onDone()
            }}
          >
            <LuTrash2 aria-hidden="true" /> Delete
          </button>
        ) : (
          <>
            {round > 0 && (
              <Sticker tone="lime" rotate={-4} className="g-form__streak">
                +{round} logged
              </Sticker>
            )}
            <button
              type="button"
              className="g-btn g-btn--ghost g-press"
              onClick={() => save(true)}
              aria-keyshortcuts="Control+Enter Meta+Enter"
              title={`Save and add another (${MOD_KEY} Enter)`}
            >
              <LuPlus aria-hidden="true" /> Save &amp; add another
            </button>
          </>
        )}
        <button type="submit" className="g-btn g-btn--ink g-press">
          {txn ? 'Save changes' : 'Save entry'}
        </button>
      </FormActions>
    </form>
  )
}

/** New or edited money entry. "Save & add another" remounts a fresh editor. */
export default function TxnForm({ txn, prefill, onDone }) {
  const [round, setRound] = useState({ n: 0, prefill })
  return (
    <TxnEditor
      key={round.n}
      txn={round.n === 0 ? txn : undefined}
      prefill={round.prefill}
      round={round.n}
      onDone={onDone}
      onAnother={(carry) => setRound((current) => ({ n: current.n + 1, prefill: carry }))}
    />
  )
}
