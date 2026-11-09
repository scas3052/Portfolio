import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { LuChevronLeft, LuChevronRight } from 'react-icons/lu'
import { addMonths, monthLabel } from '../../lib/dates'
import { useUi } from '../../store/contexts'

// The label flips over like a desk calendar page, forwards or backwards.
const page = {
  enter: (dir) => ({ rotateX: dir >= 0 ? -100 : 100, opacity: 0 }),
  center: { rotateX: 0, opacity: 1, transition: { type: 'spring', stiffness: 380, damping: 26 } },
  exit: (dir) => ({ rotateX: dir >= 0 ? 100 : -100, opacity: 0, transition: { duration: 0.18, ease: 'easeIn' } }),
}

export default function MonthSwitcher() {
  const { month, firstMonth, currentMonth, setMonth } = useUi()
  const [prev, setPrev] = useState(month)
  const [dir, setDir] = useState(0)
  if (month !== prev) {
    setPrev(month)
    setDir(month > prev ? 1 : -1)
  }

  const atStart = month <= firstMonth
  const atEnd = month >= currentMonth

  return (
    <div className="g-month" role="group" aria-label="Month">
      <button
        type="button"
        className="g-month__step g-press"
        onClick={() => setMonth(addMonths(month, -1))}
        disabled={atStart}
        aria-label="Previous month"
        aria-keyshortcuts="["
      >
        <LuChevronLeft aria-hidden="true" />
      </button>
      <div className="g-month__face" aria-live="polite" aria-atomic="true">
        <AnimatePresence initial={false} custom={dir}>
          <motion.span
            key={month}
            className="g-month__label"
            custom={dir}
            variants={page}
            initial="enter"
            animate="center"
            exit="exit"
          >
            {monthLabel(month)}
          </motion.span>
        </AnimatePresence>
      </div>
      <button
        type="button"
        className="g-month__step g-press"
        onClick={() => setMonth(addMonths(month, 1))}
        disabled={atEnd}
        aria-label="Next month"
        aria-keyshortcuts="]"
      >
        <LuChevronRight aria-hidden="true" />
      </button>
      {!atEnd && (
        <button type="button" className="g-month__now g-press" onClick={() => setMonth(currentMonth)}>
          This month
        </button>
      )}
    </div>
  )
}
