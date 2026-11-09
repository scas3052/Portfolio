import {
  LuCalendarClock,
  LuCrown,
  LuFlag,
  LuFlame,
  LuGauge,
  LuHandCoins,
  LuHandshake,
  LuLightbulb,
  LuPiggyBank,
  LuReceipt,
  LuSiren,
  LuTarget,
  LuTrendingDown,
  LuTrendingUp,
  LuTriangleAlert,
} from 'react-icons/lu'
import { categoryBreakdown, budgetStatus, goalPlan, summarize, txnsInMonth } from './selectors'
import { addDays, addMonths, daysInMonth, diffDays, inDays, monthLabel, monthOf, parseISO, shortDate, shortMonth } from './dates'
import { formatINR, formatPercent, plural } from './format'
import { categoryMeta } from './categories'

const TIPS = [
  { title: 'Do the maths in the amount box', body: 'Type 120+80 or 3×45 and Gullak works out the total for you.' },
  { title: 'Press Ctrl K (⌘K on Mac)', body: 'Opens the command receipt: jump to any page or find any entry.' },
  { title: 'Swipe an entry left', body: 'Drag any entry to the left to delete it. Undo is one tap away.' },
  { title: 'Keyboard first', body: 'N logs a spend, I logs income, H hides amounts and 1–8 switch pages.' },
  { title: 'Hide your numbers', body: 'Tap the eye (or press H) before you show your screen to someone.' },
  { title: 'Back up your book', body: 'Everything lives in this browser only. Export a JSON backup from Settings now and then.' },
  { title: 'Flip the cards', body: 'Tap an account card to flip it and see that account’s money in and out this month.' },
]

const ordinal = (n) => {
  const rem = n % 100
  if (rem >= 11 && rem <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`
}

function expenseThrough(transactions, month, day) {
  const last = `${month}-${String(day).padStart(2, '0')}`
  let total = 0
  for (const t of transactions) {
    if (t.type === 'expense' && t.date.startsWith(month) && t.date <= last) total += t.amount
  }
  return total
}

function dayOfYear(iso) {
  const date = parseISO(iso)
  return Math.floor((date - new Date(date.getFullYear(), 0, 1)) / 86400000)
}

/** Short, ranked "heads-up" cards about the money book as of `today`. */
export function buildInsights(state, derived, today) {
  const tip = TIPS[dayOfYear(today) % TIPS.length]
  const tipCard = { id: `tip-${dayOfYear(today) % TIPS.length}`, tone: 'tan', icon: LuLightbulb, kicker: 'Tip', priority: 1, ...tip }

  if (state.transactions.length === 0) {
    return [
      {
        id: 'start',
        tone: 'lime',
        icon: LuPiggyBank,
        kicker: 'Start here',
        title: 'Log your first spend',
        body: 'Press N or tap Add. Even a ₹10 chai counts, because small spends add up.',
        action: { label: 'Add entry', kind: 'add' },
        priority: 100,
      },
      tipCard,
    ]
  }

  const cards = []
  const month = monthOf(today)
  const day = Number(today.slice(8, 10))
  const monthDays = daysInMonth(month)
  const daysLeft = monthDays - day + 1
  const lastMonth = addMonths(month, -1)
  const thisTxns = txnsInMonth(state.transactions, month)
  const now = summarize(thisTxns)

  // EMIs: overdue first, then anything due within a week.
  for (const status of derived.loans) {
    if (status.done || status.daysToDue === null) continue
    const { loan } = status
    const account = derived.lookups.accounts.get(loan.accountId)
    const balance = account ? derived.balances.get(account.id) : null
    if (status.overdue) {
      cards.push({
        id: `emi-late-${loan.id}`,
        tone: 'coral',
        icon: LuSiren,
        kicker: 'EMI overdue',
        title: `${loan.name} EMI was due ${inDays(status.daysToDue)}`,
        body: `${formatINR(loan.emi)} to ${loan.lender || 'your lender'}. Log it here once it’s paid.`,
        action: { label: 'Log EMI', kind: 'emi', loanId: loan.id },
        priority: 100,
      })
    } else if (status.daysToDue <= 7) {
      const short = balance !== null && balance !== undefined && balance < loan.emi
      cards.push({
        id: `emi-soon-${loan.id}`,
        tone: short ? 'coral' : 'butter',
        icon: LuCalendarClock,
        kicker: 'EMI coming up',
        title: `${loan.name}: ${formatINR(loan.emi)} due ${inDays(status.daysToDue)}`,
        body: short
          ? `${account.name} has only ${formatINR(balance)}. Top it up before the ${ordinal(Number(status.nextDue.slice(8)))}.`
          : `Keep it ready in ${account ? account.name : 'your account'}. Tap below once it’s debited.`,
        action: { label: 'Log EMI', kind: 'emi', loanId: loan.id },
        priority: 90 - status.daysToDue,
      })
    }
  }

  // Budgets.
  const budgets = budgetStatus(state.budgets, now.byCategory)
  let budgetCards = 0
  for (const b of budgets) {
    if (budgetCards >= 2) break
    if (b.over) {
      cards.push({
        id: `budget-over-${b.id}`,
        tone: 'rose',
        icon: LuTriangleAlert,
        kicker: 'Budget blown',
        title: `${b.meta.label} is ${formatINR(-b.left)} over`,
        body: `You planned ${formatINR(b.limit)} for ${monthLabel(month)} and there ${daysLeft === 1 ? 'is 1 day' : `are ${daysLeft} days`} still to go.`,
        action: { label: 'Review budget', kind: 'nav', view: 'plan' },
        priority: 80,
      })
      budgetCards += 1
    } else if (b.ratio >= 0.8) {
      cards.push({
        id: `budget-near-${b.id}`,
        tone: 'butter',
        icon: LuGauge,
        kicker: 'Budget check',
        title: `${formatPercent(b.ratio)} of your ${b.meta.short.toLowerCase()} budget is gone`,
        body: `${formatINR(b.left)} left for ${plural(daysLeft, 'day')}, about ${formatINR(b.left / daysLeft)} a day.`,
        action: { label: 'See spending', kind: 'nav', view: 'spending', params: { cat: b.id } },
        priority: 70,
      })
      budgetCards += 1
    }
  }

  // Pace against last month, up to the same day.
  const sameDay = Math.min(day, daysInMonth(lastMonth))
  const nowPace = expenseThrough(state.transactions, month, day)
  const lastPace = expenseThrough(state.transactions, lastMonth, sameDay)
  if (lastPace > 0 && nowPace > 0) {
    const change = (nowPace - lastPace) / lastPace
    if (Math.abs(change) >= 0.05) {
      const faster = change > 0
      cards.push({
        id: 'pace',
        tone: faster ? 'peach' : 'mint',
        icon: faster ? LuTrendingUp : LuTrendingDown,
        kicker: 'Pace check',
        title: faster
          ? `Spending ${formatPercent(change)} faster than last month`
          : `${formatPercent(-change)} lighter than last month`,
        body: `${formatINR(nowPace)} by the ${ordinal(day)}, against ${formatINR(lastPace)} by the same day in ${shortMonth(lastMonth)}. EMIs not included.`,
        action: { label: 'See the curve', kind: 'nav', view: 'spending' },
        priority: 60,
      })
    }
  }

  // No-spend streak, counted back from today.
  let streak = 0
  const spentOn = new Set(state.transactions.filter((t) => t.type === 'expense').map((t) => t.date))
  for (let d = today; diffDays(d, today) < 60 && !spentOn.has(d); d = addDays(d, -1)) streak += 1
  if (streak >= 2) {
    cards.push({
      id: 'streak',
      tone: 'lime',
      icon: LuFlame,
      kicker: 'Streak',
      title: `${streak} days without spending`,
      body: 'The gullak is getting heavier. Skip one impulse buy today and keep it going.',
      priority: 55,
    })
  } else {
    let quiet = 0
    for (let d = 1; d <= day; d += 1) {
      if (!spentOn.has(`${month}-${String(d).padStart(2, '0')}`)) quiet += 1
    }
    if (quiet > 0) {
      cards.push({
        id: 'quiet-days',
        tone: 'mint',
        icon: LuFlame,
        kicker: 'No-spend days',
        title: `${plural(quiet, 'no-spend day')} so far this month`,
        body: 'Days where nothing left your pocket. Try to beat it next month.',
        priority: 20,
      })
    }
  }

  // People.
  const owedToYou = derived.people
    .filter((p) => p.net > 0 && p.since && diffDays(p.since, today) >= 14)
    .sort((a, b) => (a.since < b.since ? -1 : 1))[0]
  if (owedToYou) {
    cards.push({
      id: `collect-${owedToYou.id}`,
      tone: 'mint',
      icon: LuHandCoins,
      kicker: 'Collect',
      title: `${owedToYou.name} owes you ${formatINR(owedToYou.net)}`,
      body: `Pending since ${shortDate(owedToYou.since)} (${plural(diffDays(owedToYou.since, today), 'day')}). Maybe a gentle nudge?`,
      action: { label: 'Got it back', kind: 'collect', personId: owedToYou.id },
      priority: 50,
    })
  }
  const youOwe = derived.people.filter((p) => p.net < 0).sort((a, b) => a.net - b.net)[0]
  if (youOwe) {
    cards.push({
      id: `repay-${youOwe.id}`,
      tone: 'rose',
      icon: LuHandshake,
      kicker: 'You owe',
      title: `${formatINR(-youOwe.net)} to ${youOwe.name}`,
      body: youOwe.since ? `Since ${shortDate(youOwe.since)}. Settle it before it slips your mind.` : 'Settle it before it slips your mind.',
      action: { label: 'Pay back', kind: 'repay', personId: youOwe.id },
      priority: 45,
    })
  }

  // Projection for the month (day-to-day expenses only).
  if (day >= 5 && now.expense > 0) {
    const projected = (now.expense / day) * monthDays
    const totalBudget = Object.values(state.budgets).reduce((sum, value) => sum + value, 0)
    cards.push({
      id: 'forecast',
      tone: 'sky',
      icon: LuReceipt,
      kicker: 'Forecast',
      title: `Heading for about ${formatINR(projected, { compact: true })} this month`,
      body:
        totalBudget > 0
          ? `At ${formatINR(now.expense / day)} a day. Your budgets add up to ${formatINR(totalBudget)}.`
          : `At ${formatINR(now.expense / day)} a day, not counting EMIs.`,
      priority: 40,
    })
  }

  // Last month's savings rate.
  const prev = summarize(txnsInMonth(state.transactions, lastMonth))
  if (prev.income > 0) {
    const good = prev.rate >= 0.2
    cards.push({
      id: 'last-month',
      tone: good ? 'lime' : prev.rate >= 0 ? 'butter' : 'rose',
      icon: LuPiggyBank,
      kicker: monthLabel(lastMonth),
      title: prev.rate >= 0 ? `You kept ${formatPercent(prev.rate)} of what you earned` : 'You spent more than you earned',
      body:
        prev.rate >= 0
          ? `${formatINR(prev.saved)} saved from ${formatINR(prev.income)}${good ? '. Nicely done.' : '. 20% is a good target.'}`
          : `${formatINR(-prev.saved)} more went out than came in, EMIs included.`,
      priority: 35,
    })
  }

  // Where the money went this month.
  const top = categoryBreakdown(now.byCategory).find((c) => c.id !== 'emi')
  if (top && now.expense > 0) {
    cards.push({
      id: `top-${top.id}`,
      tone: top.meta.tone,
      icon: LuCrown,
      kicker: 'Top category',
      title: `${top.meta.label} leads with ${formatINR(top.amount)}`,
      body: `That’s ${formatPercent(top.amount / now.expense)} of your day-to-day spending in ${shortMonth(month)}.`,
      action: { label: 'Break it down', kind: 'nav', view: 'spending', params: { cat: top.id } },
      priority: 30,
    })
  }
  const biggest = thisTxns.filter((t) => t.type === 'expense').sort((a, b) => b.amount - a.amount)[0]
  if (biggest) {
    cards.push({
      id: `biggest-${biggest.id}`,
      tone: 'lilac',
      icon: LuReceipt,
      kicker: 'Biggest spend',
      title: `${formatINR(biggest.amount)} on ${biggest.note || categoryMeta(biggest.category).label}`,
      body: `${shortDate(biggest.date)} · ${categoryMeta(biggest.category).label}. Worth it?`,
      action: { label: 'Open entry', kind: 'edit', txnId: biggest.id },
      priority: 25,
    })
  }

  // Goals and debt-free date.
  const goal = state.goals
    .map((g) => ({ goal: g, plan: goalPlan(g, today) }))
    .filter(({ plan }) => plan.perMonth && !plan.done)
    .sort((a, b) => (a.goal.deadline < b.goal.deadline ? -1 : 1))[0]
  if (goal) {
    cards.push({
      id: `goal-${goal.goal.id}`,
      tone: goal.goal.color,
      icon: LuTarget,
      kicker: 'Goal',
      title: `Put away ${formatINR(goal.plan.perMonth)} a month for ${goal.goal.name}`,
      body: `${formatINR(goal.plan.remaining)} to go with ${plural(goal.plan.monthsLeft, 'month')} left.`,
      action: { label: 'Add money', kind: 'contribute', goalId: goal.goal.id },
      priority: 18,
    })
  }
  const active = derived.loans.filter((s) => !s.done)
  if (active.length) {
    const end = active.reduce((latest, s) => (s.endMonth > latest ? s.endMonth : latest), active[0].endMonth)
    const left = active.reduce((sum, s) => sum + s.remaining, 0)
    cards.push({
      id: 'debt-free',
      tone: 'lilac',
      icon: LuFlag,
      kicker: 'Debt-free',
      title: `EMI-free by ${monthLabel(end)}`,
      body: `${plural(left, 'EMI')} and ${formatINR(derived.position.emiLeft)} to go across ${plural(active.length, 'loan')}.`,
      action: { label: 'See loans', kind: 'nav', view: 'emis' },
      priority: 15,
    })
  }

  return [...cards.sort((a, b) => b.priority - a.priority).slice(0, 8), tipCard]
}
