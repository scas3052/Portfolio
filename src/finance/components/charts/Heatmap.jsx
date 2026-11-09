import { useMemo } from 'react'
import { formatDay, shortMonth } from '../../lib/dates'
import { formatINR } from '../../lib/format'
import { navigate } from '../../lib/router'
import { spendingHeatmap } from '../../lib/selectors'
import { useUi } from '../../store/contexts'

const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', '']

/** Day-by-day spending grid. Click a day to see its entries. */
export default function Heatmap({ transactions, today, weeks = 18 }) {
  const { privacy } = useUi()
  const map = useMemo(() => spendingHeatmap(transactions, today, weeks), [transactions, today, weeks])

  const labels = useMemo(() => {
    const out = []
    for (const cell of map.cells) {
      if (cell.day === 0 && Number(cell.date.slice(8, 10)) <= 7) out.push({ week: cell.week, text: shortMonth(cell.date.slice(0, 7)) })
    }
    return out
  }, [map])

  const activeDays = map.cells.filter((cell) => cell.value > 0).length

  return (
    <figure className="g-heat" style={{ '--weeks': map.weeks }}>
      <div className="g-heat__scroll">
        <div className="g-heat__months" aria-hidden="true">
          {labels.map((label) => (
            <span key={label.week} style={{ gridColumn: label.week + 1 }}>
              {label.text}
            </span>
          ))}
        </div>
        <div className="g-heat__body">
          <div className="g-heat__days" aria-hidden="true">
            {DAY_LABELS.map((label, i) => (
              <span key={i}>{label}</span>
            ))}
          </div>
          <div
            className="g-heat__grid"
            role="img"
            aria-label={`Spending on ${activeDays} of the last ${map.weeks * 7} days`}
            onClick={(event) => {
              const date = event.target.closest('[data-date]')?.dataset.date
              if (date) navigate('activity', { day: date })
            }}
          >
            {map.cells.map((cell) => (
              <span
                key={cell.date}
                className="g-heat__cell"
                data-level={cell.level}
                data-date={cell.level >= 0 ? cell.date : undefined}
                style={{ '--w': cell.week, '--d': cell.day }}
                title={
                  cell.level < 0
                    ? undefined
                    : `${formatDay(cell.date, { year: true })}: ${
                        cell.value > 0 ? (privacy ? 'spent' : `${formatINR(cell.value)} spent`) : 'no spending'
                      }`
                }
              />
            ))}
          </div>
        </div>
      </div>
      <figcaption className="g-heat__legend">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <span key={level} className="g-heat__cell g-heat__cell--key" data-level={level} aria-hidden="true" />
        ))}
        <span>More</span>
      </figcaption>
    </figure>
  )
}
