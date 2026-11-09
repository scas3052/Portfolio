import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect } from 'react'
import { cx, toneVar } from '../../lib/cx'
import { useUi } from '../../store/contexts'

const STAMPS = {
  emi: { word: 'EMI paid', tone: 'coral' },
  paidoff: { word: 'Paid off!', tone: 'lime' },
  settled: { word: 'Settled', tone: 'mint' },
  goal: { word: 'Goal reached', tone: 'sky' },
}

/** A rubber stamp slams down and coins burst out. Used for small wins. */
export default function Celebration() {
  const { celebration, endCelebration } = useUi()
  const reduce = useReducedMotion()

  useEffect(() => {
    if (!celebration) return undefined
    const timer = setTimeout(endCelebration, 1900)
    return () => clearTimeout(timer)
  }, [celebration, endCelebration])

  const stamp = celebration ? STAMPS[celebration.kind] || { word: 'Done', tone: 'lime' } : null

  return (
    <div className="g-party" aria-live="polite">
      <AnimatePresence>
        {celebration && (
          <motion.div
            key={celebration.id}
            className="g-party__stage"
            exit={{ opacity: 0, transition: { duration: 0.3 } }}
          >
            {!reduce &&
              celebration.particles.map((p) => (
                <motion.span
                  key={p.id}
                  className={cx('g-particle', p.coin ? 'g-particle--coin' : 'g-particle--paper')}
                  style={p.coin ? undefined : toneVar(p.tone)}
                  initial={{ x: 0, y: 0, rotate: 0, scale: 0.3, opacity: 1 }}
                  animate={{
                    x: [0, p.x, p.x * 1.18],
                    y: [0, p.y, p.y + 320],
                    rotate: [0, p.rotate * 0.5, p.rotate],
                    scale: [0.3, 1, 0.85],
                    opacity: [1, 1, 0],
                  }}
                  transition={{ duration: 1.55, delay: p.delay, times: [0, 0.38, 1], ease: ['easeOut', 'easeIn'] }}
                />
              ))}
            <motion.div
              className="g-stamp"
              style={toneVar(stamp.tone)}
              initial={{ scale: 2.6, rotate: -24, opacity: 0 }}
              animate={{ scale: 1, rotate: -8, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 560, damping: 17 }}
            >
              <span className="g-stamp__word">{stamp.word}</span>
              {celebration.detail && <span className="g-stamp__detail">{celebration.detail}</span>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
