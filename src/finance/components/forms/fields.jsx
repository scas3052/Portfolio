import { useId } from 'react'
import { TONES } from '../../lib/categories'
import { evaluate, isExpression } from '../../lib/calc'
import { cx, toneVar } from '../../lib/cx'
import { addDays } from '../../lib/dates'
import { formatINR } from '../../lib/format'

/** Label + control + hint/error. `children(id, describedBy)` renders the control. */
export function Field({ label, hint, error, className, children }) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined
  return (
    <div className={cx('g-field', error && 'is-invalid', className)}>
      <label className="g-field__label" htmlFor={id}>
        {label}
      </label>
      {children(id, describedBy)}
      {hint && (
        <p id={hintId} className="g-field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="g-field__error">
          {error}
        </p>
      )}
    </div>
  )
}

/** A group of related controls (chips, swatches) under one caption. */
export function FieldSet({ legend, hint, error, hideLegend, className, children }) {
  return (
    <fieldset className={cx('g-fieldset', error && 'is-invalid', className)}>
      <legend className={cx('g-field__label', hideLegend && 'sr-only')}>{legend}</legend>
      {children}
      {hint && <p className="g-field__hint">{hint}</p>}
      {error && <p className="g-field__error">{error}</p>}
    </fieldset>
  )
}

const OPS = [
  { key: '+', label: 'plus' },
  { key: '−', label: 'minus' },
  { key: '×', label: 'times' },
  { key: '÷', label: 'divided by' },
]

/** Big rupee input that doubles as a calculator: "120+80", "1,500/3", "12x40". */
export function AmountInput({ id, value, onChange, describedBy, invalid, autoFocus, size = 'lg', onEnter }) {
  const result = isExpression(value) ? evaluate(value) : null
  return (
    <div className={cx('g-amount', `g-amount--${size}`, invalid && 'is-invalid')}>
      <span className="g-amount__rupee" aria-hidden="true">
        ₹
      </span>
      <input
        id={id}
        className="g-amount__input"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        placeholder="0"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => {
          if (result !== null && result > 0) onChange(String(result))
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && onEnter) onEnter(event)
        }}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        autoFocus={autoFocus}
      />
      {result !== null && (
        <output className="g-amount__calc" htmlFor={id}>
          = {formatINR(result)}
        </output>
      )}
      <span className="g-amount__ops">
        {OPS.map((op) => (
          <button
            key={op.key}
            type="button"
            tabIndex={-1}
            className="g-amount__op"
            aria-label={op.label}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => onChange(`${value}${op.key}`)}
          >
            {op.key}
          </button>
        ))}
      </span>
    </div>
  )
}

/** Today / Yesterday shortcuts next to a regular date input. */
export function DateChips({ id, value, onChange, today, describedBy }) {
  const yesterday = addDays(today, -1)
  return (
    <div className="g-datechips">
      <button
        type="button"
        className={cx('g-chip', value === today && 'is-active')}
        aria-pressed={value === today}
        onClick={() => onChange(today)}
      >
        Today
      </button>
      <button
        type="button"
        className={cx('g-chip', value === yesterday && 'is-active')}
        aria-pressed={value === yesterday}
        onClick={() => onChange(yesterday)}
      >
        Yesterday
      </button>
      <input
        id={id}
        type="date"
        className="g-input g-input--date"
        value={value}
        onChange={(event) => {
          if (event.target.value) onChange(event.target.value)
        }}
        aria-describedby={describedBy}
      />
    </div>
  )
}

/** Radio buttons dressed up as chips. Options: { value, label, icon, tone, hint }. */
export function ChipGroup({ legend, options, value, onChange, hint, error, hideLegend, variant, className }) {
  const name = useId()
  return (
    <FieldSet legend={legend} hint={hint} error={error} hideLegend={hideLegend} className={className}>
      <div className={cx('g-chips', variant && `g-chips--${variant}`)}>
        {options.map((option) => {
          const Icon = option.icon
          const checked = option.value === value
          return (
            <label
              key={option.value}
              className={cx('g-chip', checked && 'is-active', option.tone && 'g-chip--tone')}
              style={toneVar(option.tone)}
            >
              <input
                className="sr-only"
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
              />
              {Icon && <Icon className="g-chip__icon" aria-hidden="true" />}
              <span className="g-chip__label">{option.label}</span>
              {option.hint && <span className="g-chip__hint">{option.hint}</span>}
            </label>
          )
        })}
      </div>
    </FieldSet>
  )
}

export function TonePicker({ value, onChange, legend = 'Colour' }) {
  const name = useId()
  return (
    <FieldSet legend={legend}>
      <div className="g-swatches">
        {TONES.map((tone) => (
          <label key={tone} className={cx('g-swatch', value === tone && 'is-active')} style={toneVar(tone)}>
            <input
              className="sr-only"
              type="radio"
              name={name}
              value={tone}
              checked={value === tone}
              onChange={() => onChange(tone)}
            />
            <span className="g-swatch__dot" aria-hidden="true" />
            <span className="sr-only">{tone}</span>
          </label>
        ))}
      </div>
    </FieldSet>
  )
}

export function FormActions({ children }) {
  return <div className="g-form__actions">{children}</div>
}
