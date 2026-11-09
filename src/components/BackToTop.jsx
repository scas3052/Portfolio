import { useState } from 'react'
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'motion/react'
import { LuArrowUp } from 'react-icons/lu'
import './BackToTop.css'

const THRESHOLD = 640

export default function BackToTop() {
  const [visible, setVisible] = useState(() => window.scrollY > THRESHOLD)
  const { scrollY, scrollYProgress } = useScroll()

  useMotionValueEvent(scrollY, 'change', (y) => setVisible(y > THRESHOLD))

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          className="back-to-top"
          onClick={() => window.scrollTo({ top: 0 })}
          aria-label="Back to top"
          title="Back to top"
          initial={{ opacity: 0, scale: 0.6, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.6, y: 16 }}
          whileHover={{ y: -4 }}
          whileTap={{ scale: 0.92 }}
          transition={{ duration: 0.25 }}
        >
          {/* Ring that fills up with page scroll progress */}
          <svg className="back-to-top__ring" viewBox="0 0 52 52" aria-hidden="true">
            <circle className="back-to-top__track" cx="26" cy="26" r="24" />
            <motion.circle
              className="back-to-top__progress"
              cx="26"
              cy="26"
              r="24"
              style={{ pathLength: scrollYProgress }}
            />
          </svg>
          <LuArrowUp />
        </motion.button>
      )}
    </AnimatePresence>
  )
}
