import { useEffect } from 'react'
import { useSpring } from 'motion/react'
import { useInteractiveMotion } from './useMediaQuery'

const SPRING = { stiffness: 150, damping: 18, mass: 0.5 }

/**
 * Pointer-driven 3D tilt. Attach `handlers` to a static parent and apply
 * `rotateX` / `rotateY` to a child so the hit area never moves under the cursor.
 * `pointerX` / `pointerY` run from -1 to 1 and can drive parallax layers.
 */
export function useTilt({ max = 6, restX = 0, restY = 0 } = {}) {
  const enabled = useInteractiveMotion()
  const rotateX = useSpring(restX, SPRING)
  const rotateY = useSpring(restY, SPRING)
  const pointerX = useSpring(0, SPRING)
  const pointerY = useSpring(0, SPRING)

  useEffect(() => {
    rotateX.set(restX)
    rotateY.set(restY)
  }, [restX, restY, rotateX, rotateY])

  const onPointerMove = (event) => {
    if (!enabled || event.pointerType === 'touch') return
    const target = event.currentTarget
    const rect = target.getBoundingClientRect()
    const nx = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1))
    const ny = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1))
    target.style.setProperty('--gx', `${(nx + 1) * 50}%`)
    target.style.setProperty('--gy', `${(ny + 1) * 50}%`)
    rotateY.set(nx * max)
    rotateX.set(-ny * max)
    pointerX.set(nx)
    pointerY.set(ny)
  }

  const onPointerLeave = () => {
    rotateX.set(restX)
    rotateY.set(restY)
    pointerX.set(0)
    pointerY.set(0)
  }

  return { rotateX, rotateY, pointerX, pointerY, handlers: { onPointerMove, onPointerLeave } }
}
