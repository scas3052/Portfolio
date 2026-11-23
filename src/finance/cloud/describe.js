// Plain words for the state of cloud sync, shared by the top bar badge and the Settings card.
import { onThisDevice } from '../lib/where'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const count = (n, one, many) => `${n} ${n === 1 ? one : many}`

/** "just now", "5 min ago", "3 h ago", "2 days ago" (null when there is no time). */
export function syncedAgo(at, now = Date.now()) {
  if (!at) return null
  const diff = Math.max(0, now - at)
  if (diff < MINUTE) return 'just now'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`
  if (diff < DAY) return `${Math.floor(diff / HOUR)} h ago`
  return `${count(Math.floor(diff / DAY), 'day', 'days')} ago`
}

const LINKING = {
  signin: 'Waiting for Google…',
  checking: 'Looking for your book…',
  choosing: 'Waiting for your choice…',
  saving: 'Saving…',
  signout: 'Signing out…',
}

/** What a sign-in, first link or sign-out in progress is doing (null when none is). */
export function linkingWords(linking) {
  return linking && Object.hasOwn(LINKING, linking) ? LINKING[linking] : null
}

const say = (mood, tone, label, line, action = null) => ({ mood, tone, label, line, action })

/**
 * What the UI shows for a cloud snapshot. `mood` picks the icon ('off', 'busy', 'ok', 'waiting' or
 * 'problem'), `tone` its colour, `label` is a short status and `line` a sentence for Settings.
 * `action` is the one thing that helps, if any: 'signIn', 'retry', 'reupload' or 'reload'.
 */
export function describeSync(cloud, now = Date.now()) {
  if (!cloud.linked) {
    return say(
      'off',
      'gray',
      'Sync is off',
      `This book lives only ${onThisDevice()}. Sign in with Google to keep it the same on all your devices.`,
      'signIn',
    )
  }
  if (cloud.linking === 'signout') return say('busy', 'sky', 'Signing out…', 'Sending the last changes first.')

  const ago = syncedAgo(cloud.lastSyncedAt, now)
  const last = ago ? ` Last synced ${ago}.` : ''
  const safe = cloud.pending
    ? ` ${count(cloud.pending, 'change is', 'changes are')} saved on this device and will sync later.`
    : ''

  if (!cloud.available) {
    return say('waiting', 'butter', 'Sync unavailable', `This copy of Gullak isn’t set up to reach the cloud.${safe}`)
  }

  switch (cloud.status) {
    case 'synced':
      return say('ok', 'mint', 'Synced', 'Up to date. Changes you make here show up on your other devices.')
    case 'syncing':
      return say(
        'busy',
        'sky',
        'Syncing…',
        cloud.pending ? `Sending ${count(cloud.pending, 'change', 'changes')} to the cloud.` : 'Catching up with your cloud book.',
      )
    case 'offline':
      return say('waiting', 'butter', 'Offline', `You’re offline, so syncing waits until you’re back.${safe}${last}`)
    case 'signedOut':
      return say(
        'waiting',
        'butter',
        'Signed out',
        `Sign in again${cloud.email ? ` as ${cloud.email}` : ''} to keep syncing.${safe}`,
        'signIn',
      )
    case 'denied':
      return say(
        'problem',
        'rose',
        'Access denied',
        `The cloud turned ${cloud.email || 'this account'} away. If you changed the Firestore rules, check they still allow this email.${safe}`,
        'retry',
      )
    case 'paused':
      return cloud.detail === 'missing'
        ? say(
            'problem',
            'rose',
            'Cloud copy missing',
            'Your book is no longer in the cloud. Upload this device’s copy to start syncing again.',
            'reupload',
          )
        : say(
            'waiting',
            'butter',
            'Update needed',
            'Your cloud book was saved by a newer version of Gullak. Reload this page to update.',
            'reload',
          )
    case 'error':
      if (cloud.detail === 'load') {
        return say('problem', 'rose', 'Can’t load sync', `The sync service didn’t load. Check your connection and retry.${safe}`, 'retry')
      }
      if (cloud.detail === 'quota') {
        return say(
          'waiting',
          'butter',
          'Daily limit reached',
          `Today’s free Firebase allowance is used up, so Gullak will try again later.${safe}`,
          'retry',
        )
      }
      if (cloud.detail === 'invalid') {
        return say(
          'problem',
          'rose',
          'Sync stopped',
          `The cloud refused a change, so syncing has stopped. Your book is safe on this device.${safe}`,
          'retry',
        )
      }
      return say('waiting', 'butter', 'Can’t reach the cloud', `Gullak keeps trying on its own.${safe}${last}`, 'retry')
    default:
      return say('busy', 'sky', 'Connecting…', 'Getting in touch with your cloud book.')
  }
}
