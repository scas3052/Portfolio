import { motion, useSpring } from 'motion/react'
import { useInteractiveMotion } from '../hooks/useMediaQuery'

const SPRING = { stiffness: 220, damping: 16, mass: 0.4 }
const STRENGTH = 0.28
const LIMIT = 10

const clamp = (value) => Math.max(-LIMIT, Math.min(LIMIT, value))

/** Gently pulls its child towards the cursor (fine pointers only). */
export default function Magnetic({ children, className = '' }) {
  const enabled = useInteractiveMotion()
  const x = useSpring(0, SPRING)
  const y = useSpring(0, SPRING)

  const onPointerMove = (event) => {
    if (!enabled || event.pointerType === 'touch') return
    const rect = event.currentTarget.getBoundingClientRect()
    x.set(clamp((event.clientX - (rect.left + rect.width / 2)) * STRENGTH))
    y.set(clamp((event.clientY - (rect.top + rect.height / 2)) * STRENGTH))
  }

  const reset = () => {
    x.set(0)
    y.set(0)
  }

  return (
    <span className={`magnetic ${className}`.trim()} onPointerMove={onPointerMove} onPointerLeave={reset}>
      <motion.span className="magnetic__inner" style={{ x, y }}>
        {children}
      </motion.span>
    </span>
  )
}
