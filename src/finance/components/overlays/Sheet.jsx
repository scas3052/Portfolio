import { motion, useDragControls, useIsPresent } from 'motion/react'
import { useEffect, useId, useRef, useState } from 'react'
import { LuX } from 'react-icons/lu'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { cx, toneVar } from '../../lib/cx'
import { lockScroll, restoreFocus, trapTab } from '../../lib/dom'

const lift = {
  initial: { opacity: 0, y: 70, rotate: -5, scale: 0.92 },
  animate: { opacity: 1, y: 0, rotate: 0, scale: 1, transition: { type: 'spring', stiffness: 380, damping: 26 } },
  exit: { opacity: 0, y: 40, rotate: 4, scale: 0.95, transition: { duration: 0.18, ease: 'easeIn' } },
}

const rise = {
  initial: { y: '100%' },
  animate: { y: 0, transition: { type: 'spring', stiffness: 360, damping: 34 } },
  exit: { y: '100%', transition: { duration: 0.24, ease: [0.4, 0, 1, 1] } },
}

/** Modal panel: a draggable bottom sheet on phones, a lifted card on bigger screens. */
export default function Sheet({ title, kicker, tone = 'lime', onClose, wide = false, children }) {
  const compact = useMediaQuery('(max-width: 719px)')
  const present = useIsPresent()
  const panel = useRef(null)
  const [opener] = useState(() => document.activeElement)
  const drag = useDragControls()
  const titleId = useId()

  useEffect(() => {
    const node = panel.current
    const unlock = lockScroll()
    if (node && !node.contains(document.activeElement)) node.focus({ preventScroll: true })
    return unlock
  }, [])

  useEffect(() => {
    if (!present) restoreFocus(opener, panel.current)
  }, [present, opener])

  const motionProps = compact ? rise : lift

  return (
    <div className="g-sheet-layer" inert={!present}>
      <motion.div
        className="g-scrim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx('g-sheet', compact ? 'g-sheet--bottom' : 'g-sheet--card', wide && 'g-sheet--wide')}
        style={toneVar(tone)}
        {...motionProps}
        drag={compact ? 'y' : false}
        dragControls={drag}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.04, bottom: 0.85 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 120 || info.velocity.y > 650) onClose()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            onClose()
          } else {
            trapTab(event, panel.current)
          }
        }}
      >
        {compact && (
          <div className="g-sheet__grab" onPointerDown={(event) => drag.start(event)} aria-hidden="true">
            <span />
          </div>
        )}
        <header className="g-sheet__head">
          <div>
            {kicker && <p className="g-kicker">{kicker}</p>}
            <h2 id={titleId} className="g-sheet__title">
              {title}
            </h2>
          </div>
          <button type="button" className="g-icon-btn g-press" onClick={onClose} aria-label="Close">
            <LuX aria-hidden="true" />
          </button>
        </header>
        <div className="g-sheet__body">{children}</div>
      </motion.div>
    </div>
  )
}
