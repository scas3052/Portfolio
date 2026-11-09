import { useCallback, useSyncExternalStore } from 'react'
import { useReducedMotion } from 'motion/react'

export const FINE_POINTER = '(hover: hover) and (pointer: fine)'

export function useMediaQuery(query) {
  const subscribe = useCallback(
    (onChange) => {
      const media = window.matchMedia(query)
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    },
    [query],
  )

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** True when pointer-driven effects (tilt, magnetic, cursor glow) should run. */
export function useInteractiveMotion() {
  const finePointer = useMediaQuery(FINE_POINTER)
  const reduceMotion = useReducedMotion()
  return finePointer && !reduceMotion
}
