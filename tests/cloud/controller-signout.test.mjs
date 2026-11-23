import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MARKER_KEY, readMarker, SYNCED_KEY } from '../../src/finance/cloud/marker.js'
import { OUTBOX_KEY, readOutbox } from '../../src/finance/cloud/outbox.js'
import { emptyState } from '../../src/finance/lib/schema.js'
import { FakeCloud } from '../helpers/cloud.mjs'
import {
  book,
  cloudState,
  device,
  linkedDevice,
  OTHER,
  OWNER,
  rename,
  setupDevices,
  signedOutDevice,
  synced,
  upload,
  waitFor,
} from '../helpers/device.mjs'

setupDevices()

const signedOut = (dev) => waitFor(() => dev.snap().linking === null && dev.toasts.length > 0, 'the sign-out')

test('signing out forgets the book on this device and leaves the cloud copy alone', async () => {
  const dev = await linkedDevice()
  const server = structuredClone(dev.cloud.server)
  dev.actions.signOutDevice()
  assert.equal(dev.sheet.kind, 'confirm')
  assert.equal(dev.sheet.props.title, 'Sign out of this device?')
  assert.match(dev.sheet.props.body, /owner@example\.com/)
  assert.equal(dev.sheet.props.hold, false)
  await dev.confirm()
  await signedOut(dev)
  assert.deepEqual(dev.state(), emptyState())
  for (const key of [MARKER_KEY, SYNCED_KEY, OUTBOX_KEY]) assert.equal(window.localStorage.getItem(key), null)
  assert.equal(dev.api.signOuts, 1)
  assert.equal(dev.api.terminated, 1)
  assert.equal(dev.forgets, 1)
  assert.equal(dev.unlocks, 1)
  assert.deepEqual(dev.lastToast(), { message: 'Signed out. Your book is safe in the cloud.', tone: 'mint' })
  assert.deepEqual(dev.cloud.server, server)
  assert.equal(dev.snap().linked, false)
  assert.equal(dev.snap().status, 'off')
})

test('signing out with edits still on their way asks again before losing them', async () => {
  const dev = await linkedDevice()
  dev.cloud.goOffline()
  rename(dev)
  dev.timers.tick(350)
  dev.actions.signOutDevice()
  assert.equal(dev.sheet.props.hold, true)
  await dev.confirm()
  await waitFor(() => dev.sheet?.props.title === 'Some edits haven’t reached the cloud', 'the second question')
  assert.equal(dev.sheet.props.confirmLabel, 'Sign out anyway')
  assert.equal(dev.sheet.props.hold, true)
  assert.match(dev.sheet.props.body, /^1 edit is still only on this device/)
  assert.equal(readMarker().uid, OWNER.uid)
  await dev.confirm()
  await signedOut(dev)
  assert.equal(readMarker(), null)
  assert.equal(cloudState(dev.cloud).settings.name, 'Asha')
})

test('a signed-out device warns once that its parked edits will be lost', async () => {
  const dev = await signedOutDevice()
  rename(dev)
  dev.actions.signOutDevice()
  assert.match(dev.sheet.props.body, /^1 edit hasn’t reached the cloud yet/)
  assert.match(dev.sheet.props.body, /keep it\.$/)
  assert.equal(dev.sheet.props.hold, true)
  await dev.confirm()
  await signedOut(dev)
  assert.equal(dev.sheet, null)
  assert.equal(readMarker(), null)
  assert.deepEqual(readOutbox(), {})
  assert.equal(dev.api.terminated, 1)
})

test('a sign-out confirmed on the lock screen does not ask again', async () => {
  const dev = await linkedDevice()
  dev.actions.signOutDevice({ confirmed: true })
  await signedOut(dev)
  assert.equal(dev.sheet, null)
  assert.equal(readMarker(), null)
  assert.equal(dev.unlocks, 1)
  assert.deepEqual(dev.state(), emptyState())
})

test('confirming with Google removes the PIN on every device', async () => {
  const dev = await linkedDevice()
  const result = await dev.actions.confirmWithGoogle()
  assert.deepEqual(result, { ok: true })
  assert.equal(dev.state().settings.pinHash, null)
  assert.equal(dev.unlocks, 1)
  assert.equal(dev.api.reauths, 1)
  assert.equal(dev.api.signIns, 0)
  assert.deepEqual(dev.lastToast(), { message: 'PIN removed on every device. Set a new one in Settings.', tone: 'mint' })
  dev.timers.tick(350)
  await synced(dev)
  assert.equal(cloudState(dev.cloud).settings.pinHash, null)
})

test('confirming with a different Google account keeps the PIN', async () => {
  const dev = await signedOutDevice()
  dev.api.nextUser = OTHER
  const result = await dev.actions.confirmWithGoogle()
  assert.equal(result.ok, false)
  assert.equal(result.message, 'That’s not the account this device syncs with (owner@example.com).')
  assert.equal(dev.state().settings.pinHash, 'hash')
  assert.equal(dev.api.user, null)
  assert.equal(dev.unlocks, 0)
})

test('confirming with Google before sync has started asks to try again', async () => {
  const dev = device({ state: book(), marker: OWNER, user: OWNER, cloud: new FakeCloud(upload(book())) })
  const result = await dev.actions.confirmWithGoogle()
  assert.deepEqual(result, { ok: false, message: 'Sync is still starting. Try again in a moment.' })
  assert.equal(dev.state().settings.pinHash, 'hash')
  await waitFor(() => dev.snap().sdk === 'ready', 'Firebase to load')
})
