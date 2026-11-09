import { animate, AnimatePresence, motion, useMotionValue, useTransform } from 'motion/react'
import { useMemo, useRef } from 'react'
import { LuTrash2 } from 'react-icons/lu'
import { categoryMeta, TYPE_META } from '../lib/categories'
import { relativeDay } from '../lib/dates'
import { describeTxn, groupByDay, signedAmount } from '../lib/selectors'
import { useActions } from '../hooks/useActions'
import { useFinance } from '../store/contexts'
import { IconBadge } from './bits'
import { Money } from './Money'

const DELETE_AT = -84

function visualFor(txn) {
  if (txn.type === 'expense' || txn.type === 'income') return categoryMeta(txn.category)
  return TYPE_META[txn.type] || TYPE_META.expense
}

/** One ledger line. Tap to edit, swipe left (or press Delete) to remove with undo. */
export function TxnRow({ txn, index = 0, showDate = false }) {
  const { derived, today } = useFinance()
  const { editEntry, deleteEntry } = useActions()
  const x = useMotionValue(0)
  const binOpacity = useTransform(x, [-12, DELETE_AT], [0, 1])
  const binScale = useTransform(x, [-12, DELETE_AT, DELETE_AT - 40], [0.4, 1, 1.25])
  const dragged = useRef(false)

  const { title, meta } = describeTxn(txn, derived.lookups)
  const visual = visualFor(txn)
  const transfer = txn.type === 'transfer'

  const remove = () => {
    animate(x, -520, { duration: 0.2, ease: 'easeIn' }).then(() => deleteEntry(txn))
  }

  return (
    <motion.li
      className="g-txn"
      style={{ '--i': Math.min(index, 14) }}
      exit={{ opacity: 0, height: 0, transition: { duration: 0.24, ease: [0.4, 0, 0.2, 1] } }}
    >
      <motion.span className="g-txn__bin" style={{ opacity: binOpacity, scale: binScale }} aria-hidden="true">
        <LuTrash2 />
      </motion.span>
      <motion.button
        type="button"
        className="g-txn__body"
        style={{ x }}
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.55, right: 0.04 }}
        onPointerDown={() => {
          dragged.current = false
        }}
        onDragStart={() => {
          dragged.current = true
        }}
        onDragEnd={() => {
          if (x.get() <= DELETE_AT) remove()
        }}
        onClick={() => {
          if (dragged.current) return
          editEntry(txn)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Delete') {
            event.preventDefault()
            deleteEntry(txn)
          }
        }}
        aria-label={`${title}, ${meta}. Edit entry`}
      >
        <IconBadge icon={visual.icon} tone={visual.tone} />
        <span className="g-txn__text">
          <span className="g-txn__title">{title}</span>
          <span className="g-txn__meta">
            {showDate && <span className="g-txn__date">{relativeDay(txn.date, today)} · </span>}
            {meta}
          </span>
        </span>
        <Money
          value={signedAmount(txn)}
          sign={transfer ? 'none' : 'always'}
          tone={transfer ? 'muted' : 'auto'}
          className="g-txn__amt"
        />
      </motion.button>
    </motion.li>
  )
}

/** Entries grouped under day headings with the day's net cash flow. */
export function TxnList({ txns }) {
  const { today } = useFinance()
  const groups = useMemo(() => {
    const result = []
    let start = 0
    for (const group of groupByDay(txns)) {
      result.push({ ...group, start })
      start += group.items.length
    }
    return result
  }, [txns])
  return (
    <ol className="g-days">
      <AnimatePresence initial={false}>
        {groups.map((group) => (
          <motion.li
            key={group.date}
            className="g-day"
            exit={{ opacity: 0, height: 0, transition: { duration: 0.24 } }}
          >
            <div className="g-day__head">
              <span className="g-day__label">{relativeDay(group.date, today)}</span>
              <span className="g-day__rule" aria-hidden="true" />
              {group.net !== 0 && <Money value={group.net} sign="always" tone="auto" className="g-day__net" />}
            </div>
            <ul className="g-day__list">
              <AnimatePresence initial={false}>
                {group.items.map((txn, i) => (
                  <TxnRow key={txn.id} txn={txn} index={group.start + i} />
                ))}
              </AnimatePresence>
            </ul>
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  )
}

/** Flat list (no day headings) for compact tiles. */
export function TxnMiniList({ txns }) {
  return (
    <ul className="g-day__list g-day__list--flat">
      <AnimatePresence initial={false}>
        {txns.map((txn, i) => (
          <TxnRow key={txn.id} txn={txn} index={i} showDate />
        ))}
      </AnimatePresence>
    </ul>
  )
}
