import { AnimatePresence, motion, useMotionValue, useTransform } from 'motion/react'
import { useState } from 'react'
import { LuChevronLeft, LuChevronRight } from 'react-icons/lu'
import { toneVar } from '../lib/cx'
import { useActions } from '../hooks/useActions'

const TILT = [0, 2.4, -2]
const FLING_DISTANCE = 90
const FLING_SPEED = 550

const variants = {
  rest: (depth) => ({
    x: 0,
    y: depth * 11,
    scale: 1 - depth * 0.045,
    rotate: TILT[depth] ?? 0,
    opacity: 1,
    transition: { type: 'spring', stiffness: 320, damping: 26 },
  }),
  flyOut: (custom) => ({
    x: (custom?.fling || 1) * 460,
    rotate: (custom?.fling || 1) * 22,
    opacity: 0,
    transition: { duration: 0.38, ease: [0.4, 0, 0.7, 0.2] },
  }),
  sinkOut: { opacity: 0, scale: 0.86, y: 40, transition: { duration: 0.2 } },
}

function DeckCard({ card, depth, enterFrom, onFling, onAction }) {
  const x = useMotionValue(0)
  const spin = useTransform(x, [-200, 200], [-14, 14])
  const top = depth === 0
  const Icon = card.icon

  return (
    <motion.article
      className="g-deck__card"
      style={{ x, rotateZ: spin, zIndex: 10 - depth, ...toneVar(card.tone) }}
      variants={variants}
      custom={depth}
      initial={enterFrom}
      animate="rest"
      exit={top ? 'flyOut' : 'sinkOut'}
      drag={top ? 'x' : false}
      dragSnapToOrigin
      dragElastic={0.7}
      onDragEnd={(_, info) => {
        const distance = info.offset.x
        const speed = info.velocity.x
        if (Math.abs(distance) > FLING_DISTANCE || Math.abs(speed) > FLING_SPEED) {
          onFling(Math.sign(distance || speed) || 1)
        }
      }}
      inert={!top}
      aria-hidden={!top}
    >
      <p className="g-deck__kicker">
        {Icon && <Icon aria-hidden="true" />}
        {card.kicker}
      </p>
      <h3 className="g-deck__title">{card.title}</h3>
      <p className="g-deck__body">{card.body}</p>
      {card.action && (
        <button type="button" className="g-btn g-btn--sm g-btn--ink g-press" onClick={() => onAction(card.action)}>
          {card.action.label}
        </button>
      )}
    </motion.article>
  )
}

/** A swipeable stack of heads-up cards. Fling the top card away to see the next. */
export default function InsightDeck({ cards }) {
  const { runInsight } = useActions()
  const [position, setPosition] = useState(0)
  const [motionState, setMotionState] = useState({ dir: 1, fling: 1 })
  const count = cards.length
  if (count === 0) return null

  const visible = Math.min(3, count)
  const current = ((position % count) + count) % count

  const step = (dir, fling = dir) => {
    setMotionState({ dir, fling })
    setPosition((p) => p + dir)
  }

  const stack = Array.from({ length: visible }, (_, depth) => {
    const absolute = position + depth
    return { absolute, depth, card: cards[((absolute % count) + count) % count] }
  })

  return (
    <div className="g-deck">
      <div className="g-deck__stack">
        <AnimatePresence initial={false} custom={motionState}>
          {stack
            .slice()
            .reverse()
            .map(({ absolute, depth, card }) => (
              <DeckCard
                key={absolute}
                card={card}
                depth={depth}
                enterFrom={
                  depth === 0 && motionState.dir < 0
                    ? { x: -380, rotate: -18, opacity: 0, y: 0, scale: 1 }
                    : { opacity: 0, scale: 0.84, y: 46, rotate: 0, x: 0 }
                }
                onFling={(fling) => step(1, fling)}
                onAction={runInsight}
              />
            ))}
        </AnimatePresence>
      </div>
      {count > 1 && (
        <div className="g-deck__nav">
          <button type="button" className="g-icon-btn g-press" onClick={() => step(-1)} aria-label="Previous card">
            <LuChevronLeft aria-hidden="true" />
          </button>
          <span className="g-deck__count" aria-live="polite">
            {current + 1} / {count}
          </span>
          <button type="button" className="g-icon-btn g-press" onClick={() => step(1)} aria-label="Next card">
            <LuChevronRight aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  )
}
