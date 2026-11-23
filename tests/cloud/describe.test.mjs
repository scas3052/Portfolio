import assert from 'node:assert/strict'
import { test } from 'node:test'
import { describeSync, linkingWords, syncedAgo } from '../../src/finance/cloud/describe.js'
import { CLOUD_OFF } from '../../src/finance/store/contexts.js'

const NOW = Date.UTC(2025, 0, 10, 12)
const linked = (patch) => ({ ...CLOUD_OFF, available: true, linked: true, email: 'owner@example.com', ...patch })

test('syncedAgo says how long ago in plain words', () => {
  assert.equal(syncedAgo(null, NOW), null)
  assert.equal(syncedAgo(NOW - 20_000, NOW), 'just now')
  assert.equal(syncedAgo(NOW + 5_000, NOW), 'just now')
  assert.equal(syncedAgo(NOW - 5 * 60_000, NOW), '5 min ago')
  assert.equal(syncedAgo(NOW - 3 * 3_600_000, NOW), '3 h ago')
  assert.equal(syncedAgo(NOW - 26 * 3_600_000, NOW), '1 day ago')
  assert.equal(syncedAgo(NOW - 3 * 86_400_000, NOW), '3 days ago')
})

test('linkingWords names the step in progress', () => {
  assert.equal(linkingWords(null), null)
  assert.equal(linkingWords('signin'), 'Waiting for Google…')
  assert.equal(linkingWords('saving'), 'Saving…')
  assert.equal(linkingWords('signout'), 'Signing out…')
  assert.equal(linkingWords('toString'), null)
})

test('an unlinked device is invited to sign in', () => {
  const view = describeSync({ ...CLOUD_OFF, available: true }, NOW)
  assert.equal(view.mood, 'off')
  assert.equal(view.label, 'Sync is off')
  assert.equal(view.action, 'signIn')
})

test('a healthy device reads as synced or syncing', () => {
  assert.equal(describeSync(linked({ status: 'synced' }), NOW).label, 'Synced')
  assert.equal(describeSync(linked({ status: 'synced' }), NOW).action, null)
  const busy = describeSync(linked({ status: 'syncing', pending: 3 }), NOW)
  assert.equal(busy.mood, 'busy')
  assert.match(busy.line, /Sending 3 changes/)
  assert.equal(describeSync(linked({ status: 'connecting' }), NOW).mood, 'busy')
  assert.equal(describeSync(linked({ status: 'off' }), NOW).label, 'Connecting…')
})

test('waiting states say what is kept on this device', () => {
  const offline = describeSync(linked({ status: 'offline', pending: 1, lastSyncedAt: NOW - 120_000 }), NOW)
  assert.equal(offline.mood, 'waiting')
  assert.match(offline.line, /1 change is saved on this device/)
  assert.match(offline.line, /Last synced 2 min ago/)
  const out = describeSync(linked({ status: 'signedOut', pending: 2 }), NOW)
  assert.equal(out.action, 'signIn')
  assert.match(out.line, /as owner@example.com/)
  assert.match(out.line, /2 changes are saved/)
  const parked = describeSync(linked({ available: false, status: 'off', pending: 4 }), NOW)
  assert.equal(parked.label, 'Sync unavailable')
  assert.match(parked.line, /4 changes are saved/)
})

test('each problem points at the fix that helps', () => {
  const view = (patch) => describeSync(linked(patch), NOW)
  assert.equal(view({ status: 'denied' }).action, 'retry')
  assert.equal(view({ status: 'paused', detail: 'missing' }).action, 'reupload')
  assert.equal(view({ status: 'paused', detail: 'newer' }).action, 'reload')
  assert.equal(view({ status: 'error', detail: 'load' }).label, 'Can’t load sync')
  assert.equal(view({ status: 'error', detail: 'quota' }).label, 'Daily limit reached')
  assert.equal(view({ status: 'error', detail: 'invalid' }).label, 'Sync stopped')
  assert.equal(view({ status: 'error', detail: 'network' }).label, 'Can’t reach the cloud')
  for (const patch of [{ status: 'denied' }, { status: 'error', detail: 'invalid' }, { status: 'paused', detail: 'missing' }]) {
    assert.equal(view(patch).tone, 'rose')
  }
  assert.equal(view({ status: 'synced', linking: 'signout' }).label, 'Signing out…')
})
