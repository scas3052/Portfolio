import {
  LuArrowDownLeft,
  LuArrowLeftRight,
  LuArrowUpRight,
  LuBanknote,
  LuBriefcase,
  LuBuilding2,
  LuBus,
  LuClapperboard,
  LuCoins,
  LuCreditCard,
  LuEllipsis,
  LuFuel,
  LuGift,
  LuGraduationCap,
  LuHandCoins,
  LuHandshake,
  LuHeartPulse,
  LuHouse,
  LuLandmark,
  LuLaptop,
  LuPiggyBank,
  LuPlane,
  LuReceipt,
  LuRepeat,
  LuShoppingBag,
  LuShoppingBasket,
  LuSmartphone,
  LuSparkles,
  LuTrophy,
  LuUndo2,
  LuUsers,
  LuUtensils,
} from 'react-icons/lu'

// `tone` maps to a pastel CSS variable (--lime, --peach, …).
export const EXPENSE_CATEGORIES = [
  { id: 'food', label: 'Food & dining', short: 'Food', icon: LuUtensils, tone: 'peach' },
  { id: 'groceries', label: 'Groceries', short: 'Groceries', icon: LuShoppingBasket, tone: 'mint' },
  { id: 'transport', label: 'Transport', short: 'Transport', icon: LuBus, tone: 'sky' },
  { id: 'fuel', label: 'Fuel', short: 'Fuel', icon: LuFuel, tone: 'butter' },
  { id: 'shopping', label: 'Shopping', short: 'Shopping', icon: LuShoppingBag, tone: 'lilac' },
  { id: 'bills', label: 'Bills & utilities', short: 'Bills', icon: LuReceipt, tone: 'tan' },
  { id: 'rent', label: 'Rent & home', short: 'Rent', icon: LuHouse, tone: 'coral' },
  { id: 'health', label: 'Health & fitness', short: 'Health', icon: LuHeartPulse, tone: 'rose' },
  { id: 'entertainment', label: 'Entertainment', short: 'Fun', icon: LuClapperboard, tone: 'teal' },
  { id: 'travel', label: 'Travel', short: 'Travel', icon: LuPlane, tone: 'sky' },
  { id: 'education', label: 'Education', short: 'Learning', icon: LuGraduationCap, tone: 'lime' },
  { id: 'subscriptions', label: 'Subscriptions', short: 'Subs', icon: LuRepeat, tone: 'butter' },
  { id: 'family', label: 'Family', short: 'Family', icon: LuUsers, tone: 'mint' },
  { id: 'gifts', label: 'Gifts & donations', short: 'Gifts', icon: LuGift, tone: 'rose' },
  { id: 'personal', label: 'Personal care', short: 'Personal', icon: LuSparkles, tone: 'peach' },
  { id: 'other', label: 'Other', short: 'Other', icon: LuEllipsis, tone: 'gray' },
]

export const EMI_CATEGORY = { id: 'emi', label: 'Loan EMIs', short: 'EMIs', icon: LuLandmark, tone: 'coral' }

export const INCOME_CATEGORIES = [
  { id: 'salary', label: 'Salary', short: 'Salary', icon: LuBriefcase, tone: 'lime' },
  { id: 'freelance', label: 'Freelance', short: 'Freelance', icon: LuLaptop, tone: 'lilac' },
  { id: 'interest', label: 'Interest', short: 'Interest', icon: LuPiggyBank, tone: 'mint' },
  { id: 'refund', label: 'Refund / cashback', short: 'Refund', icon: LuUndo2, tone: 'sky' },
  { id: 'bonus', label: 'Bonus', short: 'Bonus', icon: LuTrophy, tone: 'butter' },
  { id: 'gift_in', label: 'Gift received', short: 'Gift', icon: LuGift, tone: 'rose' },
  { id: 'other_in', label: 'Other income', short: 'Other', icon: LuCoins, tone: 'gray' },
]

const ALL = [...EXPENSE_CATEGORIES, EMI_CATEGORY, ...INCOME_CATEGORIES]
const BY_ID = new Map(ALL.map((category) => [category.id, category]))
const OTHER = BY_ID.get('other')

export const EXPENSE_IDS = new Set(EXPENSE_CATEGORIES.map((c) => c.id))
export const INCOME_IDS = new Set(INCOME_CATEGORIES.map((c) => c.id))

export function categoryMeta(id) {
  return BY_ID.get(id) || OTHER
}

export const TYPE_META = {
  expense: { label: 'Spent', verb: 'Spent', icon: LuArrowUpRight, tone: 'peach' },
  income: { label: 'Earned', verb: 'Received', icon: LuArrowDownLeft, tone: 'lime' },
  transfer: { label: 'Transfer', verb: 'Moved', icon: LuArrowLeftRight, tone: 'sky' },
  emi: { label: 'EMI', verb: 'EMI paid', icon: LuLandmark, tone: 'coral' },
  lend: { label: 'Lent', verb: 'You lent', icon: LuHandCoins, tone: 'mint' },
  borrow: { label: 'Borrowed', verb: 'You borrowed', icon: LuHandshake, tone: 'rose' },
  collect: { label: 'Got back', verb: 'Got back', icon: LuArrowDownLeft, tone: 'mint' },
  repay: { label: 'Paid back', verb: 'Paid back', icon: LuArrowUpRight, tone: 'rose' },
}

export const PEOPLE_TYPES = ['lend', 'borrow', 'collect', 'repay']

export const ACCOUNT_KINDS = [
  { id: 'savings', label: 'Savings' },
  { id: 'salary', label: 'Salary' },
  { id: 'current', label: 'Current' },
  { id: 'wallet', label: 'Wallet / UPI' },
  { id: 'cash', label: 'Cash' },
  { id: 'credit', label: 'Credit card' },
]

export const KIND_ICONS = {
  savings: LuPiggyBank,
  salary: LuBriefcase,
  current: LuBuilding2,
  wallet: LuSmartphone,
  cash: LuBanknote,
  credit: LuCreditCard,
}

export const TONES = ['lime', 'lilac', 'peach', 'sky', 'mint', 'butter', 'rose', 'tan', 'coral', 'teal']

export function accountKindLabel(kind) {
  return ACCOUNT_KINDS.find((k) => k.id === kind)?.label || 'Account'
}
