import { motion } from 'motion/react'
import { formatINR, MASK } from '../lib/format'
import { useScramble } from '../hooks/useScramble'
import { useUi } from '../store/contexts'

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

function toneClass(tone, value) {
  if (tone === 'auto') return value > 0 ? 'is-pos' : value < 0 ? 'is-neg' : ''
  return tone ? `is-${tone}` : ''
}

/** A rupee amount that respects privacy mode and "decodes" when it is toggled. */
export function Money({ value, sign = 'auto', compact = false, paise, tone, className = '' }) {
  const { privacy } = useUi()
  const text = privacy ? MASK : formatINR(value, { sign, compact, paise })
  const shown = useScramble(text, privacy)
  return (
    <span className={['g-money', toneClass(tone, value), className].filter(Boolean).join(' ')}>
      <span aria-hidden="true">{shown}</span>
      <span className="sr-only">{privacy ? 'amount hidden' : text}</span>
    </span>
  )
}

function Digit({ digit }) {
  return (
    <span className="g-odo__cell">
      <motion.span
        className="g-odo__strip"
        initial={{ y: '0%' }}
        animate={{ y: `${-digit * 10}%` }}
        transition={{ type: 'spring', stiffness: 120, damping: 19, mass: 0.9 }}
      >
        {DIGITS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </motion.span>
    </span>
  )
}

/** Mechanical rolling digits for headline numbers. */
export function Odometer({ value, sign = 'auto', compact = false, tone, className = '' }) {
  const { privacy } = useUi()
  const text = formatINR(value, { sign, compact, paise: false })
  const chars = [...text]
  return (
    <span className={['g-odo', toneClass(tone, value), className].filter(Boolean).join(' ')}>
      <span className="sr-only">{privacy ? 'amount hidden' : text}</span>
      {privacy ? (
        <motion.span
          key="mask"
          className="g-odo__mask"
          aria-hidden="true"
          initial={{ opacity: 0, letterSpacing: '0.4em' }}
          animate={{ opacity: 1, letterSpacing: '0.02em' }}
          transition={{ duration: 0.35 }}
        >
          {MASK}
        </motion.span>
      ) : (
        <span className="g-odo__row" aria-hidden="true">
          {chars.map((char, i) => {
            const fromRight = chars.length - i
            return /\d/.test(char) ? (
              <Digit key={`d${fromRight}`} digit={Number(char)} />
            ) : (
              <span key={`c${fromRight}${char}`} className="g-odo__char">
                {char}
              </span>
            )
          })}
        </span>
      )}
    </span>
  )
}
