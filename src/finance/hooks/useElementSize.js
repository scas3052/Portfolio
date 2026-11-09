import { useEffect, useState } from 'react'

/** Returns [callbackRef, { width, height }] tracked with a ResizeObserver. */
export function useElementSize() {
  const [node, setNode] = useState(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    if (!node) return undefined
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width)
      const height = Math.round(entry.contentRect.height)
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }))
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [node])

  return [setNode, size]
}
