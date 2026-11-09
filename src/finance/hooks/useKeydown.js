import { useEffect, useEffectEvent } from 'react'

export function isTypingTarget(target) {
  if (!target || !(target instanceof Element)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/** Window keydown listener that always sees the latest props/state. */
export function useKeydown(handler, enabled = true) {
  const onKeyDown = useEffectEvent((event) => handler(event))

  useEffect(() => {
    if (!enabled) return undefined
    const listener = (event) => onKeyDown(event)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [enabled])
}
