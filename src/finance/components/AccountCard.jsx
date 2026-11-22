import { useMemo, useState } from 'react'
import { LuArrowDownLeft, LuArrowUpRight, LuPencil, LuReceipt, LuRotateCcw } from 'react-icons/lu'
import { accountKindLabel, KIND_ICONS } from '../lib/categories'
import { cx, toneVar } from '../lib/cx'
import { shortDate, shortMonth } from '../lib/dates'
import { round2 } from '../lib/format'
import { navigate } from '../lib/router'
import { accountFlow } from '../lib/selectors'
import { useFinance, useUi } from '../store/contexts'
import { Money } from './Money'

function billLabel(bill) {
  if (bill.overdue) return `Overdue since ${shortDate(bill.dueDate)}`
  if (bill.billDue > 0) return bill.daysToDue === 0 ? 'Bill due today' : `Bill due by ${shortDate(bill.dueDate)}`
  return bill.billed > 0 ? 'Bill paid' : 'No bill due'
}

/** A bank-card shaped tile. Tap to flip and see this month's money in and out. */
export function AccountCard({ account, balance, index = 0 }) {
  const { state, derived } = useFinance()
  const { currentMonth, openSheet } = useUi()
  const [flipped, setFlipped] = useState(false)
  const flow = useMemo(
    () => accountFlow(account.id, state.transactions, currentMonth),
    [account.id, state.transactions, currentMonth],
  )
  const Icon = KIND_ICONS[account.kind] || KIND_ICONS.savings
  const credit = account.kind === 'credit'
  // A card paid beyond its dues has nothing billed, so it keeps the plain balance view.
  const bill = credit && balance <= 0 ? derived.cardBills.get(account.id) : null
  const net = round2(flow.inflow - flow.outflow)

  return (
    <div
      className={cx('g-card', flipped && 'is-flipped', credit && 'g-card--credit')}
      style={{ '--i': index, ...toneVar(account.color) }}
    >
      <div className="g-card__inner">
        <button
          type="button"
          className="g-card__face g-card__front"
          inert={flipped}
          onClick={() => setFlipped(true)}
          aria-label={`${account.name}. Show this month's money in and out`}
        >
          <span className="g-card__top">
            <span className="g-card__kind">
              <Icon aria-hidden="true" />
              {accountKindLabel(account.kind)}
            </span>
            {account.bank && <span className="g-card__bank">{account.bank}</span>}
          </span>
          {account.kind !== 'cash' && account.kind !== 'wallet' && <span className="g-card__chip" aria-hidden="true" />}
          {bill ? (
            <span className="g-card__balance">
              <span className="g-card__label">{billLabel(bill)}</span>
              <Money value={-bill.billDue} tone={bill.billDue > 0 ? 'neg' : undefined} />
              <span className="g-card__sub">
                {bill.unbilled > 0 ? (
                  <>
                    Unbilled <Money value={bill.unbilled} /> · next bill {shortDate(bill.nextStatement)}
                  </>
                ) : (
                  <>Next bill {shortDate(bill.nextStatement)}</>
                )}
              </span>
            </span>
          ) : (
            <span className="g-card__balance">
              <span className="g-card__label">{credit ? 'Card dues' : 'Balance'}</span>
              <Money value={balance} tone={balance < 0 ? 'neg' : undefined} />
            </span>
          )}
          <span className="g-card__bottom">
            <span className="g-card__name">{account.name}</span>
            {account.last4 && <span className="g-card__digits">•••• {account.last4}</span>}
          </span>
        </button>

        <div className="g-card__face g-card__back" inert={!flipped}>
          <span className="g-card__stripe" aria-hidden="true" />
          <p className="g-card__label">{shortMonth(currentMonth)} so far</p>
          <dl className="g-card__flow">
            <div>
              <dt>
                <LuArrowDownLeft aria-hidden="true" /> In
              </dt>
              <dd>
                <Money value={flow.inflow} tone="pos" />
              </dd>
            </div>
            <div>
              <dt>
                <LuArrowUpRight aria-hidden="true" /> Out
              </dt>
              <dd>
                <Money value={flow.outflow} tone="neg" />
              </dd>
            </div>
            <div className="g-card__net">
              <dt>Net</dt>
              <dd>
                <Money value={net} sign="always" tone="auto" />
              </dd>
            </div>
          </dl>
          <div className="g-card__actions">
            <button type="button" className="g-btn g-btn--sm g-press" onClick={() => openSheet('account', { account })}>
              <LuPencil aria-hidden="true" /> Edit
            </button>
            {credit && (
              <button
                type="button"
                className="g-btn g-btn--sm g-press"
                onClick={() => navigate('activity', { account: account.id })}
              >
                <LuReceipt aria-hidden="true" /> Statements
              </button>
            )}
            <button
              type="button"
              className="g-btn g-btn--sm g-btn--ghost g-press"
              onClick={() => setFlipped(false)}
              aria-label="Flip card back"
            >
              <LuRotateCcw aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
