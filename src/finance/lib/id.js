let counter = 0

/** Short random id. Uses crypto.getRandomValues, which also works on plain http. */
export function uid(prefix = '') {
  const bytes = new Uint8Array(6)
  const cryptoApi = globalThis.crypto
  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
    cryptoApi.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  }
  counter = (counter + 1) % 1296
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${prefix}${hex}${counter.toString(36).padStart(2, '0')}`
}

/** Monotonic-ish timestamp used to order entries that share a date. */
export function stamp() {
  return Date.now()
}
