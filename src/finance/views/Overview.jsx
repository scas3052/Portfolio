import { useMemo } from 'react'
import {
  LuArrowRight,
  LuCalendarDays,
  LuChartColumn,
  LuCheck,
  LuFlame,
  LuHandshake,
  LuHistory,
  LuLandmark,
  LuPiggyBank,
  LuScale,
  LuShapes,
  LuSparkles,
  LuTrendingUp,
} from 'react-icons/lu'
import { AccountCard } from '../components/AccountCard'
import { Avatar, Delta, EmptyState, ProgressBar, Sticker, Tile, ViewHeader } from '../components/bits'
import BarsChart from '../components/charts/BarsChart'
import Heatmap from '../components/charts/Heatmap'
import LineChart from '../components/charts/LineChart'
import Treemap from '../components/charts/Treemap'
import InsightDeck from '../components/InsightDeck'
import { Money, Odometer } from '../components/Money'
import { TxnMiniList } from '../components/TxnRow'
import WaveGauge from '../components/WaveGauge'
import { useActions } from '../hooks/useActions'
import { cx, toneVar } from '../lib/cx'
import { addDays, addMonths, inDays, monthDiff, monthLabel, monthOf, shortMonth } from '../lib/dates'
import { formatPercent, plural } from '../lib/format'
import { buildInsights } from '../lib/insights'
import { hrefFor, navigate } from '../lib/router'
import { categoryBreakdown, monthlySeries, summarize, txnsInMonth } from '../lib/selectors'
import { useFinance, useUi } from '../store/contexts'

/** Days this month without a single spend, and the current run of them. */
function noSpendStats(transactions, today, firstDate) {
  const month = monthOf(today)
  const spentOn = new Set()
  for (const t of transactions) if (t.type === 'expense') spentOn.add(t.date)
  const elapsed = Number(today.slice(8, 10))
  let free = 0
  for (let day = 1; day <= elapsed; day += 1) {
    const date = `${month}-${String(day).padStart(2, '0')}`
    if (date >= firstDate && !spentOn.has(date)) free += 1
  }
  let streak = 0
  let cursor = today
  while (streak < 366 && cursor >= firstDate && !spentOn.has(cursor)) {
    streak += 1
    cursor = addDays(cursor, -1)
  }
  return { free, streak }
}

function Setup({ state, index }) {
  const { addEntry } = useActions()
  const { openSheet } = useUi()
  const steps = [
    {
      id: 'account',
      label: 'Add a bank account, card or cash wallet',
      done: state.accounts.length > 0,
      cta: 'Add account',
      run: () => openSheet('account'),
    },
    {
      id: 'entry',
      label: 'Log your first spend or income',
      done: state.transactions.length > 0,
      cta: 'Add entry',
      run: () => addEntry({ type: 'expense' }),
    },
    {
      id: 'loan',
      label: 'Track an EMI or loan, if you have one',
      done: state.loans.length > 0,
      cta: 'Add EMI',
      run: () => openSheet('loan'),
    },
    {
      id: 'budget',
      label: 'Give your categories a monthly budget',
      done: Object.keys(state.budgets).length > 0,
      cta: 'Set budgets',
      run: () => openSheet('budget'),
    },
  ]
  const done = steps.filter((step) => step.done).length

  return (
    <Tile
      span={12}
      index={index}
      tone="butter"
      icon={LuSparkles}
      kicker={`${done} of ${steps.length} done`}
      title="Let’s fill your gullak"
      className="g-setup"
    >
      <ProgressBar value={done / steps.length} tone="lime" label="Setup progress" />
      <ol className="g-setup__steps">
        {steps.map((step, i) => (
          <li key={step.id} className={cx('g-setup__step', step.done && 'is-done')} style={{ '--i': i }}>
            <span className="g-setup__num" aria-hidden="true">
              {step.done ? <LuCheck /> : i + 1}
            </span>
            <span className="g-setup__label">
              {step.label}
              {step.done && <span className="sr-only"> (done)</span>}
            </span>
            {!step.done && (
              <button type="button" className="g-btn g-btn--sm g-press" onClick={step.run}>
                {step.cta}
              </button>
            )}
          </li>
        ))}
      </ol>
    </Tile>
  )
}

/** Assets pull one way, debts the other. The knot sits where they balance. */
function Tug({ assets, debts }) {
  const total = assets + debts
  const share = total > 0 ? assets / total : 0.5
  const label =
    total > 0
      ? `What you have is ${formatPercent(share)} of everything you have and owe combined`
      : 'Nothing to weigh yet'
  return (
    <div className="g-tug" style={{ '--share': share }} role="img" aria-label={label}>
      <div className="g-tug__rope" aria-hidden="true">
        <span className="g-tug__mine" />
        <span className="g-tug__knot" />
      </div>
      <div className="g-tug__labels" aria-hidden="true">
        <span>You have</span>
        <span>You owe</span>
      </div>
    </div>
  )
}

export default function Overview() {
  const { state, derived, today } = useFinance()
  const { month, currentMonth, setMonth } = useUi()
  const { logEmi, settle } = useActions()
  const { position, owe } = derived
  const prevMonth = addMonths(month, -1)
  const firstDate = derived.sorted.length ? derived.sorted[derived.sorted.length - 1].date : today

  const summary = useMemo(() => summarize(txnsInMonth(state.transactions, month)), [state.transactions, month])
  const previous = useMemo(
    () => summarize(txnsInMonth(state.transactions, prevMonth)),
    [state.transactions, prevMonth],
  )
  const insights = useMemo(() => buildInsights(state, derived, today), [state, derived, today])
  const breakdown = useMemo(
    () => categoryBreakdown(summary.byCategory).filter((item) => item.id !== 'emi'),
    [summary],
  )
  const seriesEnd = monthDiff(month, currentMonth) > 5 ? addMonths(month, 5) : currentMonth
  const series = useMemo(() => monthlySeries(state.transactions, seriesEnd, 6), [state.transactions, seriesEnd])
  const upcoming = useMemo(
    () =>
      derived.loans
        .filter((status) => !status.done)
        .sort((a, b) => a.daysToDue - b.daysToDue)
        .slice(0, 3),
    [derived.loans],
  )
  const topPeople = useMemo(
    () =>
      derived.people
        .filter((person) => Math.abs(person.net) >= 0.01)
        .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
        .slice(0, 3),
    [derived.people],
  )
  const noSpend = useMemo(
    () => noSpendStats(state.transactions, today, firstDate),
    [state.transactions, today, firstDate],
  )
  const topAccounts = useMemo(
    () =>
      state.accounts
        .map((account) => ({ account, balance: derived.balances.get(account.id) || 0 }))
        .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))
        .slice(0, 2),
    [state.accounts, derived.balances],
  )

  const budgetTotal = Object.values(state.budgets).reduce((sum, value) => sum + value, 0)
  const recent = derived.sorted.slice(0, 5)
  const needsSetup = state.accounts.length === 0 || state.transactions.length === 0
  const base = needsSetup ? 1 : 0

  const assets = Math.max(0, position.cash) + Math.max(0, position.credit) + position.receivable
  const debts = Math.max(0, -position.cash) + Math.max(0, -position.credit) + position.payable + position.emiLeft
  const parts = [
    { id: 'cash', label: 'In accounts', value: position.cash, view: 'accounts' },
    { id: 'receivable', label: 'Owed to you', value: position.receivable, view: 'people' },
    { id: 'credit', label: 'Card dues', value: position.credit, view: 'accounts', hidden: position.credit === 0 },
    { id: 'payable', label: 'You owe people', value: -position.payable, view: 'people' },
    { id: 'emi', label: 'EMIs still to pay', value: -position.emiLeft, view: 'emis' },
  ].filter((part) => !part.hidden)

  const rate = summary.rate
  const jarTone = rate === null ? 'gray' : rate >= 0.2 ? 'mint' : rate >= 0 ? 'butter' : 'rose'
  const jarLabel =
    rate === null
      ? `No income logged for ${monthLabel(month)}`
      : rate >= 0
        ? `You kept ${formatPercent(rate)} of what you earned in ${monthLabel(month)}`
        : `You spent more than you earned in ${monthLabel(month)}`

  return (
    <div className="g-view g-overview">
      <ViewHeader
        title="Overview"
        tone="lime"
        sub="Everything your money is doing, on one sheet of paper."
      />

      <div className="g-bento">
        {needsSetup && <Setup state={state} index={0} />}

        <Tile
          span={7}
          index={base}
          tone="lime"
          icon={LuScale}
          kicker="Net position · right now"
          title="What you’re worth"
          className="g-hero"
        >
          <Odometer value={position.net} className="g-hero__value" />
          <ul className="g-hero__parts">
            {parts.map((part, i) => (
              <li key={part.id} style={{ '--i': i }}>
                <a className="g-hero__part" href={hrefFor(part.view)}>
                  <span className="g-hero__label">{part.label}</span>
                  <Money value={part.value} tone={part.value < 0 ? 'neg' : undefined} />
                </a>
              </li>
            ))}
          </ul>
          <Tug assets={assets} debts={debts} />
        </Tile>

        <Tile span={5} index={base + 1} icon={LuPiggyBank} kicker={monthLabel(month)} title="Savings jar">
          <div className="g-savings">
            <div className="g-savings__jar">
              <WaveGauge value={rate ?? 0} tone={jarTone} label={jarLabel} />
              <p className="g-savings__rate" aria-hidden="true">
                {rate === null ? '—' : formatPercent(Math.max(-9.99, rate))}
                <small>kept</small>
              </p>
            </div>
            <dl className="g-stats">
              <div>
                <dt>Earned</dt>
                <dd>
                  <Money value={summary.income} tone="pos" />
                </dd>
              </div>
              <div>
                <dt>Spent</dt>
                <dd>
                  <Money value={summary.expense} />
                </dd>
              </div>
              <div>
                <dt>EMIs</dt>
                <dd>
                  <Money value={summary.emi} />
                </dd>
              </div>
              <div className="g-stats__total">
                <dt>Kept</dt>
                <dd>
                  <Money value={summary.saved} tone="auto" />
                </dd>
              </div>
            </dl>
          </div>
          <p className="g-tile__foot">
            <Delta value={summary.spent} previous={previous.spent} against={shortMonth(prevMonth)} />
          </p>
        </Tile>

        <Tile span={5} index={base + 2} icon={LuSparkles} kicker="Fling the card for the next one" title="Heads-up">
          <InsightDeck cards={insights} />
        </Tile>

        <Tile
          span={7}
          index={base + 3}
          icon={LuTrendingUp}
          kicker={`${monthLabel(month)} vs ${shortMonth(prevMonth)}`}
          title="Spending pace"
        >
          <LineChart transactions={state.transactions} month={month} today={today} budget={budgetTotal} />
        </Tile>

        <Tile
          span={7}
          index={base + 4}
          icon={LuShapes}
          kicker="Tap a block to dig in"
          title="Where it went"
          actions={
            <a className="g-link" href={hrefFor('spending')}>
              Spending <LuArrowRight aria-hidden="true" />
            </a>
          }
        >
          {breakdown.length > 0 ? (
            <Treemap
              breakdown={breakdown}
              dealKey={month}
              onPick={(id) => navigate('spending', id ? { cat: id } : undefined)}
            />
          ) : (
            <EmptyState
              compact
              icon={LuShapes}
              title={`No spends in ${monthLabel(month)}`}
              body="Once you log a few, each category gets a block sized by how much it took."
            />
          )}
        </Tile>

        <Tile
          span={5}
          index={base + 5}
          icon={LuLandmark}
          kicker="Next three"
          title="EMIs coming up"
          actions={
            <a className="g-link" href={hrefFor('emis')}>
              All loans <LuArrowRight aria-hidden="true" />
            </a>
          }
        >
          {upcoming.length > 0 ? (
            <ul className="g-upcoming">
              {upcoming.map((status, i) => {
                const { loan } = status
                const late = status.overdue
                const canPay = !status.paidThisMonth || late
                return (
                  <li
                    key={loan.id}
                    className={cx('g-upcoming__item', late && 'is-overdue')}
                    style={{ '--i': i, ...toneVar(loan.color) }}
                  >
                    <span className="g-upcoming__date" aria-hidden="true">
                      <span className="g-upcoming__day">{Number(status.nextDue.slice(8, 10))}</span>
                      <span className="g-upcoming__mon">{shortMonth(status.nextDue.slice(0, 7))}</span>
                    </span>
                    <span className="g-upcoming__body">
                      <span className="g-upcoming__name">{loan.name}</span>
                      <span className="g-upcoming__meta">
                        {late ? `Overdue by ${plural(-status.daysToDue, 'day')}` : `Due ${inDays(status.daysToDue)}`}
                        {' · '}
                        {plural(status.remaining, 'EMI')} left
                      </span>
                    </span>
                    <Money value={loan.emi} className="g-upcoming__amt" />
                    {canPay ? (
                      <button
                        type="button"
                        className="g-btn g-btn--sm g-press"
                        style={toneVar('coral')}
                        onClick={() => logEmi(status)}
                        aria-label={`Mark ${loan.name} EMI as paid`}
                      >
                        Mark paid
                      </button>
                    ) : (
                      <Sticker tone="mint" rotate={-5}>
                        Paid
                      </Sticker>
                    )}
                  </li>
                )
              })}
            </ul>
          ) : (
            <EmptyState
              compact
              icon={LuLandmark}
              title="No EMIs running"
              body="Add a loan or no-cost EMI to see what’s due and how much is left."
            />
          )}
        </Tile>

        <Tile
          span={4}
          index={base + 6}
          icon={LuChartColumn}
          kicker="Tap a month to open it"
          title="Six months"
        >
          <BarsChart series={series} activeMonth={month} onPick={setMonth} />
        </Tile>

        <Tile
          span={4}
          index={base + 7}
          icon={LuHandshake}
          kicker="Lend & owe"
          title="People"
          actions={
            <a className="g-link" href={hrefFor('people')}>
              All <LuArrowRight aria-hidden="true" />
            </a>
          }
        >
          <div className="g-owe">
            <div className="g-owe__side is-in">
              <span className="g-owe__label">Owed to you</span>
              <Money value={owe.receivable} tone="pos" />
            </div>
            <div className="g-owe__side is-out">
              <span className="g-owe__label">You owe</span>
              <Money value={owe.payable} tone="neg" />
            </div>
          </div>
          {topPeople.length > 0 ? (
            <ul className="g-mini-people">
              {topPeople.map((person) => {
                const owesYou = person.net > 0
                return (
                  <li key={person.id}>
                    <button
                      type="button"
                      className="g-mini-people__row"
                      onClick={() => settle(person, owesYou ? 'collect' : 'repay')}
                      aria-label={`${person.name} ${owesYou ? 'owes you' : 'is owed by you'}. Settle up`}
                    >
                      <Avatar name={person.name} tone={owesYou ? 'mint' : 'rose'} size="sm" />
                      <span className="g-mini-people__name">
                        {person.name}
                        <small>{owesYou ? 'owes you' : 'you owe'}</small>
                      </span>
                      <Money value={Math.abs(person.net)} tone={owesYou ? 'pos' : 'neg'} />
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="g-muted g-mini-note">All square with everyone.</p>
          )}
        </Tile>

        <Tile
          span={4}
          index={base + 8}
          icon={LuHistory}
          kicker="Swipe left to delete"
          title="Latest entries"
          className="g-overview__latest"
          actions={
            <a className="g-link" href={hrefFor('activity')}>
              All <LuArrowRight aria-hidden="true" />
            </a>
          }
        >
          {recent.length > 0 ? (
            <TxnMiniList txns={recent} />
          ) : (
            <EmptyState compact icon={LuHistory} title="Nothing logged yet" body="Press N anywhere to add an entry." />
          )}
        </Tile>

        {topAccounts.length > 0 && (
          <Tile
            span={12}
            index={base + 9}
            kicker="Tap a card to flip it"
            title="Biggest balances"
            className="g-overview__cards"
            actions={
              <a className="g-link" href={hrefFor('accounts')}>
                {plural(state.accounts.length, 'account')} <LuArrowRight aria-hidden="true" />
              </a>
            }
          >
            <div className="g-cards g-cards--row">
              {topAccounts.map(({ account, balance }, i) => (
                <AccountCard key={account.id} account={account} balance={balance} index={i} />
              ))}
            </div>
          </Tile>
        )}

        <Tile
          span={12}
          index={base + 10}
          icon={LuCalendarDays}
          kicker="Last 26 weeks · tap a day to see it"
          title="Spending calendar"
          actions={
            state.transactions.length > 0 &&
            noSpend.free > 0 && (
              <Sticker tone={noSpend.streak >= 3 ? 'lime' : 'butter'} rotate={2}>
                <LuFlame aria-hidden="true" />
                {noSpend.streak >= 2
                  ? `${noSpend.streak}-day no-spend streak`
                  : `${plural(noSpend.free, 'no-spend day')} this month`}
              </Sticker>
            )
          }
        >
          <Heatmap transactions={state.transactions} today={today} weeks={26} />
        </Tile>
      </div>
    </div>
  )
}
