// Tool schemas Munshi can call. Free tiers count every token, so descriptions stay
// terse, and only type/description/enum/items/properties/required are used
// because some providers (Gemini) reject other JSON-schema keywords.

export const ENTRY_TYPES = ['expense', 'income', 'transfer', 'emi', 'lend', 'borrow', 'collect', 'repay']

const str = (description) => ({ type: 'string', description })
const num = (description) => ({ type: 'number', description })
const obj = (properties, required) => ({ type: 'object', properties, ...(required ? { required } : {}) })
const month = str('YYYY-MM, default this month')

const ENTRY = {
  type: {
    type: 'string',
    enum: ENTRY_TYPES,
    description: 'expense: I spent; income: I earned; lend: I gave or paid for someone; borrow: someone gave me or paid for me; collect: someone paid me back; repay: I paid someone back',
  },
  amount: num('Rupees'),
  category: str('Category id; expense/income only'),
  account: str('Account paid from / received in (transfer: source); "none" if no account of mine was used'),
  toAccount: str('Transfer destination'),
  person: str('Name, for lend/borrow/collect/repay'),
  loan: str('Loan name, for emi'),
  date: str('YYYY-MM-DD, default today'),
  note: str('Short description'),
}

export const TOOLS = {
  get_overview: {
    description: 'Month summary: income, spending, savings, top categories, balances, net worth, dues, budgets at risk.',
    parameters: obj({ month }),
  },
  query_transactions: {
    description: 'Filter, total, group or list entries. Use for any "how much / when / which / biggest" question.',
    parameters: obj({
      month: str('YYYY-MM; omit (and from/to) for all time'),
      from: str('YYYY-MM-DD'),
      to: str('YYYY-MM-DD'),
      type: { type: 'string', enum: [...ENTRY_TYPES, 'spending'], description: 'spending = expense + emi' },
      category: str('Category id or name'),
      account: str('Account name'),
      person: str('Person name'),
      loan: str('Loan name'),
      text: str('Words in the note'),
      minAmount: num('Rupees'),
      maxAmount: num('Rupees'),
      groupBy: { type: 'string', enum: ['category', 'type', 'account', 'person', 'month', 'day'] },
      sort: { type: 'string', enum: ['newest', 'oldest', 'largest', 'smallest'] },
      limit: num('Items to list, max 25 (default 10)'),
    }),
  },
  calculate: {
    description: 'Exact arithmetic. Use for every sum, difference, split or percentage you state.',
    parameters: obj({ expression: str('e.g. "(45000-12000)/3" or "18% of 2500"') }, ['expression']),
  },
  get_accounts: {
    description: 'Accounts with balances, this month’s money in/out, and each credit card’s last bill, due date and unbilled spends.',
    parameters: obj({}),
  },
  get_people: {
    description: 'Who owes whom: net balance per person; pass name for their history.',
    parameters: obj({ filter: { type: 'string', enum: ['all', 'owes_me', 'i_owe', 'settled'] }, name: str('Person name') }),
  },
  get_loans: {
    description: 'Loans: EMI, paid, amount left, EMIs left, next due date.',
    parameters: obj({ name: str('Loan name') }),
  },
  get_budgets: {
    description: 'Monthly budget limits vs spent.',
    parameters: obj({ month }),
  },
  get_goals: {
    description: 'Savings goal jars: target, saved, monthly amount needed.',
    parameters: obj({}),
  },
  propose_entries: {
    description: 'Draft new entries (max 8). They appear as cards the user confirms; nothing is saved yet.',
    parameters: obj({ entries: { type: 'array', items: obj(ENTRY, ['type']) } }, ['entries']),
  },
  propose_update_entry: {
    description: 'Draft a change to an existing entry (get its id from query_transactions).',
    parameters: obj({ id: str('Entry id'), changes: obj(ENTRY) }, ['id', 'changes']),
  },
  propose_delete_entry: {
    description: 'Draft deleting an entry (get its id from query_transactions).',
    parameters: obj({ id: str('Entry id') }, ['id']),
  },
  propose_budget: {
    description: 'Draft a monthly budget for an expense category; 0 removes it.',
    parameters: obj({ category: str('Category id'), amount: num('Rupees per month') }, ['category', 'amount']),
  },
  propose_goal_contribution: {
    description: 'Draft putting money into a goal jar; negative takes it out.',
    parameters: obj({ goal: str('Goal name'), amount: num('Rupees') }, ['goal', 'amount']),
  },
  propose_setup: {
    description: 'Draft a new account, loan or goal.',
    parameters: obj(
      {
        kind: { type: 'string', enum: ['account', 'loan', 'goal'] },
        name: str('Name'),
        accountKind: { type: 'string', enum: ['savings', 'salary', 'current', 'wallet', 'cash', 'credit'] },
        bank: str('Bank'),
        last4: str('Last 4 digits'),
        balance: num('Current balance; credit card: amount due'),
        lender: str('Lender'),
        emi: num('Monthly EMI'),
        tenure: num('Total EMIs'),
        paidBefore: num('EMIs already paid'),
        startMonth: str('YYYY-MM of first EMI'),
        statementDay: num('Credit card: day of month the bill is generated'),
        dueDay: num('Day of month the EMI or card bill is due'),
        rate: num('Interest % a year'),
        principal: num('Loan amount'),
        account: str('Account EMIs are paid from'),
        target: num('Goal amount'),
        saved: num('Already saved'),
        deadline: str('YYYY-MM'),
      },
      ['kind', 'name'],
    ),
  },
}

export const READ_TOOLS = new Set(['get_accounts', 'get_people', 'get_loans', 'get_budgets', 'get_goals'])
export const WRITE_TOOLS = new Set(['propose_entries', 'propose_update_entry', 'propose_delete_entry', 'propose_budget', 'propose_goal_contribution', 'propose_setup'])
const CORE = ['get_overview', 'query_transactions', 'calculate']

const WRITE_VERB =
  /\b(spent|spend|spending|paid|pay|bought|buy|ordered|got|received|receive|earned|credited|salary|lent|lend|gave|give|borrowed|borrow|took|repaid|returned|transferred|transfer|moved|sent|send|deposited|withdrew|withdrawn|add|log|record|put|saved|contribute|emi)\b/
const QUESTION = /^(what|whats|what's|how|why|when|where|which|who|whom|whose|is|are|am|do|does|did|should|will|would|have|has|show|list|tell|compare|explain|summari[sz]e|give me)\b/
const POLITE = /^(can|could|would|will) you\b|^please\b/
// Asking to change the book, however politely, is never a read-only question.
const ACTION_VERB =
  /\b(delete|remove|edit|change|update|fix|correct|rename|create|set|add|make|undo|move|log|record|split|mark|cancel|hata|hatao|badal|badlo|mita|mitao|jod|jodo|daalo|daal do|likho|likh do|kar ?do)\b/
// A reply that goes along with (or turns down) what Munshi just offered.
const CONFIRM = /^(yes|yeah|yep|yup|ya|ok+|okay|sure|alright|do it|go ahead|please do|confirm|correct|right|no|nope|nah|ha+n?|ji|th?(?:ee|e|i)k hai|kar ?do|karo|nahi|nahin)\b/
// Only these bring in propose_setup, the largest schema.
const SETUP_WORDS = /\b(new|account|accounts|card|wallet|loan|goal|jar|open|opened|set ?up)\b/
const AMOUNT = /\d/
// Years, ISO dates and "5th" aren't amounts.
const DATEISH = /\b(19|20)\d\d(-\d\d){0,2}\b|\b\d{1,2}(st|nd|rd|th)\b/g

const lower = (text) => String(text ?? '').trim().toLowerCase()

/** The likely intent of a message: 'write', 'read' or 'any'. */
export function intentOf(text) {
  const t = lower(text)
  if (!t || CONFIRM.test(t)) return 'any'
  const asks = t.includes('?') || QUESTION.test(t)
  const polite = POLITE.test(t)
  const amount = AMOUNT.test(t.replace(DATEISH, ' '))
  if (WRITE_VERB.test(t) && (amount || /\bemi\b/.test(t)) && (!asks || polite)) return 'write'
  if ((asks || polite) && !amount && !ACTION_VERB.test(t)) return 'read'
  return 'any'
}

const asTool = (name) => ({ type: 'function', function: { name, ...TOOLS[name] } })

/**
 * The tool list to send for a message: a smaller set when the intent is clear, to save tokens.
 * An answer to Munshi's own question (`followUp`) continues an earlier request, so it gets every tool.
 */
export function toolsFor(text, { followUp = false } = {}) {
  const intent = followUp ? 'any' : intentOf(text)
  let keep = () => true
  if (intent === 'read') keep = (name) => CORE.includes(name) || READ_TOOLS.has(name)
  else if (intent === 'write') {
    const setup = SETUP_WORDS.test(lower(text))
    // get_people lets Munshi check who owes whom before drafting a collect or repay.
    keep = (name) => CORE.includes(name) || name === 'get_people' || (WRITE_TOOLS.has(name) && (setup || name !== 'propose_setup'))
  }
  return Object.keys(TOOLS).filter(keep).map(asTool)
}
