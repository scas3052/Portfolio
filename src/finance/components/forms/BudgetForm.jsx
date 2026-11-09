import { useId, useState } from 'react'
import { LuEraser, LuWandSparkles } from 'react-icons/lu'
import { evaluate } from '../../lib/calc'
import { EXPENSE_CATEGORIES } from '../../lib/categories'
import { cx } from '../../lib/cx'
import { addMonths, monthOf } from '../../lib/dates'
import { formatINR, formatPercent, MASK, plural, round2 } from '../../lib/format'
import { useFinance, useUi } from '../../store/contexts'
import { IconBadge } from '../bits'
import { Money } from '../Money'
import { AmountInput, FormActions } from './fields'

/** Average spend per category over the last 3 full months that have data (else this month so far). */
function spendingAverages(transactions, today) {
  const current = monthOf(today)
  const window = new Set([1, 2, 3].map((i) => addMonths(current, -i)))
  const pick = (months) => {
    const sums = {}
    const seen = new Set()
    let income = 0
    for (const t of transactions) {
      const month = t.date.slice(0, 7)
      if (!months.has(month)) continue
      if (t.type === 'expense') {
        seen.add(month)
        const key = t.category || 'other'
        sums[key] = (sums[key] || 0) + t.amount
      } else if (t.type === 'income') income += t.amount
    }
    return { sums, income, count: seen.size }
  }
  let result = pick(window)
  let basis = result.count ? `last ${plural(result.count, 'month')}` : ''
  if (!result.count) {
    result = pick(new Set([current]))
    basis = result.count ? 'this month so far' : ''
  }
  const divisor = Math.max(1, result.count)
  const byCat = {}
  for (const [id, sum] of Object.entries(result.sums)) byCat[id] = round2(sum / divisor)
  return { byCat, income: round2(result.income / divisor), basis }
}

const roundUp = (value) => (value < 100 ? Math.ceil(value / 10) * 10 : Math.ceil(value / 100) * 100)

const parse = (text) => (text.trim() ? evaluate(text) : 0)

/** One limit per spending category. Empty means "no budget". */
export default function BudgetForm({ onDone }) {
  const { state, dispatch, today } = useFinance()
  const ui = useUi()
  const base = useId()
  const [draft, setDraft] = useState(() =>
    Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.id, state.budgets[c.id] ? String(state.budgets[c.id]) : ''])),
  )
  const [tried, setTried] = useState(false)
  const averages = spendingAverages(state.transactions, today)
  const values = Object.fromEntries(Object.entries(draft).map(([id, text]) => [id, parse(text)]))
  const invalid = Object.entries(values).filter(([, value]) => value === null || value < 0).map(([id]) => id)
  const total = round2(Object.values(values).reduce((sum, value) => sum + (value > 0 ? value : 0), 0))
  const setOne = (id, text) => setDraft((value) => ({ ...value, [id]: text }))
  const hasAverages = Object.keys(averages.byCat).length > 0

  const suggest = () => {
    setDraft((value) => {
      const next = { ...value }
      for (const category of EXPENSE_CATEGORIES) {
        const avg = averages.byCat[category.id]
        if (avg > 0) next[category.id] = String(roundUp(avg))
      }
      return next
    })
    ui.toast(`Filled from your spending (${averages.basis}). Tweak anything that looks off.`, { tone: 'lilac' })
  }

  const save = () => {
    if (invalid.length) {
      setTried(true)
      requestAnimationFrame(() => document.getElementById(`${base}-${invalid[0]}`)?.focus())
      return
    }
    const budgets = Object.fromEntries(Object.entries(values).filter(([, value]) => value > 0).map(([id, value]) => [id, round2(value)]))
    const previous = state.budgets
    dispatch({ type: 'budget/replaceAll', budgets })
    const count = Object.keys(budgets).length
    ui.toast(count ? `Saved ${plural(count, 'budget')}` : 'All budgets cleared', {
      tone: 'lilac',
      action: { label: 'Undo', run: () => dispatch({ type: 'budget/replaceAll', budgets: previous }) },
    })
    onDone()
  }

  return (
    <form
      className="g-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <div className="g-budgets__tools">
        <p className="g-form__note">
          Set a monthly limit for the categories you want to watch. Leave the rest empty.
        </p>
        <div className="g-budgets__buttons">
          <button type="button" className="g-btn g-btn--sm g-press" style={{ '--tone': 'var(--lilac)' }} onClick={suggest} disabled={!hasAverages}>
            <LuWandSparkles aria-hidden="true" /> Suggest from my spending
          </button>
          <button
            type="button"
            className="g-btn g-btn--sm g-btn--ghost g-press"
            onClick={() => setDraft((value) => Object.fromEntries(Object.keys(value).map((id) => [id, ''])))}
          >
            <LuEraser aria-hidden="true" /> Clear all
          </button>
        </div>
      </div>

      <ul className="g-budgets" role="list">
        {EXPENSE_CATEGORIES.map((category) => {
          const id = `${base}-${category.id}`
          const avg = averages.byCat[category.id]
          const bad = tried && invalid.includes(category.id)
          return (
            <li key={category.id} className={cx('g-budgets__row', draft[category.id] && 'is-set', bad && 'is-invalid')}>
              <IconBadge icon={category.icon} tone={category.tone} size="sm" />
              <div className="g-budgets__text">
                <label className="g-budgets__label" htmlFor={id}>
                  {category.label}
                </label>
                {avg > 0 ? (
                  <button
                    type="button"
                    className="g-budgets__avg"
                    onClick={() => setOne(category.id, String(roundUp(avg)))}
                    aria-label={`Use your average for ${category.label}`}
                  >
                    avg {ui.privacy ? MASK : formatINR(avg, { paise: false })}/mo
                  </button>
                ) : (
                  <span className="g-budgets__avg is-quiet">no recent spends</span>
                )}
              </div>
              <AmountInput
                id={id}
                value={draft[category.id]}
                onChange={(text) => setOne(category.id, text)}
                invalid={bad}
                size="sm"
              />
            </li>
          )
        })}
      </ul>

      <div className="g-budgets__total" aria-live="polite">
        <span>Total monthly budget</span>
        <strong>
          <Money value={total} />
        </strong>
        {averages.income > 0 && total > 0 && (
          <span className="g-budgets__share">
            {formatPercent(total / averages.income)} of your usual income
          </span>
        )}
      </div>
      {tried && invalid.length > 0 && (
        <p className="g-field__error" role="alert">
          Fix the highlighted {invalid.length === 1 ? 'amount' : 'amounts'} first.
        </p>
      )}

      <FormActions>
        <button type="button" className="g-btn g-btn--ghost g-press" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="g-btn g-btn--ink g-press">
          Save budgets
        </button>
      </FormActions>
    </form>
  )
}
