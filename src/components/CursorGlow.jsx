import { useEffect, useRef } from 'react'
import { motion, useSpring } from 'motion/react'
import { useInteractiveMotion } from '../hooks/useMediaQuery'

const SPRING = { stiffness: 150, damping: 25, mass: 0.6 }

function Glow() {
  const ref = useRef(null)
  const x = useSpring(0, SPRING)
  const y = useSpring(0, SPRING)

  useEffect(() => {
    const node = ref.current
    if (!node) return undefined
    let visible = false

    const onMove = (event) => {
      if (event.pointerType === 'touch') return
      if (!visible) {
        x.jump(event.clientX)
        y.jump(event.clientY)
        node.dataset.visible = 'true'
        visible = true
        return
      }
      x.set(event.clientX)
      y.set(event.clientY)
    }

    const hide = () => {
      delete node.dataset.visible
      visible = false
    }

    const onMouseOut = (event) => {
      if (!event.relatedTarget) hide()
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('mouseout', onMouseOut)
    window.addEventListener('blur', hide)
    return () => {
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('mouseout', onMouseOut)
      window.removeEventListener('blur', hide)
    }
  }, [x, y])

  return <motion.div ref={ref} className="cursor-glow" style={{ x, y }} aria-hidden="true" />
}

/** Soft light that trails the cursor (fine pointers, motion allowed). */
export default function CursorGlow() {
  return useInteractiveMotion() ? <Glow /> : null
}
