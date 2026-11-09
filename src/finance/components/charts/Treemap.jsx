import { motion } from 'motion/react'
import { useMemo } from 'react'
import { LuLayers } from 'react-icons/lu'
import { cx, toneVar } from '../../lib/cx'
import { formatINR, formatPercent, MASK, round2 } from '../../lib/format'
import { squarify } from '../../lib/treemap'
import { useElementSize } from '../../hooks/useElementSize'
import { useUi } from '../../store/contexts'

const MAX_TILES = 7

/** Spending by category as tiles that get dealt onto the table like cards. */
export default function Treemap({ breakdown, onPick, height = 260, dealKey }) {
  const [ref, { width }] = useElementSize()
  const { privacy } = useUi()

  const items = useMemo(() => {
    const top = breakdown.slice(0, MAX_TILES).map((row) => ({ ...row, value: row.amount }))
    const rest = breakdown.slice(MAX_TILES)
    if (rest.length) {
      const amount = round2(rest.reduce((sum, row) => sum + row.amount, 0))
      top.push({
        id: '__others',
        amount,
        value: amount,
        meta: { label: `${rest.length} more`, short: 'Others', icon: LuLayers, tone: 'gray' },
      })
    }
    return top
  }, [breakdown])

  const total = items.reduce((sum, item) => sum + item.amount, 0)
  const rects = useMemo(() => (width > 0 ? squarify(items, width, height) : []), [items, width, height])

  return (
    <div className="g-tree" ref={ref} style={{ height }}>
      {rects.map((rect, i) => {
        const Icon = rect.meta.icon
        const roomy = rect.w > 92 && rect.h > 64
        const tiny = rect.w < 56 || rect.h < 40
        const others = rect.id === '__others'
        return (
          <motion.button
            key={`${dealKey}-${rect.id}`}
            type="button"
            className={cx('g-tree__tile', roomy && 'is-roomy', tiny && 'is-tiny')}
            style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, ...toneVar(rect.meta.tone) }}
            initial={{
              x: width / 2 - rect.x - rect.w / 2,
              y: height + 60 - rect.y,
              rotate: (i % 2 ? 1 : -1) * (10 + i * 3),
              opacity: 0,
            }}
            animate={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 170, damping: 19, delay: 0.08 + i * 0.07 }}
            onClick={() => (others ? onPick?.(null) : onPick?.(rect.id))}
            aria-label={`${rect.meta.label}: ${privacy ? 'amount hidden' : formatINR(rect.amount)}, ${formatPercent(rect.amount / total)} of spending`}
          >
            {!tiny && (
              <>
                <span className="g-tree__name">
                  <Icon aria-hidden="true" />
                  {rect.meta.short}
                </span>
                {roomy && (
                  <span className="g-tree__amt">{privacy ? MASK : formatINR(rect.amount, { compact: true })}</span>
                )}
                <span className="g-tree__pct">{formatPercent(rect.amount / total)}</span>
              </>
            )}
          </motion.button>
        )
      })}
    </div>
  )
}
