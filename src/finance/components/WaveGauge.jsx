import { motion } from 'motion/react'
import { useId } from 'react'
import { cx } from '../lib/cx'

// Two wavelengths wider than the jar so the wave can slide forever without a seam.
const WAVE = 'M0 6 Q10 0 20 6 T40 6 T60 6 T80 6 T100 6 T120 6 T140 6 T160 6 V120 H0 Z'
const TOP = 16
const BOTTOM = 96

/** A glass jar that fills with gently moving liquid. `value` is 0–1. */
export default function WaveGauge({ value, tone = 'mint', label, className }) {
  const id = `jar${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const level = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
  const surface = BOTTOM - (BOTTOM - TOP) * level - 6

  return (
    <svg viewBox="0 0 80 100" className={cx('g-jar', className)} role="img" aria-label={label}>
      <defs>
        <clipPath id={id}>
          <rect x="8" y={TOP} width="64" height={BOTTOM - TOP} rx="14" />
        </clipPath>
      </defs>
      <rect className="g-jar__glass" x="8" y={TOP} width="64" height={BOTTOM - TOP} rx="14" />
      <g clipPath={`url(#${id})`}>
        <motion.g
          initial={{ y: BOTTOM }}
          animate={{ y: level === 0 ? BOTTOM + 2 : surface }}
          transition={{ type: 'spring', stiffness: 55, damping: 13 }}
        >
          <g className="g-jar__wave g-jar__wave--back">
            <path d={WAVE} style={{ fill: `var(--${tone})` }} />
          </g>
          <g className="g-jar__wave">
            <path d={WAVE} style={{ fill: `var(--${tone})` }} />
          </g>
        </motion.g>
        <rect className="g-jar__shine" x="16" y={TOP + 8} width="6" height="40" rx="3" />
      </g>
      <rect className="g-jar__outline" x="8" y={TOP} width="64" height={BOTTOM - TOP} rx="14" />
      <rect className="g-jar__lid" x="18" y="5" width="44" height="11" rx="4" />
      <rect className="g-jar__slot" x="30" y="9" width="20" height="3" rx="1.5" />
    </svg>
  )
}
