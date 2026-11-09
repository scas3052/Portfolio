import { addDays, addMonths, dateInMonth, monthDiff, monthOf, parseISO, weekday } from './dates'
import { round2 } from './format'
import { normalizeState } from './schema'
import { computeBalances } from './selectors'

// Deterministic PRNG so the demo book looks the same on every load.
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const HDFC = 'sa_hdfc'
const SBI = 'sa_sbi'
const ICICI = 'sa_icici'
const CASH = 'sa_cash'

/** A realistic four-month money book ending on `today`, for exploring the app. */
export function buildSample(today) {
  const rand = mulberry32(20250717)
  const between = (min, max) => Math.round(min + rand() * (max - min))
  const pick = (list) => list[Math.floor(rand() * list.length)]
  const chance = (p) => rand() < p

  const current = monthOf(today)
  const startMonth = addMonths(current, -3)
  const start = `${startMonth}-01`
  const transactions = []
  let seq = 0

  const add = (date, fields) => {
    if (date < start || date > today) return
    seq += 1
    transactions.push({
      id: `st_${String(seq).padStart(3, '0')}`,
      type: 'expense',
      note: '',
      category: '',
      accountId: '',
      toAccountId: '',
      personId: '',
      loanId: '',
      ...fields,
      amount: round2(fields.amount),
      date,
      createdAt: parseISO(date).getTime() + seq * 1000,
    })
  }
  const spend = (date, amount, category, note, accountId) => add(date, { amount, category, note, accountId })

  const accounts = [
    { id: HDFC, name: 'HDFC Salary', kind: 'salary', bank: 'HDFC Bank', last4: '4821', opening: 41000, color: 'lime' },
    { id: SBI, name: 'SBI Savings', kind: 'savings', bank: 'State Bank of India', last4: '0937', opening: 96000, color: 'sky' },
    { id: ICICI, name: 'Amazon Pay ICICI', kind: 'credit', bank: 'ICICI Bank', last4: '7712', opening: -6400, color: 'lilac' },
    { id: CASH, name: 'Cash wallet', kind: 'cash', bank: '', last4: '', opening: 1800, color: 'butter' },
  ]

  const loanDefs = [
    { id: 'sl_bike', name: 'Bike loan', lender: 'HDFC Bank', emi: 4250, tenure: 24, offset: -9, dueDay: 5, rate: 10.5, principal: 92000, color: 'coral' },
    { id: 'sl_phone', name: 'iPhone 16', lender: 'Bajaj Finserv', emi: 6658, tenure: 12, offset: -2, dueDay: 10, rate: 0, principal: 79900, color: 'lilac' },
    { id: 'sl_personal', name: 'Personal loan', lender: 'KreditBee', emi: 3000, tenure: 10, offset: -14, dueDay: 15, rate: 14, principal: 27000, color: 'teal' },
  ]
  const loans = loanDefs.map(({ offset, ...loan }) => {
    const loanStart = addMonths(current, offset)
    const paidBefore = Math.min(loan.tenure, Math.max(0, monthDiff(loanStart, startMonth)))
    return { ...loan, startMonth: loanStart, paidBefore, accountId: HDFC }
  })

  const people = [
    { id: 'sp_kiran', name: 'Kiran' },
    { id: 'sp_ravi', name: 'Ravi' },
    { id: 'sp_sneha', name: 'Sneha' },
    { id: 'sp_arjun', name: 'Arjun' },
  ]

  // Fixed monthly rhythm.
  for (let m = 0; m < 4; m += 1) {
    const month = addMonths(startMonth, m)
    const on = (day) => dateInMonth(month, day)
    add(on(1), { type: 'income', amount: 72000, category: 'salary', note: 'Monthly salary', accountId: HDFC })
    add(on(2), { type: 'transfer', amount: 15000, note: 'Monthly savings', accountId: HDFC, toAccountId: SBI })
    spend(on(3), 14000, 'rent', 'House rent', HDFC)
    spend(on(4), 1500, 'health', 'Gym membership', HDFC)
    add(on(6), { type: 'transfer', amount: 3000, note: 'ATM withdrawal', accountId: HDFC, toAccountId: CASH })
    spend(on(7), 6000, 'family', 'Sent home', HDFC)
    spend(on(8), 199, 'subscriptions', 'Netflix', ICICI)
    spend(on(9), between(1050, 1650), 'bills', 'Electricity bill', HDFC)
    spend(on(12), 299, 'bills', 'Mobile recharge', ICICI)
    spend(on(14), 589, 'bills', 'Broadband', HDFC)
    spend(on(15), 119, 'subscriptions', 'Spotify', ICICI)
    add(on(18), { type: 'transfer', amount: 12000, note: 'Credit card bill', accountId: HDFC, toAccountId: ICICI })
    spend(on(21), 129, 'subscriptions', 'YouTube Premium', ICICI)
  }

  // EMIs on their due dates.
  for (const loan of loans) {
    for (let k = loan.paidBefore; k < loan.tenure; k += 1) {
      const date = dateInMonth(addMonths(loan.startMonth, k), loan.dueDay)
      add(date, { type: 'emi', amount: loan.emi, category: 'emi', loanId: loan.id, accountId: loan.accountId })
    }
  }

  // Everyday life.
  const meals = [
    ['Swiggy dinner', 220, 480],
    ['Office canteen', 80, 160],
    ['Chai & snacks', 40, 120],
    ['Zomato lunch', 180, 380],
    ['Breakfast', 60, 140],
  ]
  for (let date = start; date <= today; date = addDays(date, 1)) {
    const dow = weekday(date)
    const weekend = dow === 0 || dow === 6
    if (chance(0.62)) {
      const [note, min, max] = pick(meals)
      spend(date, between(min, max), 'food', note, chance(0.7) ? HDFC : CASH)
    }
    if (weekend && chance(0.35)) {
      spend(date, between(450, 1400), 'food', pick(['Dinner out', 'Brunch with friends', 'Pizza night']), ICICI)
    }
    if (dow === 6 && chance(0.8)) {
      spend(date, between(650, 1700), 'groceries', pick(['BigBasket', 'Zepto', 'D-Mart']), chance(0.5) ? ICICI : HDFC)
    } else if (!weekend && chance(0.12)) {
      spend(date, between(90, 320), 'groceries', 'Milk & veggies', CASH)
    }
    if (!weekend && chance(0.4)) {
      spend(date, between(70, 340), 'transport', pick(['Uber to office', 'Rapido', 'Auto', 'Metro']), HDFC)
    }
    if (chance(0.11)) spend(date, between(500, 900), 'fuel', 'Petrol', HDFC)
    if (chance(0.11)) {
      spend(date, between(399, 3400), 'shopping', pick(['Amazon order', 'Myntra', 'Decathlon', 'Flipkart', 'Uniqlo']), ICICI)
    }
    if (weekend && chance(0.3)) {
      spend(date, between(250, 900), 'entertainment', pick(['Movie night', 'Bowling', 'Stand-up show', 'Gaming cafe']), chance(0.5) ? ICICI : HDFC)
    }
    if (chance(0.04)) spend(date, between(120, 650), 'health', 'Pharmacy', HDFC)
    if (chance(0.03)) spend(date, between(150, 400), 'personal', 'Haircut', CASH)
  }

  // One-offs.
  const m3 = addMonths(current, -3)
  const m2 = addMonths(current, -2)
  const m1 = addMonths(current, -1)
  spend(dateInMonth(m3, 11), 499, 'education', 'Udemy course', ICICI)
  add(dateInMonth(m2, 20), { type: 'income', amount: 12000, category: 'freelance', note: 'Freelance landing page', accountId: SBI })
  spend(dateInMonth(m2, 24), 1850, 'travel', 'Bus to Coorg', HDFC)
  spend(dateInMonth(m2, 25), 4600, 'travel', 'Coorg homestay', ICICI)
  spend(dateInMonth(m2, 26), 950, 'travel', 'Coffee estate tour', CASH)
  spend(dateInMonth(m1, 13), 1500, 'gifts', 'Birthday gift', HDFC)
  add(dateInMonth(m1, 17), { type: 'income', amount: 799, category: 'refund', note: 'Amazon refund', accountId: ICICI })
  add(dateInMonth(m1, 28), { type: 'income', amount: 640, category: 'interest', note: 'Savings interest', accountId: SBI })

  // Friends, relative to today so the "who owes what" story always reads well.
  add(addDays(today, -70), { type: 'lend', amount: 5000, note: 'Deposit for new flat', personId: 'sp_kiran', accountId: SBI })
  add(addDays(today, -31), { type: 'collect', amount: 5000, personId: 'sp_kiran', accountId: SBI })
  add(addDays(today, -47), { type: 'lend', amount: 2500, note: 'Concert tickets', personId: 'sp_ravi', accountId: HDFC })
  add(addDays(today, -19), { type: 'collect', amount: 1000, personId: 'sp_ravi', accountId: HDFC })
  add(addDays(today, -8), { type: 'borrow', amount: 1200, note: 'Cab + dinner split', personId: 'sp_sneha', accountId: CASH })
  add(addDays(today, -3), { type: 'lend', amount: 800, note: 'Lunch', personId: 'sp_arjun', accountId: CASH })

  // Keep the demo balances believable whatever the random draw was.
  const floors = { [HDFC]: 18000, [SBI]: 60000, [CASH]: 600 }
  const balances = computeBalances(accounts, transactions)
  for (const account of accounts) {
    const floor = floors[account.id]
    const balance = balances.get(account.id)
    if (floor !== undefined && balance < floor) account.opening = round2(account.opening + floor - balance)
  }

  return normalizeState({
    settings: { name: '', privacy: false, pinHash: null, onboarded: true },
    accounts,
    transactions,
    loans,
    people,
    budgets: { food: 7000, groceries: 5000, transport: 2500, shopping: 4000, entertainment: 2500, subscriptions: 600, fuel: 2000, bills: 3500 },
    goals: [
      { id: 'sg_emergency', name: 'Emergency fund', target: 150000, saved: 64000, color: 'mint', deadline: addMonths(current, 10) },
      { id: 'sg_goa', name: 'Goa trip', target: 30000, saved: 18500, color: 'sky', deadline: addMonths(current, 3) },
      { id: 'sg_mac', name: 'MacBook Air', target: 110000, saved: 26000, color: 'lilac', deadline: addMonths(current, 8) },
    ],
    meta: { sample: true },
  })
}
