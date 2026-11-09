import { useEffect, useEffectEvent, useRef, useState } from 'react'

const GLYPHS = '0123456789₹#%&$@'
const DURATION = 460

function scrambleFrame(target, progress) {
  let out = ''
  for (let i = 0; i < target.length; i += 1) {
    const char = target[i]
    // Characters settle left to right as progress grows.
    if (char === ' ' || char === ',' || progress > (i + 1) / (target.length + 1)) out += char
    else out += GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
  }
  return out
}

/** Briefly "decodes" `text` whenever `trigger` changes (e.g. the privacy toggle). */
export function useScramble(text, trigger) {
  const [frame, setFrame] = useState(null)
  const previous = useRef(trigger)
  const latestText = useEffectEvent(() => text)

  useEffect(() => {
    if (previous.current === trigger) return undefined
    previous.current = trigger
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    let raf = 0
    const start = performance.now()
    const tick = (now) => {
      const progress = (now - start) / DURATION
      if (progress >= 1) {
        setFrame(null)
        return
      }
      setFrame(scrambleFrame(latestText(), progress))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [trigger])

  return frame ?? text
}
