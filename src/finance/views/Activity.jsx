import { useDeferredValue, useMemo, useState } from 'react'
import {
  LuArrowDownLeft,
  LuArrowLeftRight,
  LuArrowUpRight,
  LuCalendarDays,
  LuHandshake,
  LuHistory,
  LuLandmark,
  LuList,
  LuPlus,
  LuSearch,
  LuSearchX,
  LuX,
} from 'react-icons/lu'
import { EmptyState, Segmented, ViewHeader } from '../components/bits'
import { Money } from '../components/Money'
import { TxnList } from '../components/TxnRow'
import { useActions } from '../hooks/useActions'
import { PEOPLE_TYPES } from '../lib/categories'
import { formatDay, isISODate, monthLabel } from '../lib/dates'
import { plural, round2 } from '../lib/format'
import { navigate } from '../lib/router'
import { searchText, signedAmount } from '../lib/selectors'
import { useFinance, useUi } from '../store/contexts'

const PAGE = 60

const FILTERS = [
  { value: 'all', label: 'All', icon: LuList },
  { value: 'expense', label: 'Spends', icon: LuArrowUpRight, tone: 'peach' },
  { value: 'income', label: 'Income', icon: LuArrowDownLeft, tone: 'lime' },
  { value: 'emi', label: 'EMIs', icon: LuLandmark, tone: 'coral' },
  { value: 'people', label: 'People', icon: LuHandshake, tone: 'mint' },
  { value: 'transfer', label: 'Transfers', icon: LuArrowLeftRight, tone: 'sky' },
]

function matchesType(txn, type) {
  if (type === 'all') return true
  if (type === 'people') return PEOPLE_TYPES.includes(txn.type)
  return txn.type === type
}

export default function Activity({ params }) {
  const { state, derived } = useFinance()
  const { month } = useUi()
  const { addEntry } = useActions()
  const [type, setType] = useState('all')
  const [query, setQuery] = useState('')
  const [account, setAccount] = useState('')
  const deferredQuery = useDeferredValue(query)

  const day = isISODate(params?.day) ? params.day : ''
  const termsKey = deferredQuery.trim().toLowerCase().split(/\s+/).filter(Boolean).join(' ')
  const searching = termsKey !== ''
  const filterKey = [day, month, type, account, termsKey].join('|')
  const filtered = Boolean(day || searching || type !== 'all' || account)

  const results = useMemo(() => {
    const words = termsKey ? termsKey.split(' ') : []
    return derived.sorted.filter((txn) => {
      if (day) {
        if (txn.date !== day) return false
      } else if (!words.length && !txn.date.startsWith(month)) {
        return false
      }
      if (!matchesType(txn, type)) return false
      if (account && txn.accountId !== account && txn.toAccountId !== account) return false
      if (words.length) {
        const text = searchText(txn, derived.lookups)
        return words.every((word) => text.includes(word))
      }
      return true
    })
  }, [derived.sorted, derived.lookups, day, month, type, account, termsKey])

  const totals = useMemo(() => {
    let inflow = 0
    let outflow = 0
    for (const txn of results) {
      if (txn.type === 'transfer') continue
      const signed = signedAmount(txn)
      if (signed > 0) inflow += signed
      else outflow -= signed
    }
    return { inflow: round2(inflow), outflow: round2(outflow), net: round2(inflow - outflow) }
  }, [results])

  const [limit, setLimit] = useState({ key: filterKey, count: PAGE })
  const count = limit.key === filterKey ? limit.count : PAGE
  const shown = useMemo(() => results.slice(0, count), [results, count])

  const scope = day
    ? formatDay(day, { year: true })
    : searching
      ? 'every month'
      : monthLabel(month)

  const clearAll = () => {
    setType('all')
    setQuery('')
    setAccount('')
    if (day) navigate('activity')
  }

  return (
    <div className="g-view g-activity">
      <ViewHeader
        title="Activity"
        tone="sky"
        sub="Every rupee in and out. Tap an entry to edit it, swipe it left to delete."
        actions={
          <button type="button" className="g-btn g-btn--ink g-press" onClick={() => addEntry({ type: 'expense' })}>
            <LuPlus aria-hidden="true" /> Add entry
          </button>
        }
      />

      <section className="g-filters g-tile" aria-label="Filters">
        <label className="g-filters__search">
          <LuSearch aria-hidden="true" />
          <span className="sr-only">Search all entries</span>
          <input
            type="search"
            className="g-input"
            placeholder="Search notes, people, amounts…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && query) {
                event.stopPropagation()
                setQuery('')
              }
            }}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        {state.accounts.length > 0 && (
          <label className="g-filters__account">
            <span className="sr-only">Account</span>
            <select className="g-select" value={account} onChange={(event) => setAccount(event.target.value)}>
              <option value="">All accounts</option>
              {state.accounts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <Segmented
          options={FILTERS}
          value={type}
          onChange={setType}
          label="Entry type"
          size="sm"
          className="g-filters__types"
        />
        {day && (
          <p className="g-filters__day">
            <LuCalendarDays aria-hidden="true" />
            Only {formatDay(day, { year: true })}
            <button
              type="button"
              className="g-icon-btn g-icon-btn--sm g-press"
              onClick={() => navigate('activity')}
              aria-label="Show the whole month again"
            >
              <LuX aria-hidden="true" />
            </button>
          </p>
        )}
      </section>

      <dl className="g-strip" aria-live="polite">
        <div className="g-strip__item">
          <dt>{plural(results.length, 'entry', 'entries')}</dt>
          <dd>in {scope}</dd>
        </div>
        <div className="g-strip__item is-in">
          <dt>Came in</dt>
          <dd>
            <Money value={totals.inflow} tone="pos" />
          </dd>
        </div>
        <div className="g-strip__item is-out">
          <dt>Went out</dt>
          <dd>
            <Money value={totals.outflow} tone="neg" />
          </dd>
        </div>
        <div className="g-strip__item">
          <dt>Net</dt>
          <dd>
            <Money value={totals.net} sign="always" tone="auto" />
          </dd>
        </div>
      </dl>

      {results.length > 0 ? (
        <div className="g-ledger g-tile">
          <TxnList key={filterKey} txns={shown} />
          {results.length > count && (
            <button
              type="button"
              className="g-btn g-ledger__more g-press"
              onClick={() => setLimit({ key: filterKey, count: count + PAGE })}
            >
              Show {Math.min(PAGE, results.length - count)} more
              <span className="g-muted"> · {results.length - count} hidden</span>
            </button>
          )}
        </div>
      ) : state.transactions.length === 0 ? (
        <EmptyState
          icon={LuHistory}
          title="Your ledger is empty"
          body="Log what you spend and earn each day. It takes about five seconds an entry."
          action={
            <button type="button" className="g-btn g-btn--ink g-press" onClick={() => addEntry({ type: 'expense' })}>
              <LuPlus aria-hidden="true" /> Add the first entry
            </button>
          }
        />
      ) : (
        <EmptyState
          icon={LuSearchX}
          title={filtered ? 'Nothing matches' : `Nothing logged in ${monthLabel(month)}`}
          body={
            filtered
              ? 'Try another word or loosen the filters.'
              : 'Pick another month above, or add something for this one.'
          }
          action={
            filtered ? (
              <button type="button" className="g-btn g-press" onClick={clearAll}>
                Clear filters
              </button>
            ) : (
              <button type="button" className="g-btn g-btn--ink g-press" onClick={() => addEntry({ type: 'expense' })}>
                <LuPlus aria-hidden="true" /> Add entry
              </button>
            )
          }
        />
      )}
    </div>
  )
}
