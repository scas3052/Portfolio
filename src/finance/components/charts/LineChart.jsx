import { motion } from 'motion/react'
import { useId, useMemo, useState } from 'react'
import { addMonths, daysInMonth, monthOf, shortMonth } from '../../lib/dates'
import { formatINR, MASK } from '../../lib/format'
import { cumulative, dailySpent } from '../../lib/selectors'
import { useElementSize } from '../../hooks/useElementSize'
import { useUi } from '../../store/contexts'

const HEIGHT = 210
const PAD = { top: 18, right: 14, bottom: 26, left: 14 }

function pathFor(values, x, y) {
  return values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
}

/** Running total of day-to-day spending (EMIs excluded) against last month and the budget. */
export default function LineChart({ transactions, month, today, budget = 0 }) {
  const [ref, { width }] = useElementSize()
  const { privacy } = useUi()
  const [hover, setHover] = useState(null)
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const isCurrent = month === monthOf(today)

  const data = useMemo(() => {
    const days = daysInMonth(month)
    const prevMonth = addMonths(month, -1)
    const all = cumulative(dailySpent(transactions, month, { includeEmi: false }))
    const upto = isCurrent ? Number(today.slice(8, 10)) : days
    const current = all.slice(0, upto)
    const previous = cumulative(dailySpent(transactions, prevMonth, { includeEmi: false }))
    const max = Math.max(1, current.at(-1) || 0, previous.at(-1) || 0, budget || 0) * 1.12
    return { days, prevMonth, current, previous, max }
  }, [transactions, month, today, budget, isCurrent])

  const innerW = Math.max(1, width - PAD.left - PAD.right)
  const innerH = HEIGHT - PAD.top - PAD.bottom
  const x = (i) => PAD.left + (data.days > 1 ? (i / (data.days - 1)) * innerW : 0)
  const y = (v) => PAD.top + innerH - (v / data.max) * innerH
  const line = pathFor(data.current, x, y)
  const prevLine = pathFor(data.previous.slice(0, data.days), x, y)
  const lastX = x(Math.max(0, data.current.length - 1))
  const area = data.current.length ? `${line} L${lastX.toFixed(1)} ${y(0)} L${x(0)} ${y(0)} Z` : ''
  const budgetY = budget > 0 ? y(budget) : null
  const spentSoFar = data.current.at(-1) || 0

  const pick = (clientX, rect) => {
    const ratio = (clientX - rect.left - PAD.left) / innerW
    const index = Math.round(Math.min(1, Math.max(0, ratio)) * (data.days - 1))
    setHover(Math.min(index, Math.max(0, data.current.length - 1)))
  }

  const money = (v) => (privacy ? MASK : formatINR(v, { compact: true }))
  const hovered = hover !== null && data.current[hover] !== undefined ? hover : null
  const summary = `${shortMonth(month)}: ${money(spentSoFar)} spent day to day${
    budget > 0 ? ` against a ${money(budget)} budget` : ''
  }. Last month: ${money(data.previous.at(-1) || 0)}.`

  return (
    <figure className="g-line" ref={ref}>
      {width > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          role="img"
          aria-label={summary}
          onPointerMove={(event) => pick(event.clientX, event.currentTarget.getBoundingClientRect())}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <pattern id={`hatch${uid}`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="7" height="7" className="g-line__hatch-bg" />
              <line x1="0" y1="0" x2="0" y2="7" className="g-line__hatch" />
            </pattern>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1={PAD.left} x2={width - PAD.right} y1={PAD.top + innerH * f} y2={PAD.top + innerH * f} className="g-line__grid" />
          ))}
          <line x1={PAD.left} x2={width - PAD.right} y1={y(0)} y2={y(0)} className="g-line__axis" />
          {budgetY !== null && (
            <g className="g-line__budget">
              <line x1={PAD.left} x2={width - PAD.right} y1={budgetY} y2={budgetY} />
              <text x={width - PAD.right} y={budgetY - 6} textAnchor="end">
                budget
              </text>
            </g>
          )}
          <motion.path
            key={`prev-${month}`}
            d={prevLine}
            className="g-line__prev"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
          />
          <motion.path
            key={`area-${month}`}
            d={area}
            fill={`url(#hatch${uid})`}
            className="g-line__area"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.5 }}
          />
          <motion.path
            key={`line-${month}`}
            d={line}
            className="g-line__path"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.1, ease: [0.65, 0, 0.35, 1] }}
          />
          {data.current.length > 0 && (
            <motion.circle
              key={`dot-${month}`}
              cx={lastX}
              cy={y(spentSoFar)}
              r="5.5"
              className="g-line__dot"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 1, type: 'spring', stiffness: 500, damping: 14 }}
            />
          )}
          {[1, Math.ceil(data.days / 2), data.days].map((d) => (
            <text key={d} x={x(d - 1)} y={HEIGHT - 6} className="g-line__tick" textAnchor={d === 1 ? 'start' : d === data.days ? 'end' : 'middle'}>
              {d} {shortMonth(month)}
            </text>
          ))}
          {hovered !== null && (
            <g className="g-line__scrub" pointerEvents="none">
              <line x1={x(hovered)} x2={x(hovered)} y1={PAD.top} y2={y(0)} />
              <circle cx={x(hovered)} cy={y(data.current[hovered])} r="5" />
            </g>
          )}
        </svg>
      )}
      <figcaption className="g-line__legend">
        {hovered !== null ? (
          <span className="g-line__readout">
            <b>
              {hovered + 1} {shortMonth(month)}
            </b>{' '}
            · {money(data.current[hovered])} so far
            {data.previous[hovered] !== undefined && (
              <>
                {' '}
                · {shortMonth(data.prevMonth)}: {money(data.previous[hovered])}
              </>
            )}
          </span>
        ) : (
          <>
            <span className="g-key g-key--ink">{shortMonth(month)}</span>
            <span className="g-key g-key--dash">{shortMonth(data.prevMonth)}</span>
            {budget > 0 && <span className="g-key g-key--budget">Budget</span>}
          </>
        )}
      </figcaption>
    </figure>
  )
}
