import { round2 } from '../lib/format'
import { buildSample } from '../lib/sample'
import { emptyState, normalizeAccount, normalizeGoal, normalizeLoan, normalizeTxn } from '../lib/schema'

const replaceById = (list, item) => list.map((existing) => (existing.id === item.id ? item : existing))
const withoutId = (list, id) => list.filter((item) => item.id !== id)

// ids and timestamps are created in event handlers and passed in, keeping the reducer pure.
export function reducer(state, action) {
  switch (action.type) {
    case 'onboard/fresh': {
      const account = action.account ? normalizeAccount(action.account, 0) : null
      return {
        ...emptyState(),
        settings: { ...state.settings, name: action.name ?? state.settings.name, onboarded: true },
        accounts: account ? [account] : [],
      }
    }
    case 'onboard/sample':
      return {
        ...buildSample(action.today),
        settings: { ...state.settings, name: action.name ?? state.settings.name, onboarded: true },
      }
    case 'data/replace':
      return action.state
    case 'data/import':
      return {
        ...action.state,
        settings: { ...action.state.settings, pinHash: state.settings.pinHash, onboarded: true },
      }
    case 'data/clear':
      return emptyState()
    case 'settings/update':
      return { ...state, settings: { ...state.settings, ...action.patch } }

    case 'txn/add':
    case 'txn/restore': {
      const txn = normalizeTxn(action.txn)
      if (!txn || state.transactions.some((t) => t.id === txn.id)) return state
      return { ...state, transactions: [...state.transactions, txn] }
    }
    case 'txn/update': {
      const txn = normalizeTxn(action.txn)
      return txn ? { ...state, transactions: replaceById(state.transactions, txn) } : state
    }
    case 'txn/delete':
      return { ...state, transactions: withoutId(state.transactions, action.id) }

    case 'account/add': {
      const account = normalizeAccount(action.account, state.accounts.length)
      return account ? { ...state, accounts: [...state.accounts, account] } : state
    }
    case 'account/update': {
      const account = normalizeAccount(action.account, 0)
      return account ? { ...state, accounts: replaceById(state.accounts, account) } : state
    }
    case 'account/delete': {
      const { id } = action
      return {
        ...state,
        accounts: withoutId(state.accounts, id),
        transactions: state.transactions.map((t) =>
          t.accountId === id || t.toAccountId === id
            ? { ...t, accountId: t.accountId === id ? '' : t.accountId, toAccountId: t.toAccountId === id ? '' : t.toAccountId }
            : t,
        ),
        loans: state.loans.map((loan) => (loan.accountId === id ? { ...loan, accountId: '' } : loan)),
      }
    }

    case 'loan/add': {
      const loan = normalizeLoan(action.loan, state.loans.length)
      return loan ? { ...state, loans: [...state.loans, loan] } : state
    }
    case 'loan/update': {
      const loan = normalizeLoan(action.loan, 0)
      return loan ? { ...state, loans: replaceById(state.loans, loan) } : state
    }
    case 'loan/delete':
      return {
        ...state,
        loans: withoutId(state.loans, action.id),
        transactions: state.transactions.map((t) => (t.loanId === action.id ? { ...t, loanId: '' } : t)),
      }

    case 'person/add': {
      const name = String(action.person.name || '').trim().slice(0, 40)
      if (!name) return state
      return { ...state, people: [...state.people, { id: action.person.id, name }] }
    }
    case 'person/update': {
      const name = String(action.person.name || '').trim().slice(0, 40)
      if (!name) return state
      return { ...state, people: replaceById(state.people, { id: action.person.id, name }) }
    }
    case 'person/delete':
      // ifUnused: an undo cleaning up a person it created, but only once nothing points at them.
      if (action.ifUnused && state.transactions.some((t) => t.personId === action.id)) return state
      return {
        ...state,
        people: withoutId(state.people, action.id),
        transactions: state.transactions.map((t) => (t.personId === action.id ? { ...t, personId: '' } : t)),
      }

    case 'budget/set': {
      const budgets = { ...state.budgets }
      const amount = round2(action.amount)
      if (amount > 0) budgets[action.id] = amount
      else delete budgets[action.id]
      return { ...state, budgets }
    }
    case 'budget/replaceAll': {
      const budgets = {}
      for (const [id, value] of Object.entries(action.budgets || {})) {
        const amount = round2(value)
        if (amount > 0) budgets[id] = amount
      }
      return { ...state, budgets }
    }

    case 'goal/add': {
      const goal = normalizeGoal(action.goal, state.goals.length)
      return goal ? { ...state, goals: [...state.goals, goal] } : state
    }
    case 'goal/update': {
      const goal = normalizeGoal(action.goal, 0)
      return goal ? { ...state, goals: replaceById(state.goals, goal) } : state
    }
    case 'goal/delete':
      return { ...state, goals: withoutId(state.goals, action.id) }
    case 'goal/contribute':
      return {
        ...state,
        goals: state.goals.map((goal) =>
          goal.id === action.id ? { ...goal, saved: Math.max(0, round2(goal.saved + action.amount)) } : goal,
        ),
      }

    default:
      return state
  }
}
