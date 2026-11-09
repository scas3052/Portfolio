import { useMemo } from 'react'
import {
  LuArrowRight,
  LuBadgeCheck,
  LuClock,
  LuGoal,
  LuPencil,
  LuPiggyBank,
  LuPlus,
  LuSlidersHorizontal,
  LuTarget,
} from 'react-icons/lu'
import { EmptyState, IconBadge, ProgressBar, Sticker, Tile, ViewHeader } from '../components/bits'
import { Money, Odometer } from '../components/Money'
import WaveGauge from '../components/WaveGauge'
import { cx, toneVar } from '../lib/cx'
import { daysInMonth, monthLabel, shortMonth } from '../lib/dates'
import { formatPercent, plural, round2 } from '../lib/format'
import { hrefFor } from '../lib/router'
import { budgetStatus, goalPlan, summarize, txnsInMonth } from '../lib/selectors'
import { useFinance, useUi } from '../store/contexts'

const budgetTone = (ratio) => (ratio > 1 ? 'rose' : ratio >= 0.8 ? 'butter' : 'mint')

function GoalCard({ goal, index }) {
  const { today } = useFinance()
  const { openSheet } = useUi()
  const plan = goalPlan(goal, today)
  const tone = goal.color || 'lilac'

  return (
    <article
      className={cx('g-goal', plan.done && 'is-done', plan.late && 'is-late')}
      style={{ '--i': index, ...toneVar(tone) }}
      aria-labelledby={`g-goal-${goal.id}`}
    >
      <WaveGauge value={plan.progress} tone={tone} label={`${formatPercent(plan.progress)} saved`} className="g-goal__jar" />
      <div className="g-goal__body">
        <h3 id={`g-goal-${goal.id}`} className="g-goal__name">
          {goal.name}
        </h3>
        <p className="g-goal__amounts">
          <Money value={goal.saved} /> <span className="g-muted">of</span> <Money value={goal.target} />
        </p>
        <p className="g-goal__pct">{formatPercent(plan.progress)}</p>
        {plan.done && (
          <Sticker tone="mint" rotate={-5}>
            <LuBadgeCheck aria-hidden="true" /> Done!
          </Sticker>
        )}
        {plan.late && (
          <Sticker tone="rose" rotate={3}>
            <LuClock aria-hidden="true" /> Past {monthLabel(goal.deadline, 'short')}
          </Sticker>
        )}
        {!plan.done && !plan.late && (
          <p className="g-goal__plan">
            {plan.perMonth ? (
              <>
                Put away <Money value={plan.perMonth} /> a month to make it by {monthLabel(goal.deadline, 'short')}.
              </>
            ) : (
              <>
                <Money value={plan.remaining} /> to go. No deadline, no pressure.
              </>
            )}
          </p>
        )}
      </div>
      <div className="g-goal__actions">
        {!plan.done && (
          <button
            type="button"
            className="g-btn g-btn--ink g-press"
            onClick={() => openSheet('contribute', { goalId: goal.id })}
          >
            <LuPiggyBank aria-hidden="true" /> Add money
          </button>
        )}
        <button
          type="button"
          className="g-icon-btn g-press"
          onClick={() => openSheet('goal', { goal })}
          aria-label={`Edit ${goal.name}`}
        >
          <LuPencil aria-hidden="true" />
        </button>
      </div>
    </article>
  )
}

export default function Plan() {
  const { state, today } = useFinance()
  const { month, currentMonth, openSheet } = useUi()

  const summary = useMemo(() => summarize(txnsInMonth(state.transactions, month)), [state.transactions, month])
  const budgets = useMemo(() => budgetStatus(state.budgets, summary.byCategory), [state.budgets, summary.byCategory])

  const budgeted = round2(budgets.reduce((sum, row) => sum + row.limit, 0))
  const spentInBudgets = round2(budgets.reduce((sum, row) => sum + row.spent, 0))
  const unbudgeted = round2(
    Object.entries(summary.byCategory).reduce(
      (sum, [id, amount]) => (id === 'emi' || state.budgets[id] ? sum : sum + amount),
      0,
    ),
  )
  const left = round2(budgeted - spentInBudgets)
  const live = month === currentMonth
  const daysLeft = live ? daysInMonth(month) - Number(today.slice(8, 10)) + 1 : 0
  const perDay = live && left > 0 ? round2(left / daysLeft) : 0
  const overCount = budgets.filter((row) => row.over).length

  const savedTotal = round2(state.goals.reduce((sum, goal) => sum + goal.saved, 0))
  const targetTotal = round2(state.goals.reduce((sum, goal) => sum + goal.target, 0))

  const setBudgets = (
    <button type="button" className="g-btn g-press" onClick={() => openSheet('budget')}>
      <LuSlidersHorizontal aria-hidden="true" /> {budgets.length ? 'Edit budgets' : 'Set budgets'}
    </button>
  )
  const newGoal = (
    <button type="button" className="g-btn g-btn--ink g-press" onClick={() => openSheet('goal')}>
      <LuPlus aria-hidden="true" /> New goal
    </button>
  )

  return (
    <div className="g-view g-plan">
      <ViewHeader
        title="Plan"
        tone="lilac"
        sub={`Budgets for ${monthLabel(month)} and the things you’re saving up for.`}
        actions={
          <>
            {setBudgets}
            {newGoal}
          </>
        }
      />

      <div className="g-bento">
        <Tile
          span={5}
          index={0}
          tone="lilac"
          icon={LuTarget}
          kicker={live ? 'Left to spend this month' : `${monthLabel(month)}, closed`}
          title="Budget"
          className="g-hero"
        >
          {budgets.length > 0 ? (
            <>
              <Odometer value={left} tone={left < 0 ? 'neg' : undefined} className="g-hero__value" />
              <ProgressBar
                value={budgeted > 0 ? spentInBudgets / budgeted : 0}
                tone={budgetTone(budgeted > 0 ? spentInBudgets / budgeted : 0)}
                label="Share of the budget spent"
                size="lg"
              />
              <dl className="g-stats g-stats--wide">
                <div>
                  <dt>Budgeted</dt>
                  <dd>
                    <Money value={budgeted} />
                  </dd>
                </div>
                <div>
                  <dt>Spent</dt>
                  <dd>
                    <Money value={spentInBudgets} />
                  </dd>
                </div>
                {live && (
                  <div className="g-stats__total">
                    <dt>Safe to spend</dt>
                    <dd>
                      {perDay > 0 ? (
                        <>
                          <Money value={perDay} /> <small>a day for {plural(daysLeft, 'day')}</small>
                        </>
                      ) : (
                        'Nothing left'
                      )}
                    </dd>
                  </div>
                )}
                {unbudgeted > 0 && (
                  <div>
                    <dt>Outside budgets</dt>
                    <dd>
                      <Money value={unbudgeted} />
                    </dd>
                  </div>
                )}
              </dl>
              {overCount > 0 && (
                <Sticker tone="rose" rotate={2}>
                  {plural(overCount, 'budget')} over
                </Sticker>
              )}
            </>
          ) : (
            <EmptyState
              compact
              icon={LuTarget}
              title="No budgets yet"
              body="Give a few categories a monthly limit and see how much is safe to spend each day."
              action={setBudgets}
            />
          )}
        </Tile>

        <Tile
          span={7}
          index={1}
          icon={LuSlidersHorizontal}
          kicker={`${shortMonth(month)} · fullest first`}
          title="By category"
        >
          {budgets.length > 0 ? (
            <ul key={month} className="g-budgets">
              {budgets.map((row, i) => (
                <li key={row.id} className={cx('g-budgets__row', row.over && 'is-over')} style={{ '--i': i }}>
                  <IconBadge icon={row.meta.icon} tone={row.meta.tone} size="sm" />
                  <a className="g-budgets__name" href={hrefFor('spending', { cat: row.id })}>
                    {row.meta.label}
                    <LuArrowRight aria-hidden="true" />
                  </a>
                  <span className="g-budgets__nums">
                    <Money value={row.spent} /> <span className="g-muted">/</span> <Money value={row.limit} compact />
                  </span>
                  <ProgressBar value={row.ratio} tone={budgetTone(row.ratio)} label={`${row.meta.label} budget used`} />
                  <span className={cx('g-budgets__left', row.over && 'is-over')}>
                    {row.over ? (
                      <>
                        <Money value={-row.left} /> over
                      </>
                    ) : (
                      <>
                        <Money value={row.left} /> left
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact icon={LuSlidersHorizontal} title="Nothing to track yet" />
          )}
        </Tile>
      </div>

      <section className="g-shelf" aria-labelledby="g-shelf-goals">
        <div className="g-shelf__head">
          <h2 id="g-shelf-goals" className="g-shelf__title">
            <LuGoal aria-hidden="true" /> Saving for
          </h2>
          {state.goals.length > 0 && (
            <p className="g-shelf__meta">
              <Money value={savedTotal} /> <span className="g-muted">saved of</span> <Money value={targetTotal} />
            </p>
          )}
        </div>
        {state.goals.length > 0 ? (
          <div className="g-goals">
            {state.goals.map((goal, i) => (
              <GoalCard key={goal.id} goal={goal} index={i} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={LuPiggyBank}
            title="No goals yet"
            body="A trip, a phone, an emergency fund. Give it a target and a month, and Gullak tells you what to put away."
            action={newGoal}
          />
        )}
      </section>
    </div>
  )
}
