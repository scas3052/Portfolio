import { useMemo } from 'react'
import {
  LuArrowRight,
  LuCalendarRange,
  LuChartPie,
  LuCoins,
  LuListOrdered,
  LuPlus,
  LuReceipt,
  LuShapes,
  LuX,
} from 'react-icons/lu'
import { Delta, EmptyState, IconBadge, ProgressBar, Sticker, Tile, ViewHeader } from '../components/bits'
import Treemap from '../components/charts/Treemap'
import { Money, Odometer } from '../components/Money'
import { TxnMiniList } from '../components/TxnRow'
import { useActions } from '../hooks/useActions'
import { categoryMeta } from '../lib/categories'
import { cx, toneVar } from '../lib/cx'
import { addMonths, daysInMonth, monthLabel, shortMonth, weekday } from '../lib/dates'
import { formatPercent, round2 } from '../lib/format'
import { hrefFor, navigate } from '../lib/router'
import { categoryBreakdown, summarize, txnsInMonth } from '../lib/selectors'
import { useFinance, useUi } from '../store/contexts'

// Monday-first week; `weekday()` returns 0 for Sunday.
const WEEK = [
  { day: 1, label: 'Mon' },
  { day: 2, label: 'Tue' },
  { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' },
  { day: 6, label: 'Sat' },
  { day: 0, label: 'Sun' },
]

function budgetTone(ratio) {
  if (ratio > 1) return 'rose'
  if (ratio > 0.8) return 'butter'
  return 'mint'
}

function pickCategory(id) {
  navigate('spending', id ? { cat: id } : undefined)
}

export default function Spending({ params }) {
  const { state, derived, today } = useFinance()
  const { month, currentMonth } = useUi()
  const { addEntry } = useActions()
  const prevMonth = addMonths(month, -1)

  const monthTxns = useMemo(() => txnsInMonth(derived.sorted, month), [derived.sorted, month])
  const summary = useMemo(() => summarize(monthTxns), [monthTxns])
  const previous = useMemo(
    () => summarize(txnsInMonth(state.transactions, prevMonth)),
    [state.transactions, prevMonth],
  )
  const breakdown = useMemo(
    () => categoryBreakdown(summary.byCategory).filter((item) => item.id !== 'emi'),
    [summary],
  )
  const income = useMemo(() => {
    const totals = new Map()
    for (const txn of monthTxns) {
      if (txn.type !== 'income') continue
      totals.set(txn.category, (totals.get(txn.category) || 0) + txn.amount)
    }
    return [...totals]
      .map(([id, amount]) => ({ id, amount: round2(amount), meta: categoryMeta(id) }))
      .sort((a, b) => b.amount - a.amount)
  }, [monthTxns])
  const rhythm = useMemo(() => {
    const totals = [0, 0, 0, 0, 0, 0, 0]
    for (const txn of monthTxns) if (txn.type === 'expense') totals[weekday(txn.date)] += txn.amount
    return totals.map(round2)
  }, [monthTxns])

  const cat = params?.cat && categoryMeta(params.cat).id === params.cat ? params.cat : ''
  const catMeta = cat ? categoryMeta(cat) : null
  const catEntries = useMemo(
    () =>
      cat
        ? monthTxns.filter((txn) => (cat === 'emi' ? txn.type === 'emi' : txn.type === 'expense' && txn.category === cat))
        : [],
    [monthTxns, cat],
  )
  const biggest = useMemo(
    () =>
      monthTxns
        .filter((txn) => txn.type === 'expense')
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 6),
    [monthTxns],
  )

  const expenseCount = monthTxns.filter((txn) => txn.type === 'expense').length
  const elapsed = month === currentMonth ? Number(today.slice(8, 10)) : month < currentMonth ? daysInMonth(month) : 0
  const perDay = elapsed > 0 ? summary.expense / elapsed : 0
  const pace = month === currentMonth && elapsed > 0 ? round2(perDay * daysInMonth(month)) : null
  const catTotal = cat ? round2(summary.byCategory[cat] || 0) : 0
  const catBudget = cat ? state.budgets[cat] || 0 : 0
  const top = breakdown[0]?.amount || 0
  const incomeTotal = summary.income
  const rhythmMax = Math.max(...rhythm)
  const priciest = rhythmMax > 0 ? WEEK.find((item) => rhythm[item.day] === rhythmMax) : null

  return (
    <div className="g-view g-spending">
      <ViewHeader
        title="Spending"
        tone="peach"
        sub={`Where the money went in ${monthLabel(month)}, and where it came from.`}
        actions={
          <button type="button" className="g-btn g-btn--ink g-press" onClick={() => addEntry({ type: 'expense' })}>
            <LuPlus aria-hidden="true" /> Log a spend
          </button>
        }
      />

      <div className="g-bento">
        <Tile
          span={5}
          index={0}
          tone="peach"
          icon={LuReceipt}
          kicker={monthLabel(month)}
          title="Spent on things"
          className="g-hero g-hero--spend"
        >
          <Odometer value={summary.expense} className="g-hero__value" />
          <p className="g-hero__delta">
            <Delta value={summary.expense} previous={previous.expense} against={shortMonth(prevMonth)} />
          </p>
          <dl className="g-stats g-stats--wide">
            <div>
              <dt>EMIs paid</dt>
              <dd>
                <Money value={summary.emi} />
              </dd>
            </div>
            <div>
              <dt>Per day</dt>
              <dd>
                <Money value={perDay} />
              </dd>
            </div>
            <div>
              <dt>Entries</dt>
              <dd>{expenseCount}</dd>
            </div>
            {pace !== null && (
              <div>
                <dt>On pace for</dt>
                <dd>
                  <Money value={pace} />
                </dd>
              </div>
            )}
          </dl>
        </Tile>

        <Tile span={7} index={1} icon={LuShapes} kicker="Tap a block to see its entries" title="The shape of it">
          {breakdown.length > 0 ? (
            <Treemap breakdown={breakdown} onPick={pickCategory} dealKey={month} />
          ) : (
            <EmptyState
              compact
              icon={LuShapes}
              title={`No spends in ${monthLabel(month)}`}
              body="Each category becomes a block sized by how much it took."
            />
          )}
        </Tile>

        <Tile
          span={7}
          index={2}
          icon={LuListOrdered}
          kicker="Biggest first"
          title="By category"
          actions={
            Object.keys(state.budgets).length > 0 && (
              <a className="g-link" href={hrefFor('plan')}>
                Budgets <LuArrowRight aria-hidden="true" />
              </a>
            )
          }
        >
          {breakdown.length > 0 ? (
            <ul key={month} className="g-cats">
              {breakdown.map((item, i) => {
                const limit = state.budgets[item.id] || 0
                const share = summary.expense > 0 ? item.amount / summary.expense : 0
                const active = cat === item.id
                return (
                  <li key={item.id} style={{ '--i': i }}>
                    <button
                      type="button"
                      className={cx('g-cats__row', active && 'is-active')}
                      onClick={() => pickCategory(active ? '' : item.id)}
                      aria-pressed={active}
                    >
                      <IconBadge icon={item.meta.icon} tone={item.meta.tone} />
                      <span className="g-cats__name">
                        {item.meta.label}
                        <small>
                          {formatPercent(share)} of spends
                          {limit > 0 && ` · ${formatPercent(item.amount / limit)} of budget`}
                        </small>
                      </span>
                      <Money value={item.amount} className="g-cats__amt" />
                      <span
                        className={cx('g-cats__track', limit > 0 && item.amount > limit && 'is-over')}
                        style={{ '--p': top > 0 ? item.amount / top : 0, ...toneVar(item.meta.tone) }}
                        aria-hidden="true"
                      />
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <EmptyState compact icon={LuListOrdered} title="Nothing to rank yet" />
          )}
        </Tile>

        {catMeta ? (
          <Tile
            span={5}
            index={3}
            tone={catMeta.tone}
            icon={catMeta.icon}
            kicker={monthLabel(month)}
            title={catMeta.label}
            className="g-catpanel"
            actions={
              <button
                type="button"
                className="g-icon-btn g-press"
                onClick={() => pickCategory('')}
                aria-label="Close category"
              >
                <LuX aria-hidden="true" />
              </button>
            }
          >
            <p className="g-catpanel__total">
              <Money value={catTotal} />
              <Delta value={catTotal} previous={previous.byCategory[cat] || 0} against={shortMonth(prevMonth)} />
            </p>
            {catBudget > 0 && (
              <div className="g-catpanel__budget">
                <ProgressBar
                  value={catTotal / catBudget}
                  tone={budgetTone(catTotal / catBudget)}
                  label={`${catMeta.label} budget used`}
                />
                <p className="g-muted">
                  {catTotal > catBudget ? (
                    <>
                      <Money value={catTotal - catBudget} tone="neg" /> over the <Money value={catBudget} /> budget
                    </>
                  ) : (
                    <>
                      <Money value={catBudget - catTotal} /> left of <Money value={catBudget} />
                    </>
                  )}
                </p>
              </div>
            )}
            {catEntries.length > 0 ? (
              <div className="g-scroll">
                <TxnMiniList txns={catEntries} />
              </div>
            ) : (
              <EmptyState compact icon={catMeta.icon} title={`No ${catMeta.short.toLowerCase()} spends this month`} />
            )}
          </Tile>
        ) : (
          <Tile span={5} index={3} icon={LuCoins} kicker="Single entries" title="Biggest spends">
            {biggest.length > 0 ? (
              <TxnMiniList txns={biggest} />
            ) : (
              <EmptyState compact icon={LuCoins} title="Nothing yet" body="Your largest spends will line up here." />
            )}
          </Tile>
        )}

        <Tile
          span={6}
          index={4}
          icon={LuCalendarRange}
          kicker={`Spends by weekday · ${monthLabel(month)}`}
          title="Weekly rhythm"
          actions={
            priciest && (
              <Sticker tone="peach" rotate={3}>
                {priciest.label}s cost most
              </Sticker>
            )
          }
        >
          <ol key={month} className="g-week" aria-label="Spending by day of week">
            {WEEK.map((item, i) => {
              const value = rhythm[item.day]
              return (
                <li
                  key={item.label}
                  className={cx('g-week__day', value > 0 && value === rhythmMax && 'is-max')}
                  style={{ '--i': i, '--h': rhythmMax > 0 ? value / rhythmMax : 0 }}
                >
                  <span className="g-week__bar" aria-hidden="true" />
                  <span className="g-week__label">{item.label}</span>
                  <Money value={value} compact className="g-week__amt" />
                </li>
              )
            })}
          </ol>
        </Tile>

        <Tile
          span={6}
          index={5}
          icon={LuChartPie}
          kicker={monthLabel(month)}
          title="Where money came from"
          actions={
            <button type="button" className="g-btn g-btn--sm g-press" onClick={() => addEntry({ type: 'income' })}>
              <LuPlus aria-hidden="true" /> Income
            </button>
          }
        >
          {income.length > 0 ? (
            <>
              <div key={`ribbon-${month}`} className="g-ribbon" role="img" aria-label="Income split by source">
                {income.map((item) => (
                  <span
                    key={item.id}
                    className="g-ribbon__part"
                    style={{ flexGrow: item.amount, ...toneVar(item.meta.tone) }}
                  />
                ))}
              </div>
              <ul key={`sources-${month}`} className="g-sources">
                {income.map((item, i) => (
                  <li key={item.id} className="g-sources__row" style={{ '--i': i, ...toneVar(item.meta.tone) }}>
                    <IconBadge icon={item.meta.icon} tone={item.meta.tone} size="sm" />
                    <span className="g-sources__name">{item.meta.label}</span>
                    <span className="g-sources__share">{formatPercent(item.amount / incomeTotal)}</span>
                    <Money value={item.amount} tone="pos" />
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <EmptyState
              compact
              icon={LuChartPie}
              title={`No income logged in ${monthLabel(month)}`}
              body="Add your salary when it lands to see your savings rate."
            />
          )}
        </Tile>
      </div>
    </div>
  )
}
