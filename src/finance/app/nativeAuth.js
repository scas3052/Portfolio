// Google sign-in inside the Android app. Popups don't work in an app's web view, so Android's own account
// picker (Credential Manager, through @capgo/capacitor-social-login) returns a Google ID token and Firebase
// signs in with it (see cloud/firebase.js). Cloud sync then works exactly as on the website.

const WEB_CLIENT_ID = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID || ''

let ready = null

/**
 * Runs `task` with the plugin, set up once. The plugin is handed to a callback rather than returned: a Capacitor
 * plugin answers every property, `then` included, so a promise resolving to it would never settle.
 */
async function withSocialLogin(task) {
  const { SocialLogin } = await import('@capgo/capacitor-social-login')
  ready ??= SocialLogin.initialize({
    google: { webClientId: WEB_CLIENT_ID, mode: 'online', skipAuthOnlyAuthorizationAfterSignIn: true },
  })
  try {
    await ready
  } catch (err) {
    ready = null
    throw err
  }
  return task(SocialLogin)
}

const authError = (code, cause) => Object.assign(new Error(cause?.message || code), { code, cause })

/** Plugin failures as the auth codes cloud/errors.js explains to the user. */
function classify(err) {
  const text = `${err?.code || ''} ${err?.message || err || ''}`.toLowerCase()
  if (/cancel/.test(text)) return authError('auth/user-cancelled', err)
  if (/28444|developer console|not set up correctly|developer_error|\[10\]/.test(text)) return authError('auth/app-not-registered', err)
  if (/no ?credential|no google account|no account/.test(text)) return authError('auth/no-google-account', err)
  if (/network|offline|timeout|unreachable|\[7\]/.test(text)) return authError('auth/network-request-failed', err)
  return err
}

export const nativeAuth = {
  /** Shows Android's Google account picker and returns the chosen account's ID token. */
  async googleIdToken() {
    if (!WEB_CLIENT_ID) throw authError('auth/app-not-configured')
    let response
    try {
      response = await withSocialLogin((plugin) => plugin.login({ provider: 'google', options: {} }))
    } catch (err) {
      throw classify(err)
    }
    const token = response?.result?.idToken
    if (!token) throw authError('auth/app-not-registered')
    return token
  },
  /** Forgets the account picked last time, so the next sign-in asks again. */
  async signOut() {
    try {
      await withSocialLogin((plugin) => plugin.logout({ provider: 'google' }))
    } catch (err) {
      console.warn('Gullak sign-out:', err)
    }
  },
}
