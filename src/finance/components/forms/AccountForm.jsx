import { useRef, useState } from 'react'
import { LuTrash2 } from 'react-icons/lu'
import { evaluate } from '../../lib/calc'
import { nextTone } from '../../agent/commit'
import { ACCOUNT_KINDS, KIND_ICONS } from '../../lib/categories'
import { formatINR, round2 } from '../../lib/format'
import { uid } from '../../lib/id'
import { useFinance, useUi } from '../../store/contexts'
import { HoldButton } from '../bits'
import { AmountInput, ChipGroup, Field, FormActions, TonePicker } from './fields'

const KIND_OPTIONS = ACCOUNT_KINDS.map((kind) => ({ value: kind.id, label: kind.label, icon: KIND_ICONS[kind.id] }))

const NAME_HINT = {
  savings: 'e.g. HDFC Savings',
  salary: 'e.g. ICICI Salary',
  current: 'e.g. Business current',
  wallet: 'e.g. Paytm, PhonePe wallet',
  cash: 'e.g. Cash in hand',
  credit: 'e.g. Amazon Pay card',
}

const hasBank = (kind) => kind !== 'cash'

function validate(draft) {
  const errors = {}
  if (!draft.name.trim()) errors.name = 'Give it a name you’ll recognise.'
  if (draft.balance.trim()) {
    const value = evaluate(draft.balance)
    if (value === null) errors.balance = 'That doesn’t look like an amount.'
    else if (Math.abs(value) >= 1e10) errors.balance = 'That’s a little too big.'
  }
  if (draft.last4 && !/^\d{4}$/.test(draft.last4)) errors.last4 = 'Four digits, or leave it empty.'
  return errors
}

/** Add or edit a bank account, wallet, cash pocket or credit card. `prefill` seeds a new one. */
export default function AccountForm({ account, prefill, onDone, onSaved }) {
  const { state, dispatch, derived } = useFinance()
  const ui = useUi()
  const form = useRef(null)
  const seed = account || prefill
  const current = account ? (derived.balances.get(account.id) ?? account.opening) : Number(prefill?.opening) || 0
  const [draft, setDraft] = useState(() => ({
    name: seed?.name || '',
    kind: seed?.kind || 'savings',
    bank: seed?.bank || '',
    last4: seed?.last4 || '',
    balance: account || current ? String(seed.kind === 'credit' ? round2(-current) : current) : '',
    color: account?.color || nextTone('account', state),
  }))
  const [tried, setTried] = useState(false)
  const errors = tried ? validate(draft) : {}
  const set = (patch) => setDraft((value) => ({ ...value, ...patch }))
  const credit = draft.kind === 'credit'
  const linked = account
    ? state.transactions.filter((t) => t.accountId === account.id || t.toAccountId === account.id).length
    : 0

  const save = () => {
    const found = validate(draft)
    if (Object.keys(found).length) {
      setTried(true)
      const node = form.current
      requestAnimationFrame(() => node?.querySelector('.is-invalid input')?.focus())
      return
    }
    const entered = draft.balance.trim() ? evaluate(draft.balance) : 0
    const target = round2(credit ? -entered : entered)
    const record = {
      id: account?.id || uid('a'),
      name: draft.name.trim(),
      kind: draft.kind,
      bank: hasBank(draft.kind) ? draft.bank.trim() : '',
      last4: hasBank(draft.kind) ? draft.last4 : '',
      // Keep past entries intact: shift the opening balance so today's balance matches.
      opening: account ? round2(account.opening + target - current) : target,
      color: draft.color,
    }
    dispatch({ type: account ? 'account/update' : 'account/add', account: record })
    ui.toast(account ? `${record.name} updated` : `${record.name} added`, { tone: 'butter' })
    onSaved?.(record)
    onDone()
  }

  const remove = () => {
    dispatch({ type: 'account/delete', id: account.id })
    ui.toast(`${account.name} removed. Its entries are kept, just unlinked.`, { tone: 'rose' })
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
      <ChipGroup
        legend="What kind of account?"
        options={KIND_OPTIONS}
        value={draft.kind}
        onChange={(kind) => set({ kind })}
      />

      <Field label="Name" error={errors.name}>
        {(id, describedBy) => (
          <input
            id={id}
            className="g-input"
            value={draft.name}
            maxLength={40}
            placeholder={NAME_HINT[draft.kind]}
            autoComplete="off"
            autoFocus={!account}
            aria-describedby={describedBy}
            aria-invalid={Boolean(errors.name) || undefined}
            onChange={(event) => set({ name: event.target.value })}
          />
        )}
      </Field>

      {hasBank(draft.kind) && (
        <div className="g-form__grid">
          <Field label={draft.kind === 'wallet' ? 'App or provider' : 'Bank'}>
            {(id, describedBy) => (
              <input
                id={id}
                className="g-input"
                value={draft.bank}
                maxLength={40}
                placeholder={draft.kind === 'wallet' ? 'e.g. Paytm' : 'e.g. HDFC Bank'}
                autoComplete="off"
                aria-describedby={describedBy}
                onChange={(event) => set({ bank: event.target.value })}
              />
            )}
          </Field>
          <Field label="Last 4 digits" hint="Optional, helps tell cards apart." error={errors.last4}>
            {(id, describedBy) => (
              <input
                id={id}
                className="g-input g-input--mono"
                value={draft.last4}
                inputMode="numeric"
                maxLength={4}
                placeholder="1234"
                autoComplete="off"
                aria-describedby={describedBy}
                aria-invalid={Boolean(errors.last4) || undefined}
                onChange={(event) => set({ last4: event.target.value.replace(/\D/g, '').slice(0, 4) })}
              />
            )}
          </Field>
        </div>
      )}

      <Field
        label={credit ? 'Amount due on the card right now' : 'Balance right now'}
        hint={
          account
            ? 'Change this to match your bank app. Past entries stay as they are.'
            : credit
              ? 'What you owe today. Spends on this card will add to it.'
              : 'Check your bank app and copy the balance. Use a minus for an overdraft.'
        }
        error={errors.balance}
      >
        {(id, describedBy) => (
          <AmountInput
            id={id}
            value={draft.balance}
            onChange={(balance) => set({ balance })}
            describedBy={describedBy}
            invalid={Boolean(errors.balance)}
            size="md"
          />
        )}
      </Field>

      <TonePicker value={draft.color} onChange={(color) => set({ color })} legend="Card colour" />

      <FormActions>
        {account && (
          <HoldButton tone="rose" icon={LuTrash2} onConfirm={remove} className="g-form__danger">
            Hold to remove
          </HoldButton>
        )}
        {account && linked > 0 && (
          <p className="g-form__note">
            {linked} {linked === 1 ? 'entry uses' : 'entries use'} this account. Removing it keeps them but unlinks them.
          </p>
        )}
        <button type="button" className="g-btn g-btn--ghost g-press" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="g-btn g-btn--ink g-press">
          {account ? 'Save changes' : 'Add account'}
        </button>
      </FormActions>
      {account && !ui.privacy && (
        <p className="g-form__foot">
          Gullak currently shows {formatINR(account.kind === 'credit' ? -current : current)}
          {account.kind === 'credit' ? ' due on this card.' : ' in this account.'}
        </p>
      )}
    </form>
  )
}
