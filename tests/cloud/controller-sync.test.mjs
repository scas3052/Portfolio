import assert from 'node:assert/strict'
import { test } from 'node:test'
import { changedKeys, uploadOps } from '../../src/finance/cloud/layout.js'
import { clearMarker, MARKER_KEY, readMarker } from '../../src/finance/cloud/marker.js'
import { addToOutbox, OUTBOX_KEY, readOutbox } from '../../src/finance/cloud/outbox.js'
import { emptyState, normalizeState } from '../../src/finance/lib/schema.js'
import { DATA_KEY } from '../../src/finance/lib/storage.js'
import { FakeCloud, settle } from '../helpers/cloud.mjs'
import {
  book,
  cloudState,
  comparable,
  device,
  drive,
  linkedDevice,
  OTHER,
  OWNER,
  ready,
  rename,
  setupDevices,
  signedOutDevice,
  startLinking,
  synced,
  upload,
  waitFor,
} from '../helpers/device.mjs'

setupDevices()

test('a linked device sends its edits to the cloud', async () => {
  const dev = await linkedDevice()
  rename(dev)
  assert.equal(dev.snap().status, 'syncing')
  assert.equal(dev.snap().pending, 1)
  dev.timers.tick(350)
  await waitFor(() => dev.cloud.waiting === 1, 'the commit')
  dev.cloud.ack()
  await synced(dev)
  assert.equal(cloudState(dev.cloud).settings.name, 'Asha R')
  assert.equal(dev.snap().pending, 0)
  assert.equal(readMarker().lastSyncedAt, dev.snap().lastSyncedAt)
})

test('a signed-out device keeps its edits and sends them once the owner signs in again', async () => {
  const dev = await signedOutDevice()
  rename(dev)
  assert.equal(dev.snap().pending, 1)
  await drive(startLinking(dev), dev.cloud)
  await synced(dev)
  assert.equal(cloudState(dev.cloud).settings.name, 'Asha R')
  assert.deepEqual(dev.lastToast(), { message: 'Signed in. Syncing again.', tone: 'mint' })
  assert.deepEqual(readOutbox(), {})
})

test('signing in again as someone else keeps the device as it was', async () => {
  const dev = await signedOutDevice()
  rename(dev)
  dev.api.nextUser = OTHER
  await drive(startLinking(dev), dev.cloud)
  assert.match(dev.lastToast().message, /This device syncs with owner@example\.com/)
  assert.equal(dev.api.user, null)
  assert.equal(readMarker().uid, OWNER.uid)
  assert.equal(Object.keys(readOutbox()).length, 1)
  await waitFor(() => dev.snap().status === 'signedOut', 'the device to be signed out')
  assert.equal(dev.cloud.commits.length, 0)
})

test('edits another tab parked count as pending here', async () => {
  const dev = await signedOutDevice()
  const before = book()
  const after = { ...before, settings: { ...before.settings, name: 'Asha T' } }
  addToOutbox(changedKeys(before, after), 'other-tab.1')
  dev.controller.noteStorage(OUTBOX_KEY)
  assert.equal(dev.snap().pending, 1)
})

test('once another tab signs the device out, this one leaves both books alone', async () => {
  const dev = await linkedDevice()
  // What signing out in the other tab leaves behind, before this tab hears of it.
  clearMarker()
  window.localStorage.setItem(DATA_KEY, JSON.stringify(normalizeState(emptyState())))
  rename(dev)
  dev.timers.tick(350)
  await settle()
  assert.equal(dev.cloud.commits.length, 0)
  dev.cloud.remoteWrite(uploadOps(book()))
  await settle()
  assert.equal(dev.state().transactions.length, 0)
  dev.controller.noteStorage(MARKER_KEY)
  await waitFor(() => !dev.snap().linked, 'the device to unlink')
  assert.equal(dev.snap().status, 'off')
})

test('a linked device signs out any other account it finds signed in', async () => {
  const dev = device({ state: book(), marker: OWNER, user: OTHER, cloud: new FakeCloud(upload(book())) })
  await waitFor(() => dev.snap().status === 'signedOut', 'the device to be signed out')
  await waitFor(() => dev.api.signOuts === 1, 'the sign-out')
  assert.equal(dev.api.user, null)
  assert.equal(dev.cloud.listens, 0)
})

test('an unlinked device leaves a signed-in account alone', async () => {
  const dev = device({ state: book(), user: OWNER })
  await ready(dev)
  await settle()
  assert.equal(dev.api.signOuts, 0)
  assert.equal(dev.snap().linked, false)
  assert.equal(dev.cloud.listens, 0)
})

test('re-upload puts the book back after the cloud copy went missing', async () => {
  const dev = await linkedDevice()
  dev.cloud.server.delete('core')
  dev.cloud.emit()
  await waitFor(() => dev.snap().status === 'paused' && dev.snap().detail === 'missing', 'the pause')
  dev.actions.reupload()
  await synced(dev)
  await waitFor(() => dev.toasts.length > 0, 'the toast')
  assert.deepEqual(comparable(cloudState(dev.cloud)), comparable(book()))
  assert.deepEqual(dev.lastToast(), { message: 'Your book is back in the cloud.', tone: 'mint' })
})

test('when Firebase fails to load, the device says so and tries again once back online', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const dev = device({ state: book(), marker: OWNER, user: OWNER, cloud: new FakeCloud(upload(book())), failLoad: true })
  await waitFor(() => dev.snap().status === 'error', 'the error')
  assert.equal(dev.snap().detail, 'load')
  assert.equal(dev.snap().sdk, 'failed')
  dev.failLoad = false
  dev.controller.noteOnline()
  await synced(dev)
  assert.equal(dev.loads, 2)
})
