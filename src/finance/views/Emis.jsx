import { useMemo } from 'react'
import {
  LuBadgeCheck,
  LuCalendarClock,
  LuCalendarRange,
  LuLandmark,
  LuPencil,
  LuPercent,
  LuPlus,
  LuReceiptIndianRupee,
} from 'react-icons/lu'
import { EmptyState, ProgressBar, Sticker, Tile, ViewHeader } from '../components/bits'
import { Money, Odometer } from '../components/Money'
import { TxnMiniList } from '../components/TxnRow'
import { useActions } from '../hooks/useActions'
import { cx, toneVar } from '../lib/cx'
import { addMonths, formatDay, inDays, monthDiff, monthLabel, monthOf, shortMonth } from '../lib/dates'
import { formatPercent, plural, round2 } from '../lib/format'
import { useFinance, useUi } from '../store/contexts'

const MAX_DOTS = 60
const OUTLOOK = 12

function Punchcard({ status }) {
  const { loan, paidCount } = status
  const per = Math.max(1, Math.ceil(loan.tenure / MAX_DOTS))
  const dots = Math.ceil(loan.tenure / per)
  const punched = Math.floor(paidCount / per)
  return (
    <div className="g-punch">
      <ol
        className="g-punch__dots"
        role="img"
        aria-label={`${paidCount} of ${plural(loan.tenure, 'EMI')} paid`}
      >
        {Array.from({ length: dots }, (_, i) => (
          <li key={i} className={cx('g-punch__dot', i < punched && 'is-paid')} style={{ '--i': i }} />
        ))}
      </ol>
      {per > 1 && <p className="g-punch__note">Each dot is {per} EMIs</p>}
    </div>
  )
}

function Ticket({ status, index }) {
  const { loan } = status
  const { openSheet } = useUi()
  const { logEmi, addEntry } = useActions()
  const late = status.overdue
  const settledThisMonth = status.paidThisMonth && !late
  const interest = loan.principal > 0 && status.total > loan.principal ? round2(status.total - loan.principal) : 0
  const before = Math.min(loan.paidBefore, loan.tenure)

  return (
    <article
      className={cx('g-ticket', late && 'is-overdue')}
      style={{ '--i': index, ...toneVar(loan.color || 'coral') }}
      aria-labelledby={`g-loan-${loan.id}`}
    >
      <header className="g-ticket__head">
        <div>
          <h3 id={`g-loan-${loan.id}`} className="g-ticket__name">
            {loan.name}
          </h3>
          <p className="g-ticket__lender">
            {loan.lender || 'Loan'}
            {loan.rate > 0 && ` · ${loan.rate}% a year`}
          </p>
        </div>
        <p className="g-ticket__emi">
          <Money value={loan.emi} />
          <small>a month</small>
        </p>
      </header>

      <Punchcard status={status} />

      <ProgressBar value={status.progress} tone={loan.color || 'coral'} label={`${loan.name} paid off`} />

      <dl className="g-ticket__stats">
        <div>
          <dt>Paid</dt>
          <dd>
            <Money value={status.paidAmount} tone="pos" />
          </dd>
        </div>
        <div>
          <dt>Still to pay</dt>
          <dd>
            <Money value={status.left} tone="neg" />
          </dd>
        </div>
        <div>
          <dt>EMIs left</dt>
          <dd>
            {status.remaining}
            <small> of {loan.tenure}</small>
          </dd>
        </div>
        <div>
          <dt>Last EMI</dt>
          <dd>{monthLabel(status.endMonth, 'short')}</dd>
        </div>
      </dl>

      <p className={cx('g-ticket__due', late && 'is-overdue')}>
        <LuCalendarClock aria-hidden="true" />
        {late ? (
          <>
            <strong>Overdue</strong> · was due {formatDay(status.nextDue)} ({inDays(status.daysToDue)})
          </>
        ) : (
          <>
            Next due <strong>{formatDay(status.nextDue)}</strong> · {inDays(status.daysToDue)}
          </>
        )}
      </p>

      {interest > 0 && (
        <p className="g-ticket__interest">
          <LuPercent aria-hidden="true" />
          <span>
            Interest over the whole loan: <Money value={interest} /> ({formatPercent(interest / loan.principal)} on top
            of what you borrowed)
          </span>
        </p>
      )}

      <div className="g-ticket__actions">
        {settledThisMonth ? (
          <Sticker tone="mint" rotate={-4}>
            <LuBadgeCheck aria-hidden="true" /> This month’s paid
          </Sticker>
        ) : (
          <button type="button" className="g-btn g-btn--ink g-press" onClick={() => logEmi(status)}>
            <LuReceiptIndianRupee aria-hidden="true" /> Mark paid
          </button>
        )}
        <button
          type="button"
          className="g-btn g-btn--sm g-press"
          onClick={() => addEntry({ type: 'emi', loanId: loan.id })}
        >
          Different amount
        </button>
        <button
          type="button"
          className="g-icon-btn g-press"
          onClick={() => openSheet('loan', { loan })}
          aria-label={`Edit ${loan.name}`}
        >
          <LuPencil aria-hidden="true" />
        </button>
      </div>

      {(status.payments.length > 0 || before > 0) && (
        <details className="g-details g-ticket__history">
          <summary>
            Payment history
            <span className="g-muted"> · {plural(status.payments.length + before, 'EMI')}</span>
          </summary>
          {status.payments.length > 0 && <TxnMiniList txns={status.payments} />}
          {before > 0 && (
            <p className="g-muted g-ticket__before">
              + {plural(before, 'EMI')} paid before you started tracking here
            </p>
          )}
        </details>
      )}
    </article>
  )
}

export default function Emis() {
  const { derived } = useFinance()
  const { currentMonth, openSheet } = useUi()
  const { position } = derived

  const active = useMemo(
    () => derived.loans.filter((status) => !status.done).sort((a, b) => a.daysToDue - b.daysToDue),
    [derived.loans],
  )
  const closed = useMemo(() => derived.loans.filter((status) => status.done), [derived.loans])

  const monthly = round2(active.reduce((sum, status) => sum + status.loan.emi, 0))
  const paid = round2(active.reduce((sum, status) => sum + status.paidAmount, 0))
  const total = round2(active.reduce((sum, status) => sum + status.total, 0))
  const freeBy = active.reduce((latest, status) => (status.endMonth > latest ? status.endMonth : latest), '')
  const monthsToFree = freeBy ? Math.max(0, monthDiff(currentMonth, freeBy)) + 1 : 0

  const outlook = useMemo(() => {
    const months = Array.from({ length: OUTLOOK }, (_, i) => addMonths(currentMonth, i))
    return months.map((month) => ({
      month,
      amount: round2(
        active.reduce(
          (sum, status) =>
            month >= monthOf(status.nextDue) && month <= status.endMonth ? sum + status.loan.emi : sum,
          0,
        ),
      ),
      ending: active.filter((status) => status.endMonth === month).map((status) => status.loan.name),
    }))
  }, [active, currentMonth])
  const outlookMax = Math.max(1, ...outlook.map((row) => row.amount))

  const addLoan = (
    <button type="button" className="g-btn g-btn--ink g-press" onClick={() => openSheet('loan')}>
      <LuPlus aria-hidden="true" /> Add EMI or loan
    </button>
  )

  if (derived.loans.length === 0) {
    return (
      <div className="g-view g-emis">
        <ViewHeader title="EMIs & loans" tone="coral" sub="Every EMI you pay, what’s cleared and what’s left." />
        <EmptyState
          icon={LuLandmark}
          title="No EMIs or loans yet"
          body="Add a home, car, personal or no-cost EMI. Mark each month paid in one tap and watch the punchcard fill up."
          action={addLoan}
        />
      </div>
    )
  }

  return (
    <div className="g-view g-emis">
      <ViewHeader
        title="EMIs & loans"
        tone="coral"
        sub="Every EMI you pay, what’s cleared and what’s left."
        actions={addLoan}
      />

      {active.length > 0 && (
        <div className="g-bento">
          <Tile span={5} index={0} tone="coral" icon={LuLandmark} kicker="Still to pay, all loans" title="EMI balance" className="g-hero">
            <Odometer value={position.emiLeft} className="g-hero__value" />
            <ProgressBar value={total > 0 ? paid / total : 0} tone="mint" label="Share of all EMIs paid" size="lg" />
            <dl className="g-stats g-stats--wide">
              <div>
                <dt>Every month</dt>
                <dd>
                  <Money value={monthly} />
                </dd>
              </div>
              <div>
                <dt>Paid so far</dt>
                <dd>
                  <Money value={paid} tone="pos" />
                </dd>
              </div>
              <div>
                <dt>Debt-free by</dt>
                <dd>{freeBy ? monthLabel(freeBy, 'short') : '—'}</dd>
              </div>
              <div>
                <dt>That’s</dt>
                <dd>{plural(monthsToFree, 'month')} away</dd>
              </div>
            </dl>
          </Tile>

          <Tile span={7} index={1} icon={LuCalendarRange} kicker="Next 12 months" title="When the EMIs get lighter">
            <ol className="g-outlook" aria-label="EMI outgo for the next 12 months">
              {outlook.map((row, i) => (
                <li
                  key={row.month}
                  className={cx('g-outlook__month', row.ending.length > 0 && 'has-ending')}
                  style={{ '--i': i, '--h': row.amount / outlookMax }}
                >
                  <span className="g-outlook__bar" aria-hidden="true" />
                  <span className="g-outlook__label">{shortMonth(row.month)}</span>
                  <span className="sr-only">
                    <Money value={row.amount} />
                    {row.ending.length > 0 && `, last EMI for ${row.ending.join(', ')}`}
                  </span>
                  {row.ending.length > 0 && (
                    <span className="g-outlook__flag" aria-hidden="true" title={`Last EMI: ${row.ending.join(', ')}`}>
                      ✓
                    </span>
                  )}
                </li>
              ))}
            </ol>
            <p className="g-muted g-outlook__note">
              EMIs still due each month. A tick marks a loan’s last EMI; after that, the money is yours again.
            </p>
          </Tile>
        </div>
      )}

      {active.length > 0 ? (
        <div className="g-tickets">
          {active.map((status, i) => (
            <Ticket key={status.loan.id} status={status} index={i} />
          ))}
        </div>
      ) : (
        <EmptyState icon={LuBadgeCheck} title="No EMIs running" body="Every loan you added is paid off. Nicely done." />
      )}

      {closed.length > 0 && (
        <details className="g-details g-closed">
          <summary>
            Paid off <span className="g-muted">· {closed.length}</span>
          </summary>
          <ul className="g-closed__list">
            {closed.map((status) => (
              <li key={status.loan.id} className="g-closed__row" style={toneVar(status.loan.color || 'coral')}>
                <span className="g-closed__name">
                  {status.loan.name}
                  <small>
                    {status.loan.lender || 'Loan'} · ended {monthLabel(status.endMonth, 'short')}
                  </small>
                </span>
                <Money value={status.paidAmount} />
                <span className="g-stamp" aria-hidden="true">
                  Paid off
                </span>
                <button
                  type="button"
                  className="g-icon-btn g-press"
                  onClick={() => openSheet('loan', { loan: status.loan })}
                  aria-label={`Edit ${status.loan.name}`}
                >
                  <LuPencil aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
