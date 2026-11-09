import { AnimatePresence, motion } from 'motion/react'
import { LuX } from 'react-icons/lu'
import { cx, toneVar } from '../../lib/cx'
import { useUi } from '../../store/contexts'

function Toast({ toast, onDismiss }) {
  const Icon = toast.icon
  const ink = toast.tone === 'ink'
  return (
    <motion.li
      layout
      className={cx('g-toast', ink ? 'g-toast--ink' : 'g-toast--tone')}
      style={{ ...(ink ? {} : toneVar(toast.tone)), '--dur': `${toast.duration}ms`, originX: 0, originY: 0 }}
      initial={{ opacity: 0, scale: 1.3, rotate: -7, y: -14 }}
      animate={{ opacity: 1, scale: 1, rotate: 0, y: 0, transition: { type: 'spring', stiffness: 640, damping: 21 } }}
      exit={{ opacity: 0, rotate: 9, x: 70, y: -28, scale: 0.9, transition: { duration: 0.26, ease: [0.5, 0, 0.75, 0] } }}
    >
      {Icon && <Icon className="g-toast__icon" aria-hidden="true" />}
      <p className="g-toast__msg">{toast.message}</p>
      {toast.action && (
        <button
          type="button"
          className="g-toast__action g-press"
          onClick={() => {
            toast.action.run()
            onDismiss(toast.id)
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button type="button" className="g-toast__close" onClick={() => onDismiss(toast.id)} aria-label="Dismiss">
        <LuX aria-hidden="true" />
      </button>
      <span className="g-toast__timer" onAnimationEnd={() => onDismiss(toast.id)} aria-hidden="true" />
    </motion.li>
  )
}

/** Sticky-note notifications that slap onto the page and peel away. */
export default function Toasts() {
  const { toasts, dismissToast } = useUi()
  return (
    <div className="g-toasts" aria-live="polite" aria-relevant="additions text">
      <ol>
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <Toast key={toast.id} toast={toast} onDismiss={dismissToast} />
          ))}
        </AnimatePresence>
      </ol>
    </div>
  )
}
