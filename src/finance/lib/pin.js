// The PIN is a privacy screen for a shared device, not encryption: data in
// localStorage stays readable to anyone with access to this browser profile.

export const PIN_LENGTH = 4

export function hashPin(pin) {
  const input = `gullak::${pin}::piggy-bank`
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

export function checkPin(pin, pinHash) {
  return Boolean(pinHash) && hashPin(pin) === pinHash
}
