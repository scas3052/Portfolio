import { useRef, useState } from 'react'
import { LuTarget, LuTrash2 } from 'react-icons/lu'
import { evaluate } from '../../lib/calc'
import { TONES } from '../../lib/categories'
import { toneVar } from '../../lib/cx'
import { isMonth, monthLabel, monthOf } from '../../lib/dates'
import { plural, round2 } from '../../lib/format'
import { uid } from '../../lib/id'
import { goalPlan } from '../../lib/selectors'
import { useFinance, useUi } from '../../store/contexts'
import { HoldButton } from '../bits'
import { Money } from '../Money'
import WaveGauge from '../WaveGauge'
import { AmountInput, Field, FormActions, TonePicker } from './fields'

const IDEAS = ['Emergency fund', 'New phone', 'Trip to Goa', 'Laptop', 'Bike', 'Wedding gift']

function readNumbers(draft) {
  return {
    target: evaluate(draft.target),
    saved: draft.saved.trim() ? evaluate(draft.saved) : 0,
  }
}

function validate(draft, currentMonth) {
  const { target, saved } = readNumbers(draft)
  const errors = {}
  if (!draft.name.trim()) errors.name = 'What are you saving for?'
  if (!(target >= 1)) errors.target = 'How much do you need?'
  if (saved === null || saved < 0) errors.saved = 'That doesn’t look like an amount.'
  if (draft.deadline && !isMonth(draft.deadline)) errors.deadline = 'Pick a month, or leave it empty.'
  else if (draft.deadline && draft.deadline < currentMonth) errors.deadline = 'Pick this month or later.'
  return errors
}

/** A savings jar with a target and an optional deadline. */
export default function GoalForm({ goal, onDone }) {
  const { state, dispatch, today } = useFinance()
  const ui = useUi()
  const form = useRef(null)
  const currentMonth = monthOf(today)
  const [draft, setDraft] = useState(() => ({
    name: goal?.name || '',
    target: goal ? String(goal.target) : '',
    saved: goal?.saved ? String(goal.saved) : '',
    deadline: goal?.deadline || '',
    color: goal?.color || TONES[(state.goals.length * 2 + 3) % TONES.length],
  }))
  const [tried, setTried] = useState(false)
  const errors = tried ? validate(draft, currentMonth) : {}
  const set = (patch) => setDraft((value) => ({ ...value, ...patch }))
  const n = readNumbers(draft)
  const ready = n.target >= 1 && n.saved !== null && n.saved >= 0
  const plan = ready ? goalPlan({ target: n.target, saved: n.saved, deadline: isMonth(draft.deadline) ? draft.deadline : '' }, today) : null

  const save = () => {
    const found = validate(draft, currentMonth)
    if (Object.keys(found).length) {
      setTried(true)
      const node = form.current
      requestAnimationFrame(() => node?.querySelector('.is-invalid input')?.focus())
      return
    }
    const record = {
      id: goal?.id || uid('g'),
      name: draft.name.trim(),
      target: round2(n.target),
      saved: round2(n.saved),
      deadline: draft.deadline,
      color: draft.color,
    }
    dispatch({ type: goal ? 'goal/update' : 'goal/add', goal: record })
    const reached = record.saved >= record.target && !(goal && goal.saved >= goal.target)
    if (reached) ui.celebrate('goal', record.name)
    ui.toast(goal ? `${record.name} updated` : `${record.name} jar is ready`, { tone: 'sky' })
    onDone()
  }

  const remove = () => {
    dispatch({ type: 'goal/delete', id: goal.id })
    ui.toast(`${goal.name} removed`, {
      tone: 'rose',
      action: { label: 'Undo', run: () => dispatch({ type: 'goal/add', goal }) },
    })
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
      <Field label="Saving for" error={errors.name}>
        {(id, describedBy) => (
          <input
            id={id}
            className="g-input"
            value={draft.name}
            maxLength={40}
            placeholder="e.g. Emergency fund"
            autoComplete="off"
            autoFocus={!goal}
            aria-describedby={describedBy}
            aria-invalid={Boolean(errors.name) || undefined}
            onChange={(event) => set({ name: event.target.value })}
          />
        )}
      </Field>
      {!goal && !draft.name && (
        <div className="g-chips g-chips--ideas" aria-label="Ideas">
          {IDEAS.map((idea) => (
            <button key={idea} type="button" className="g-chip g-chip--quick" onClick={() => set({ name: idea })}>
              {idea}
            </button>
          ))}
        </div>
      )}

      <div className="g-form__grid">
        <Field label="Target" error={errors.target}>
          {(id, describedBy) => (
            <AmountInput
              id={id}
              value={draft.target}
              onChange={(target) => set({ target })}
              describedBy={describedBy}
              invalid={Boolean(errors.target)}
              size="md"
            />
          )}
        </Field>
        <Field label="Already saved" hint="Optional" error={errors.saved}>
          {(id, describedBy) => (
            <AmountInput
              id={id}
              value={draft.saved}
              onChange={(saved) => set({ saved })}
              describedBy={describedBy}
              invalid={Boolean(errors.saved)}
              size="md"
            />
          )}
        </Field>
      </div>

      <Field label="Deadline" hint="Optional. Gullak works out how much to put away each month." error={errors.deadline}>
        {(id, describedBy) => (
          <div className="g-inline">
            <input
              id={id}
              type="month"
              className="g-input g-input--date"
              value={draft.deadline}
              min={currentMonth}
              aria-describedby={describedBy}
              aria-invalid={Boolean(errors.deadline) || undefined}
              onChange={(event) => set({ deadline: event.target.value })}
            />
            {draft.deadline && (
              <button type="button" className="g-link" onClick={() => set({ deadline: '' })}>
                No deadline
              </button>
            )}
          </div>
        )}
      </Field>

      <TonePicker value={draft.color} onChange={(color) => set({ color })} legend="Jar colour" />

      {plan && (
        <div className="g-goal-preview" style={toneVar(draft.color)} aria-live="polite">
          <WaveGauge value={plan.progress} tone={draft.color} label={`Jar ${Math.round(plan.progress * 100)}% full`} />
          <div className="g-goal-preview__text">
            <p className="g-kicker">
              <LuTarget aria-hidden="true" /> The plan
            </p>
            {plan.done ? (
              <p>Already there. Save it to celebrate!</p>
            ) : plan.perMonth ? (
              <p>
                Put away <Money value={plan.perMonth} /> a month for {plural(plan.monthsLeft, 'month')} to reach it by{' '}
                {monthLabel(draft.deadline, 'short')}.
              </p>
            ) : (
              <p>
                <Money value={plan.remaining} /> to go. Add a deadline to get a monthly target.
              </p>
            )}
          </div>
        </div>
      )}

      <FormActions>
        {goal && (
          <HoldButton tone="rose" icon={LuTrash2} onConfirm={remove} className="g-form__danger">
            Hold to remove
          </HoldButton>
        )}
        <button type="button" className="g-btn g-btn--ghost g-press" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="g-btn g-btn--ink g-press">
          {goal ? 'Save changes' : 'Create goal'}
        </button>
      </FormActions>
    </form>
  )
}
