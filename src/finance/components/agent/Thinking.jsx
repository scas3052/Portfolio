import { AnimatePresence, motion } from 'motion/react'

const RODS = [0, 1, 2]

/** Abacus beads sliding along their rods while Munshi works, with the step it is on. */
export default function Thinking({ steps = [] }) {
  const current = steps.length ? steps[steps.length - 1] : null
  const label = current ? current.label : 'Thinking it over'
  return (
    <div className="g-mk-thinking" role="status">
      <span className="g-mk-abacus" aria-hidden="true">
        {RODS.map((rod) => (
          <span key={rod} className="g-mk-abacus__rod" style={{ '--rod': rod }}>
            <i />
            <i />
          </span>
        ))}
      </span>
      <span className="g-mk-thinking__label">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={label}
            initial={{ opacity: 0, y: 10, filter: 'blur(3px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -10, filter: 'blur(3px)' }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            {label}
          </motion.span>
        </AnimatePresence>
        <span className="g-mk-thinking__dots" aria-hidden="true">
          …
        </span>
      </span>
    </div>
  )
}
