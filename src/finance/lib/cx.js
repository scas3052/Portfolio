import { TONES } from './categories'

export const cx = (...parts) => parts.filter(Boolean).join(' ')

/** Stable pastel for a person or anything else keyed by an id/name. */
export function toneFor(key) {
  let hash = 0
  for (const char of String(key)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return TONES[hash % TONES.length]
}

export const toneVar = (tone) => (tone ? { '--tone': `var(--${tone})` } : undefined)
