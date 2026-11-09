import { motion } from 'motion/react'
import { cx } from '../../lib/cx'
import { monthLabel, shortMonth } from '../../lib/dates'
import { formatINR, MASK } from '../../lib/format'
import { useUi } from '../../store/contexts'

const spring = { type: 'spring', stiffness: 210, damping: 17 }

/** Earned vs spent for the last few months. Tap a month to jump to it. */
export default function BarsChart({ series, activeMonth, onPick }) {
  const { privacy } = useUi()
  const max = Math.max(1, ...series.map((row) => Math.max(row.income, row.spent)))
  const money = (v) => (privacy ? MASK : formatINR(v, { compact: true }))

  return (
    <div className="g-bars">
      <div className="g-bars__plot" role="list">
        {series.map((row, i) => (
          <button
            key={row.month}
            type="button"
            role="listitem"
            className={cx('g-bars__col', row.month === activeMonth && 'is-active')}
            onClick={() => onPick?.(row.month)}
            aria-label={`${monthLabel(row.month)}: earned ${money(row.income)}, spent ${money(row.spent)}`}
            aria-current={row.month === activeMonth ? 'true' : undefined}
          >
            <span className="g-bars__pair" aria-hidden="true">
              <motion.span
                className="g-bars__bar g-bars__bar--in"
                style={{ height: `${(row.income / max) * 100}%`, originY: 1 }}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ ...spring, delay: i * 0.06 }}
              />
              <motion.span
                className="g-bars__bar g-bars__bar--out"
                style={{ height: `${(row.spent / max) * 100}%`, originY: 1 }}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ ...spring, delay: i * 0.06 + 0.05 }}
              />
            </span>
            <span className="g-bars__label" aria-hidden="true">
              {shortMonth(row.month)}
            </span>
          </button>
        ))}
      </div>
      <div className="g-bars__legend" aria-hidden="true">
        <span className="g-key g-key--in">Earned</span>
        <span className="g-key g-key--out">Spent + EMIs</span>
      </div>
    </div>
  )
}
