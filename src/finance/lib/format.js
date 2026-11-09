export const MINUS = '\u2212'
export const MASK = '₹ ••••'

const whole = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
const withPaise = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

function compactBody(abs) {
  const short = (n) => String(parseFloat(n.toFixed(n >= 100 ? 0 : n >= 10 ? 1 : 2)))
  if (abs >= 1e7) return `${short(abs / 1e7)}Cr`
  if (abs >= 1e5) return `${short(abs / 1e5)}L`
  if (abs >= 1e3) return `${short(abs / 1e3)}K`
  return whole.format(Math.round(abs))
}

/**
 * Indian-grouped rupee string, e.g. ₹1,23,456 or −₹420.50.
 * sign: 'auto' (minus only), 'always' (+/−) or 'none'.
 */
export function formatINR(value, { sign = 'auto', compact = false, paise = 'auto' } = {}) {
  const v = round2(value)
  const abs = Math.abs(v)
  let body
  if (compact) {
    body = compactBody(abs)
  } else {
    const showPaise = paise === true || (paise === 'auto' && Math.round(abs * 100) % 100 !== 0)
    body = (showPaise ? withPaise : whole).format(abs)
  }
  let prefix = ''
  if (v < 0 && sign !== 'none') prefix = MINUS
  else if (v > 0 && sign === 'always') prefix = '+'
  return `${prefix}₹${body}`
}

export function formatNumber(value) {
  return whole.format(Math.round(Number(value) || 0))
}

export function formatPercent(ratio, digits = 0) {
  if (!Number.isFinite(ratio)) return '—'
  const body = Math.abs(ratio * 100).toFixed(digits)
  return `${ratio < 0 && Number(body) !== 0 ? MINUS : ''}${body}%`
}

export function plural(count, word, many = `${word}s`) {
  return `${count} ${count === 1 ? word : many}`
}

export function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
