import { useRef, useState } from 'react'
import { LuCalculator, LuTrash2, LuWandSparkles } from 'react-icons/lu'
import { evaluate } from '../../lib/calc'
import { TONES } from '../../lib/categories'
import { toneVar } from '../../lib/cx'
import { addMonths, isMonth, monthDiff, monthLabel, monthOf } from '../../lib/dates'
import { formatINR, plural, round2 } from '../../lib/format'
import { uid } from '../../lib/id'
import { useFinance, useUi } from '../../store/contexts'
import { HoldButton } from '../bits'
import { Money } from '../Money'
import { AmountInput, Field, FormActions, TonePicker } from './fields'

const NO_PAYMENTS = []

const whole = (value) => (/^\d+$/.test(String(value).trim()) ? Number(value) : NaN)
const optionalNumber = (value) => (String(value).trim() ? evaluate(value) : 0)

/** Standard reducing-balance EMI: P·r·(1+r)^n / ((1+r)^n − 1), r = monthly rate. */
function emiFor(principal, ratePct, months) {
  if (!(principal > 0) || !(months > 0)) return null
  const r = ratePct / 1200
  if (r === 0) return round2(principal / months)
  const growth = (1 + r) ** months
  return round2((principal * r * growth) / (growth - 1))
}

function readNumbers(draft) {
  return {
    emi: evaluate(draft.emi),
    tenure: whole(draft.tenure),
    paidBefore: draft.paidBefore.trim() ? whole(draft.paidBefore) : 0,
    dueDay: whole(draft.dueDay),
    rate: draft.rate.trim() ? Number(draft.rate) : 0,
    principal: optionalNumber(draft.principal),
  }
}

function validate(draft) {
  const n = readNumbers(draft)
  const errors = {}
  if (!draft.name.trim()) errors.name = 'Name the loan, e.g. Bike loan.'
  if (!(n.emi > 0)) errors.emi = 'How much is each EMI?'
  if (!(n.tenure >= 1 && n.tenure <= 600)) errors.tenure = 'Months between 1 and 600.'
  if (!isMonth(draft.startMonth)) errors.startMonth = 'Pick the month of the first EMI.'
  if (!(n.dueDay >= 1 && n.dueDay <= 31)) errors.dueDay = 'A day from 1 to 31.'
  if (!(n.paidBefore >= 0)) errors.paidBefore = 'A whole number, or leave it empty.'
  else if (n.tenure >= 1 && n.paidBefore > n.tenure) errors.paidBefore = 'Can’t be more than the tenure.'
  if (!(n.rate >= 0 && n.rate <= 60)) errors.rate = 'A yearly rate between 0 and 60%.'
  if (n.principal === null || n.principal < 0) errors.principal = 'That doesn’t look like an amount.'
  return errors
}

/** Mirrors loanStatus() so the preview matches what the EMIs page will show. */
function buildPreview(n, startMonth, payments) {
  if (!(n.emi > 0 && n.tenure >= 1 && n.tenure <= 600 && isMonth(startMonth))) return null
  const before = n.paidBefore >= 0 ? n.paidBefore : 0
  const total = round2(n.emi * n.tenure)
  const paidCount = Math.min(n.tenure, before + payments.length)
  const paid = round2(before * n.emi + payments.reduce((sum, t) => sum + t.amount, 0))
  return {
    total,
    paid,
    left: round2(Math.max(0, total - paid)),
    paidCount,
    end: addMonths(startMonth, n.tenure - 1),
    interest: n.principal > 0 ? round2(total - n.principal) : null,
  }
}

/** EMIs that should have gone out between the first EMI and today. */
function duesSoFar(startMonth, dueDay, today) {
  if (!isMonth(startMonth)) return 0
  const months = monthDiff(startMonth, monthOf(today))
  if (months < 0) return 0
  return months + (Number(today.slice(8, 10)) >= dueDay ? 1 : 0)
}

/** Add or edit a loan so Gullak can track every EMI paid and left. */
export default function LoanForm({ loan, onDone }) {
  const { state, dispatch, derived, today } = useFinance()
  const ui = useUi()
  const form = useRef(null)
  const status = loan ? derived.loans.find((s) => s.loan.id === loan.id) : null
  const payments = status ? status.payments : NO_PAYMENTS
  const logged = payments.length
  const [draft, setDraft] = useState(() => ({
    name: loan?.name || '',
    lender: loan?.lender || '',
    emi: loan?.emi ? String(loan.emi) : '',
    tenure: loan ? String(loan.tenure) : '',
    paidBefore: loan?.paidBefore ? String(loan.paidBefore) : '',
    startMonth: loan?.startMonth || monthOf(today),
    dueDay: String(loan?.dueDay || 5),
    rate: loan?.rate ? String(loan.rate) : '',
    principal: loan?.principal ? String(loan.principal) : '',
    accountId: loan ? loan.accountId : state.accounts.find((a) => a.kind === 'salary' || a.kind === 'savings')?.id || '',
    color: loan?.color || TONES[(state.loans.length + 8) % TONES.length],
  }))
  const [tried, setTried] = useState(false)
  const errors = tried ? validate(draft) : {}
  const set = (patch) => setDraft((value) => ({ ...value, ...patch }))
  const n = readNumbers(draft)

  const suggestedEmi = n.tenure >= 1 ? emiFor(n.principal, n.rate, n.tenure) : null
  const due = duesSoFar(draft.startMonth, n.dueDay || 1, today)
  const suggestedPaid = n.tenure >= 1 ? Math.min(n.tenure, Math.max(0, due - logged)) : null
  const preview = buildPreview(n, draft.startMonth, payments)

  const save = () => {
    const found = validate(draft)
    if (Object.keys(found).length) {
      setTried(true)
      const node = form.current
      requestAnimationFrame(() => node?.querySelector('.is-invalid input, .is-invalid select')?.focus())
      return
    }
    const record = {
      id: loan?.id || uid('l'),
      name: draft.name.trim(),
      lender: draft.lender.trim(),
      emi: round2(n.emi),
      tenure: n.tenure,
      paidBefore: n.paidBefore,
      startMonth: draft.startMonth,
      dueDay: n.dueDay,
      rate: n.rate,
      principal: round2(n.principal),
      accountId: draft.accountId,
      color: draft.color,
    }
    dispatch({ type: loan ? 'loan/update' : 'loan/add', loan: record })
    ui.toast(loan ? `${record.name} updated` : `${record.name} added. Tap “Mark paid” each month.`, { tone: 'coral' })
    onDone()
  }

  const remove = () => {
    dispatch({ type: 'loan/delete', id: loan.id })
    ui.toast(`${loan.name} removed. EMI entries stay in your history.`, { tone: 'rose' })
    onDone()
  }

  return (
    <form
      ref={form}
      className="g-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <div className="g-form__grid">
        <Field label="Loan name" error={errors.name}>
          {(id, describedBy) => (
            <input
              id={id}
              className="g-input"
              value={draft.name}
              maxLength={40}
              placeholder="e.g. Bike loan, iPhone EMI"
              autoComplete="off"
              autoFocus={!loan}
              aria-describedby={describedBy}
              aria-invalid={Boolean(errors.name) || undefined}
              onChange={(event) => set({ name: event.target.value })}
            />
          )}
        </Field>
        <Field label="Lender">
          {(id, describedBy) => (
            <input
              id={id}
              className="g-input"
              value={draft.lender}
              maxLength={40}
              placeholder="e.g. Bajaj Finance"
              autoComplete="off"
              aria-describedby={describedBy}
              onChange={(event) => set({ lender: event.target.value })}
            />
          )}
        </Field>
      </div>

      <Field label="EMI amount" error={errors.emi}>
        {(id, describedBy) => (
          <AmountInput
            id={id}
            value={draft.emi}
            onChange={(emi) => set({ emi })}
            describedBy={describedBy}
            invalid={Boolean(errors.emi)}
            size="md"
          />
        )}
      </Field>

      <div className="g-form__grid g-form__grid--3">
        <Field label="Tenure (months)" error={errors.tenure}>
          {(id, describedBy) => (
            <input
              id={id}
              className="g-input g-input--mono"
              value={draft.tenure}
              inputMode="numeric"
              placeholder="24"
              autoComplete="off"
              aria-describedby={describedBy}
              aria-invalid={Boolean(errors.tenure) || undefined}
              onChange={(event) => set({ tenure: event.target.value.replace(/\D/g, '').slice(0, 3) })}
            />
          )}
        </Field>
        <Field label="First EMI month" error={errors.startMonth}>
          {(id, describedBy) => (
            <input
              id={id}
              type="month"
              className="g-input g-input--date"
              value={draft.startMonth}
              aria-describedby={describedBy}
              aria-invalid={Boolean(errors.startMonth) || undefined}
              onChange={(event) => set({ startMonth: event.target.value })}
            />
          )}
        </Field>
        <Field label="Due on day" error={errors.dueDay}>
          {(id, describedBy) => (
            <input
              id={id}
              className="g-input g-input--mono"
              value={draft.dueDay}
              inputMode="numeric"
              placeholder="5"
              autoComplete="off"
              aria-describedby={describedBy}
              aria-invalid={Boolean(errors.dueDay) || undefined}
              onChange={(event) => set({ dueDay: event.target.value.replace(/\D/g, '').slice(0, 2) })}
            />
          )}
        </Field>
      </div>

      <Field
        label={logged ? 'EMIs paid before you logged them here' : 'EMIs already paid'}
        hint={
          logged
            ? `${plural(logged, 'EMI')} logged in Gullak are counted on top of this.`
            : 'Started this loan a while ago? Count the EMIs already gone.'
        }
        error={errors.paidBefore}
      >
        {(id, describedBy) => (
          <div className="g-inline">
            <input
              id={id}
              className="g-input g-input--mono g-input--short"
              value={draft.paidBefore}
              inputMode="numeric"
              placeholder="0"
              autoComplete="off"
              aria-describedby={describedBy}
              aria-invalid={Boolean(errors.paidBefore) || undefined}
              onChange={(event) => set({ paidBefore: event.target.value.replace(/\D/g, '').slice(0, 3) })}
            />
            {suggestedPaid > 0 && String(suggestedPaid) !== draft.paidBefore && (
              <button type="button" className="g-chip g-chip--quick" onClick={() => set({ paidBefore: String(suggestedPaid) })}>
                <LuWandSparkles className="g-chip__icon" aria-hidden="true" />
                <span className="g-chip__label">Use {suggestedPaid}</span>
                <span className="g-chip__hint">from the start month</span>
              </button>
            )}
          </div>
        )}
      </Field>

      <details className="g-details" open={Boolean(loan?.principal || loan?.rate)}>
        <summary>Principal, interest &amp; EMI calculator</summary>
        <div className="g-form__grid">
          <Field label="Loan amount (principal)" error={errors.principal}>
            {(id, describedBy) => (
              <AmountInput
                id={id}
                value={draft.principal}
                onChange={(principal) => set({ principal })}
                describedBy={describedBy}
                invalid={Boolean(errors.principal)}
                size="sm"
              />
            )}
          </Field>
          <Field label="Interest rate (% a year)" error={errors.rate}>
            {(id, describedBy) => (
              <input
                id={id}
                className="g-input g-input--mono"
                value={draft.rate}
                inputMode="decimal"
                placeholder="10.5"
                autoComplete="off"
                aria-describedby={describedBy}
                aria-invalid={Boolean(errors.rate) || undefined}
                onChange={(event) => set({ rate: event.target.value.replace(/[^\d.]/g, '').slice(0, 6) })}
              />
            )}
          </Field>
        </div>
        {suggestedEmi !== null && (
          <p className="g-owe-hint">
            <LuCalculator aria-hidden="true" /> At this rate the EMI works out to <Money value={suggestedEmi} paise />
            {round2(n.emi) !== suggestedEmi && (
              <button type="button" className="g-link" onClick={() => set({ emi: String(suggestedEmi) })}>
                Use it
              </button>
            )}
          </p>
        )}
      </details>

      {state.accounts.length > 0 && (
        <Field label="Paid from" hint="EMIs you mark as paid come out of this account.">
          {(id, describedBy) => (
            <select
              id={id}
              className="g-input g-select"
              value={draft.accountId}
              aria-describedby={describedBy}
              onChange={(event) => set({ accountId: event.target.value })}
            >
              <option value="">Not linked to an account</option>
              {state.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                  {account.last4 ? ` ••${account.last4}` : ''}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}

      <TonePicker value={draft.color} onChange={(color) => set({ color })} legend="Ticket colour" />

      {preview && (
        <div className="g-loan-preview" style={toneVar(draft.color)}>
          <dl className="g-loan-preview__grid">
            <div>
              <dt>Total payable</dt>
              <dd>
                <Money value={preview.total} />
              </dd>
            </div>
            <div>
              <dt>Paid · {preview.paidCount}</dt>
              <dd>
                <Money value={preview.paid} />
              </dd>
            </div>
            <div>
              <dt>Still left</dt>
              <dd>
                <Money value={preview.left} />
              </dd>
            </div>
            <div>
              <dt>Last EMI</dt>
              <dd>{monthLabel(preview.end, 'short')}</dd>
            </div>
          </dl>
          {preview.interest !== null && preview.interest > 0 && (
            <p className="g-loan-preview__note">
              Interest over the whole loan: {ui.privacy ? 'hidden' : formatINR(preview.interest)}
            </p>
          )}
        </div>
      )}

      <FormActions>
        {loan && (
          <HoldButton tone="rose" icon={LuTrash2} onConfirm={remove} className="g-form__danger">
            Hold to remove
          </HoldButton>
        )}
        <button type="button" className="g-btn g-btn--ghost g-press" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="g-btn g-btn--ink g-press">
          {loan ? 'Save changes' : 'Add loan'}
        </button>
      </FormActions>
    </form>
  )
}
