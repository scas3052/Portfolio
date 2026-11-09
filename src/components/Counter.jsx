import { useEffect, useRef } from 'react'
import { animate, motion, useInView, useMotionValue, useReducedMotion, useTransform } from 'motion/react'

/** Counts up from zero to `value` the first time it scrolls into view. */
export default function Counter({ value, decimals = 0, suffix = '', duration = 1.8 }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })
  const reduceMotion = useReducedMotion()
  const count = useMotionValue(0)
  const display = useTransform(count, (latest) => `${latest.toFixed(decimals)}${suffix}`)

  useEffect(() => {
    if (!inView) return undefined
    if (reduceMotion) {
      count.set(value)
      return undefined
    }
    const controls = animate(count, value, { duration, ease: [0.22, 1, 0.36, 1] })
    return () => controls.stop()
  }, [inView, reduceMotion, count, value, duration])

  return (
    <span ref={ref}>
      <span className="sr-only">{`${value.toFixed(decimals)}${suffix}`}</span>
      <motion.span aria-hidden="true">{display}</motion.span>
    </span>
  )
}
