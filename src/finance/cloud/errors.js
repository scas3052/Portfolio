// Plain-language messages for the errors Firebase reports while signing in or syncing.
export const OWNER_ONLY = 'Sync is private to the owner of this site. You’re signed out again and nothing on this device changed.'

// The user closed the popup or opened another one; there is nothing to report.
const SILENT = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled'])

const OFFLINE = 'You seem to be offline. Check your connection and try again.'

const MESSAGES = {
  'auth/popup-blocked': 'Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.',
  'auth/unauthorized-domain':
    'This site’s address isn’t allowed to sign in yet. Add it in Firebase under Authentication → Settings → Authorized domains.',
  'auth/operation-not-allowed':
    'Google sign-in is turned off for this site. Turn it on in Firebase under Authentication → Sign-in method.',
  'auth/network-request-failed': OFFLINE,
  'auth/user-mismatch': 'That’s a different Google account. Pick the one this device syncs with.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  // Android app sign-in (Google account picker, see app/nativeAuth.js).
  'auth/app-not-configured':
    'Google sign-in isn’t set up in this build of the app. Add VITE_GOOGLE_WEB_CLIENT_ID to the build settings and install a new build.',
  'auth/app-not-registered':
    'Google doesn’t recognise this copy of the app yet. Add its SHA-1 in Firebase (Project settings → Your apps → Android app), then try again.',
  'auth/no-google-account': 'Add a Google account to this phone (Settings → Passwords & accounts), then try again.',
  'auth/web-storage-unsupported':
    'This browser blocks the storage Google sign-in needs. Allow site data (or leave private browsing) and try again.',
  'permission-denied': OWNER_ONLY,
  unavailable: OFFLINE,
  'deadline-exceeded': 'The cloud took too long to answer. Check your connection and try again.',
  'resource-exhausted': 'Today’s free cloud allowance is used up. Sync picks up again tomorrow.',
}

/**
 * What to tell the user about `err`: null when there is nothing to say (they closed the popup),
 * otherwise a known message or `fallback`.
 */
export function authMessage(err, fallback = 'Something went wrong. Please try again.') {
  const code = typeof err?.code === 'string' ? err.code : ''
  if (SILENT.has(code)) return null
  if (Object.hasOwn(MESSAGES, code)) return MESSAGES[code]
  console.warn('Gullak sync:', err)
  return fallback
}
