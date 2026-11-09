import { useId, useState } from 'react'
import { LuKeyRound, LuShieldOff } from 'react-icons/lu'
import { cx } from '../../lib/cx'
import { checkPin, hashPin, PIN_LENGTH } from '../../lib/pin'
import { useFinance, useUi } from '../../store/contexts'
import { Segmented } from '../bits'

const MODES = [
  { value: 'change', label: 'Change PIN', icon: LuKeyRound },
  { value: 'remove', label: 'Remove PIN', icon: LuShieldOff, tone: 'rose' },
]

const PROMPTS = {
  current: 'Enter your current PIN',
  new: `Choose a new ${PIN_LENGTH}-digit PIN`,
  confirm: 'Type it once more to confirm',
}

const tooEasy = (pin) => /^(\d)\1+$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin)

/** A hidden numeric input under four big cells, so phones show the number pad. */
function PinCells({ id, value, onChange, onComplete, wrong, describedBy }) {
  return (
    <div className={cx('g-pinput', wrong && 'is-wrong')}>
      <input
        id={id}
        className="g-pinput__input"
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        maxLength={PIN_LENGTH}
        value={value}
        autoFocus
        aria-describedby={describedBy}
        aria-invalid={wrong || undefined}
        onChange={(event) => {
          const next = event.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH)
          onChange(next)
          if (next.length === PIN_LENGTH) onComplete(next)
        }}
      />
      <div className="g-pinput__cells" aria-hidden="true">
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <span
            key={i}
            className={cx('g-pinput__cell', i < value.length && 'is-filled', i === value.length && 'is-current')}
          />
        ))}
      </div>
    </div>
  )
}

/** Set, change or remove the 4-digit PIN that guards the lock screen. */
export default function PinForm({ onDone }) {
  const { state, dispatch } = useFinance()
  const ui = useUi()
  const pinHash = state.settings.pinHash
  const hasPin = Boolean(pinHash)
  const id = useId()
  const [mode, setMode] = useState('change')
  const [step, setStep] = useState(hasPin ? 'current' : 'new')
  const [value, setValue] = useState('')
  const [first, setFirst] = useState('')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  const steps = hasPin ? (mode === 'remove' ? ['current'] : ['current', 'new', 'confirm']) : ['new', 'confirm']
  const position = steps.indexOf(step) + 1

  const go = (next, message = '') => {
    setStep(next)
    setValue('')
    setError(message)
    setAttempt((n) => n + 1)
  }

  const complete = (pin) => {
    if (step === 'current') {
      if (!checkPin(pin, pinHash)) {
        go('current', 'That’s not your current PIN.')
        return
      }
      if (mode === 'remove') {
        dispatch({ type: 'settings/update', patch: { pinHash: null } })
        ui.toast('PIN removed. Gullak opens without a lock now.', { tone: 'rose' })
        onDone()
        return
      }
      go('new')
      return
    }
    if (step === 'new') {
      if (tooEasy(pin)) {
        go('new', 'Too easy to guess. Try something less obvious.')
        return
      }
      setFirst(pin)
      go('confirm')
      return
    }
    if (pin !== first) {
      setFirst('')
      go('new', 'Those didn’t match. Pick your new PIN again.')
      return
    }
    dispatch({ type: 'settings/update', patch: { pinHash: hashPin(pin) } })
    ui.toast(hasPin ? 'PIN changed' : 'PIN set. Press L any time to lock Gullak.', { tone: 'butter' })
    onDone()
  }

  return (
    <div className="g-form g-pinform">
      {hasPin && (
        <Segmented
          options={MODES}
          value={mode}
          onChange={(next) => {
            setMode(next)
            setFirst('')
            go('current')
          }}
          label="What do you want to do?"
          className="g-seg--wide"
        />
      )}

      <div className="g-pinform__stage">
        <p className="g-kicker">
          Step {position} of {steps.length}
        </p>
        <label className="g-pinform__prompt" htmlFor={id}>
          {PROMPTS[step]}
        </label>
        <PinCells
          key={`${step}-${attempt}`}
          id={id}
          value={value}
          onChange={setValue}
          onComplete={complete}
          wrong={Boolean(error)}
          describedBy={error ? `${id}-error` : `${id}-hint`}
        />
        {error ? (
          <p id={`${id}-error`} className="g-field__error" role="alert">
            {error}
          </p>
        ) : (
          <p id={`${id}-hint`} className="g-field__hint">
            {step === 'current' ? 'Type the 4 digits you use to unlock.' : 'Just 4 digits. It moves on by itself.'}
          </p>
        )}
      </div>

      <p className="g-callout">
        The PIN hides Gullak from people using this device. It isn’t encryption: your data stays in this browser’s
        storage. Gullak also locks itself after 2 minutes in the background.
      </p>

      <div className="g-form__actions">
        <button type="button" className="g-btn g-btn--ghost g-press" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  )
}
