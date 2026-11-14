// Turns a Munshi draft into what its voucher card shows: a title, a tone, the big amount and a few rows.
import { accountKindLabel, categoryMeta, PEOPLE_TYPES, TYPE_META } from '../../lib/categories'
import { monthLabel, relativeDay } from '../../lib/dates'
import { formatINR } from '../../lib/format'
import { describeTxn } from '../../lib/selectors'

const PEOPLE = new Set(PEOPLE_TYPES)
const DASH = '—'

const SETUP_META = {
  account: { title: 'New account', tone: 'butter' },
  loan: { title: 'New loan', tone: 'coral' },
  goal: { title: 'New savings jar', tone: 'sky' },
}

function nameOf(map, id, fallback = DASH) {
  return (id && map?.get(id)?.name) || fallback
}

function day(iso, today) {
  return iso ? relativeDay(iso, today) : DASH
}

function entryRows(data, { derived, today }) {
  const { lookups } = derived
  const rows = []
  if (data.type === 'expense' || data.type === 'income') rows.push(['Category', categoryMeta(data.category).label])
  if (data.type === 'emi') rows.push(['Loan', nameOf(lookups.loans, data.loanId)])
  if (PEOPLE.has(data.type)) {
    const known = nameOf(lookups.people, data.personId, '')
    rows.push(['Person', known || (data.personName ? `${data.personName} (new)` : DASH)])
  }
  if (data.type === 'transfer') {
    rows.push(['From', nameOf(lookups.accounts, data.accountId)])
    rows.push(['To', nameOf(lookups.accounts, data.toAccountId)])
  } else {
    rows.push(['Account', data.accountId ? nameOf(lookups.accounts, data.accountId) : 'Not linked'])
  }
  rows.push(['Date', day(data.date, today)])
  if (data.note) rows.push(['Note', `“${data.note}”`])
  return rows
}

/** Only the fields an update actually changes, as "before → after". */
function updateRows(before, after, ctx) {
  const was = entryRows(before, ctx)
  const now = entryRows(after, ctx)
  const old = new Map(was)
  const rows = now.filter(([label, value]) => old.get(label) !== value).map(([label, value]) => {
    const previous = old.get(label)
    return [label, previous ? `${previous} → ${value}` : value]
  })
  if (before.type !== after.type) rows.unshift(['Type', `${TYPE_META[before.type]?.label} → ${TYPE_META[after.type]?.label}`])
  return rows
}

function setupView(setup, prefill, ctx) {
  const meta = SETUP_META[setup] || { title: 'New item', tone: 'gray' }
  const p = prefill || {}
  if (setup === 'account') {
    const credit = p.kind === 'credit'
    return {
      ...meta,
      amount: Math.abs(Number(p.opening) || 0),
      caption: credit ? 'due on the card' : 'opening balance',
      rows: [
        ['Name', p.name || DASH],
        ['Kind', accountKindLabel(p.kind)],
        ...(p.bank ? [['Bank', p.bank]] : []),
        ...(p.last4 ? [['Ends in', p.last4]] : []),
      ],
    }
  }
  if (setup === 'loan') {
    return {
      ...meta,
      amount: Number(p.emi) || null,
      caption: 'EMI each month',
      rows: [
        ['Name', p.name || DASH],
        ...(p.lender ? [['Lender', p.lender]] : []),
        ['EMIs', p.tenure ? `${p.paidBefore || 0} of ${p.tenure} paid` : DASH],
        ['Starts', p.startMonth ? monthLabel(p.startMonth, 'short') : DASH],
        ['Due day', p.dueDay ? `${p.dueDay} of each month` : DASH],
        ['Pays from', nameOf(ctx.derived.lookups.accounts, p.accountId)],
      ],
    }
  }
  return {
    ...meta,
    amount: Number(p.target) || null,
    caption: 'target',
    rows: [
      ['Name', p.name || DASH],
      ['Saved', formatINR(Number(p.saved) || 0)],
      ['By', p.deadline ? monthLabel(p.deadline, 'short') : 'No deadline'],
    ],
  }
}

/**
 * ctx = {derived, state, today}. Returns {title, tone, amount, caption, was, rows}; `amount` is null when unknown,
 * `was` is the previous amount when an edit changes it.
 */
export function voucherView(draft, ctx) {
  const data = draft?.data || {}
  switch (draft?.kind) {
    case 'entry': {
      const meta = TYPE_META[data.type] || { label: 'Entry', tone: 'gray' }
      return { title: meta.label, tone: meta.tone, amount: data.amount || null, caption: '', was: null, rows: entryRows(data, ctx) }
    }
    case 'update': {
      const { before, after } = data
      if (!before || !after) break
      const changed = Math.abs((before.amount || 0) - (after.amount || 0)) > 0.004
      return {
        title: 'Edit entry',
        tone: 'sky',
        amount: after.amount || null,
        caption: describeTxn(before, ctx.derived.lookups).title,
        was: changed ? before.amount : null,
        rows: updateRows(before, after, ctx),
      }
    }
    case 'delete': {
      const { before } = data
      if (!before) break
      return {
        title: 'Delete entry',
        tone: 'rose',
        amount: before.amount || null,
        caption: describeTxn(before, ctx.derived.lookups).title,
        was: null,
        rows: [
          ['Type', TYPE_META[before.type]?.label || DASH],
          ['Date', day(before.date, ctx.today)],
          ...(before.note ? [['Note', `“${before.note}”`]] : []),
        ],
      }
    }
    case 'budget': {
      const label = categoryMeta(data.category).label
      return {
        title: data.amount ? 'Monthly budget' : 'Remove budget',
        tone: 'lilac',
        amount: data.amount || null,
        caption: data.amount ? 'a month' : '',
        was: data.previous && data.previous !== data.amount ? data.previous : null,
        rows: [['Category', label], ['Before', data.previous ? formatINR(data.previous) : 'No budget']],
      }
    }
    case 'contribution': {
      const goal = ctx.state.goals.find((g) => g.id === data.goalId)
      const after = (Number(data.previousSaved) || 0) + (Number(data.amount) || 0)
      return {
        title: data.amount >= 0 ? 'Into the jar' : 'Out of the jar',
        tone: 'sky',
        amount: Math.abs(data.amount) || null,
        caption: goal?.name || '',
        was: null,
        rows: [
          ['Jar', goal?.name || DASH],
          ['Saved', `${formatINR(Number(data.previousSaved) || 0)} → ${formatINR(after)}`],
          ...(goal?.target ? [['Target', formatINR(goal.target)]] : []),
        ],
      }
    }
    case 'setup':
      return { was: null, ...setupView(data.setup, data.prefill, ctx) }
    default:
      break
  }
  return { title: 'Draft', tone: 'gray', amount: null, caption: draft?.summary || '', was: null, rows: [] }
}
