import { useState } from 'react'
import { LuArrowDownToLine, LuArrowUpFromLine, LuGhost } from 'react-icons/lu'
import { evaluate } from '../../lib/calc'
import { cx, toneVar } from '../../lib/cx'
import { formatINR, formatPercent, round2 } from '../../lib/format'
import { goalPlan } from '../../lib/selectors'
import { useFinance, useUi } from '../../store/contexts'
import { EmptyState, Segmented } from '../bits'
import { Money } from '../Money'
import WaveGauge from '../WaveGauge'
import { AmountInput, Field, FormActions } from './fields'

const MODES = [
  { value: 'in', label: 'Add money', icon: LuArrowDownToLine, tone: 'mint' },
  { value: 'out', label: 'Take out', icon: LuArrowUpFromLine, tone: 'peach' },
]

/** Drop money into a goal jar (or take some back out). */
export default function ContributeForm({ goalId, onDone }) {
  const { state, dispatch, today } = useFinance()
  const ui = useUi()
  const goal = state.goals.find((g) => g.id === goalId)
  const [mode, setMode] = useState('in')
  const [text, setText] = useState('')
  const [tried, setTried] = useState(false)

  if (!goal) {
    return (
      <EmptyState
        icon={LuGhost}
        title="This goal is gone"
        body="It may have been removed in another tab."
        action={
          <button type="button" className="g-btn g-btn--ink g-press" onClick={onDone}>
            Close
          </button>
        }
      />
    )
  }

  const plan = goalPlan(goal, today)
  const amount = text.trim() ? evaluate(text) : null
  const signed = amount > 0 ? (mode === 'in' ? amount : -amount) : 0
  const next = round2(Math.max(0, goal.saved + signed))
  const ratio = goal.target > 0 ? next / goal.target : 0
  const reached = goal.target > 0 && next >= goal.target
  let error = ''
  if (!(amount > 0)) error = 'Enter an amount.'
  else if (mode === 'out' && amount > goal.saved + 0.004) error = `Only ${ui.privacy ? 'what’s saved' : formatINR(goal.saved)} is in the jar.`
  const shownError = tried ? error : ''

  const quick = [
    mode === 'in' && plan.perMonth ? { label: 'Monthly share', value: plan.perMonth } : null,
    mode === 'in' && plan.remaining > 0 ? { label: 'Fill it up', value: plan.remaining } : null,
    mode === 'out' && goal.saved > 0 ? { label: 'Everything', value: goal.saved } : null,
    { label: '₹500', value: 500 },
    { label: '₹1,000', value: 1000 },
    { label: '₹5,000', value: 5000 },
  ].filter(Boolean)

  const save = () => {
    if (error) {
      setTried(true)
      return
    }
    dispatch({ type: 'goal/contribute', id: goal.id, amount: signed })
    if (reached && goal.saved < goal.target) ui.celebrate('goal', goal.name)
    const words = ui.privacy ? (mode === 'in' ? 'Money added to' : 'Money taken out of') : mode === 'in' ? `${formatINR(amount)} added to` : `${formatINR(amount)} taken out of`
    ui.toast(`${words} ${goal.name}`, {
      tone: mode === 'in' ? 'mint' : 'peach',
      action: { label: 'Undo', run: () => dispatch({ type: 'goal/contribute', id: goal.id, amount: -signed }) },
    })
    onDone()
  }

  return (
    <form
      className="g-form g-contribute"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <div className="g-contribute__jar" style={toneVar(goal.color)}>
        <WaveGauge value={ratio} tone={goal.color} label={`${goal.name} jar after this: ${formatPercent(ratio)} full`} />
        <div className="g-contribute__meta">
          <p className="g-kicker">{goal.name}</p>
          <p className="g-contribute__now">
            <Money value={next} /> <span>of</span> <Money value={goal.target} />
          </p>
          <p className={cx('g-contribute__pct', reached && 'is-done')}>
            {reached ? 'Target reached' : `${formatPercent(ratio)} of the way`}
          </p>
        </div>
      </div>

      <Segmented options={MODES} value={mode} onChange={setMode} label="Direction" className="g-seg--wide" />

      <Field label={mode === 'in' ? 'How much are you putting in?' : 'How much are you taking out?'} error={shownError}>
        {(id, describedBy) => (
          <AmountInput
            id={id}
            value={text}
            onChange={setText}
            describedBy={describedBy}
            invalid={Boolean(shownError)}
            autoFocus
          />
        )}
      </Field>

      <div className="g-chips" aria-label="Quick amounts">
        {quick.map((option) => (
          <button
            key={option.label}
            type="button"
            className={cx('g-chip g-chip--quick', amount === round2(option.value) && 'is-active')}
            onClick={() => setText(String(round2(option.value)))}
          >
            <span className="g-chip__label">{option.label}</span>
            {!option.label.startsWith('₹') && !ui.privacy && (
              <span className="g-chip__hint">{formatINR(option.value, { paise: false })}</span>
            )}
          </button>
        ))}
      </div>

      <FormActions>
        <button type="button" className="g-btn g-btn--ghost g-press" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="g-btn g-btn--ink g-press">
          {mode === 'in' ? 'Drop it in' : 'Take it out'}
        </button>
      </FormActions>
    </form>
  )
}
