import assert from 'node:assert/strict'
import { test } from 'node:test'
import { summarize } from '../../src/finance/cloud/controller.js'
import { OWNER_ONLY } from '../../src/finance/cloud/errors.js'
import { readMarker } from '../../src/finance/cloud/marker.js'
import { OUTBOX_KEY, readOutbox } from '../../src/finance/cloud/outbox.js'
import { emptyState, SCHEMA_VERSION } from '../../src/finance/lib/schema.js'
import { DATA_KEY } from '../../src/finance/lib/storage.js'
import { FakeCloud, settle } from '../helpers/cloud.mjs'
import {
  book,
  cloudBook,
  cloudState,
  comparable,
  device,
  drive,
  OTHER,
  OWNER,
  ready,
  rename,
  setupDevices,
  startLinking,
  synced,
  upload,
  waitFor,
} from '../helpers/device.mjs'

setupDevices()

const failure = (code) => Object.assign(new Error(code), { code })

test('summarize describes a book for the "which book?" question', () => {
  const state = book()
  const summary = summarize(state)
  assert.equal(summary.name, 'Asha')
  assert.equal(summary.entries, state.transactions.length)
  assert.equal(summary.accounts, state.accounts.length)
  assert.equal(summary.pin, true)
  assert.equal(summary.latest, state.transactions.map((t) => t.date).sort().at(-1))
  assert.equal(summarize(emptyState()).latest, null)
  assert.equal(summarize(emptyState()).pin, false)
})

test('an unlinked device never loads Firebase or keeps an outbox', async () => {
  const dev = device({ state: book() })
  rename(dev)
  await settle()
  assert.equal(dev.loads, 0)
  assert.equal(dev.snap().status, 'off')
  assert.equal(dev.snap().pending, 0)
  assert.equal(window.localStorage.getItem(OUTBOX_KEY), null)
})

test('without a Firebase config a linked device still keeps its edits for later', async () => {
  const dev = device({ state: book(), marker: OWNER, available: false })
  await settle()
  assert.equal(dev.snap().linked, true)
  assert.equal(dev.snap().status, 'off')
  rename(dev)
  assert.equal(dev.snap().pending, 1)
  assert.equal(Object.keys(readOutbox()).length, 1)
  assert.equal(dev.loads, 0)
})

test('a fresh device adopts the cloud book', async () => {
  const cloud = new FakeCloud(upload(book()))
  const dev = device({ cloud })
  await drive(startLinking(dev), cloud)
  assert.deepEqual(comparable(dev.state()), comparable(book()))
  assert.equal(readMarker().uid, OWNER.uid)
  assert.equal(cloud.commits.length, 0)
  assert.deepEqual(dev.lastToast(), { message: 'Sync is on for owner@example.com.', tone: 'mint' })
  await synced(dev)
  assert.equal(dev.snap().linked, true)
  assert.equal(dev.snap().email, OWNER.email)
  assert.equal(dev.snap().linking, null)
})

test('linking uploads the book when the cloud is empty', async () => {
  const cloud = new FakeCloud()
  const dev = device({ state: book(), cloud })
  await drive(startLinking(dev), cloud)
  assert.deepEqual(comparable(cloudState(cloud)), comparable(book()))
  await synced(dev)
  assert.deepEqual(readOutbox(), {})
})

test('an edit made while the book uploads still reaches the cloud', async () => {
  const cloud = new FakeCloud()
  const dev = device({ state: book(), cloud })
  const linking = startLinking(dev)
  await waitFor(() => cloud.waiting === 1, 'the upload')
  rename(dev)
  cloud.ack()
  await linking
  await synced(dev)
  assert.equal(cloudState(cloud).settings.name, 'Asha R')
  assert.equal(dev.state().settings.name, 'Asha R')
  assert.deepEqual(readOutbox(), {})
})

async function asking() {
  const cloud = new FakeCloud(upload(cloudBook()))
  const dev = device({ state: book(), cloud })
  const linking = startLinking(dev)
  await waitFor(() => dev.sheet?.kind === 'cloudLink', 'the question')
  return { dev, cloud, linking }
}

test('when both sides hold a book, the owner is asked which to keep', async () => {
  const { dev, cloud, linking } = await asking()
  assert.equal(dev.snap().linking, 'choosing')
  assert.deepEqual(dev.sheet.props, { here: summarize(dev.state()), cloud: summarize(cloudState(cloud)), email: OWNER.email })
  assert.deepEqual(comparable(dev.actions.cloudCopy()), comparable(cloudBook()))
  dev.actions.chooseLink('keep')
  await drive(linking, cloud)
  assert.equal(dev.actions.cloudCopy(), null)
})

test('"keep cloud" swaps this device’s book for the cloud’s', async () => {
  const { dev, cloud, linking } = await asking()
  dev.actions.chooseLink('keep')
  await drive(linking, cloud)
  assert.deepEqual(comparable(dev.state()), comparable(cloudBook()))
  assert.equal(cloud.commits.length, 0)
  assert.equal(dev.sheet, null)
  assert.equal(readMarker().uid, OWNER.uid)
})

test('"replace cloud" uploads this device’s book over the cloud’s', async () => {
  const { dev, cloud, linking } = await asking()
  dev.actions.chooseLink('replace')
  await drive(linking, cloud)
  assert.deepEqual(comparable(cloudState(cloud)), comparable(book()))
  assert.deepEqual(comparable(dev.state()), comparable(book()))
})

test('"merge" keeps the entries from both sides', async () => {
  const { dev, cloud, linking } = await asking()
  dev.actions.chooseLink('merge')
  await drive(linking, cloud)
  const merged = cloudState(cloud)
  const ids = new Set([...book().transactions, ...cloudBook().transactions].map((t) => t.id))
  assert.deepEqual(new Set(merged.transactions.map((t) => t.id)), ids)
  assert.equal(merged.settings.name, 'Asha K')
  assert.equal(merged.settings.pinHash, 'hash')
  await synced(dev)
  assert.deepEqual(comparable(dev.state()), comparable(merged))
})

test('closing the question leaves sync off and changes nothing', async () => {
  const { dev, cloud, linking } = await asking()
  const before = window.localStorage.getItem(DATA_KEY)
  dev.ui.closeSheet()
  await drive(linking, cloud)
  assert.equal(window.localStorage.getItem(DATA_KEY), before)
  assert.equal(dev.api.signOuts, 1)
  assert.equal(readMarker(), null)
  assert.equal(dev.snap().linked, false)
  assert.equal(dev.snap().linking, null)
  assert.equal(cloud.commits.length, 0)
  assert.deepEqual(dev.lastToast(), { message: 'Sync stays off. Nothing was changed.' })
})

test('anyone but the owner is turned away and signed out again', async () => {
  const dev = device({ state: book() })
  dev.api.nextUser = OTHER
  dev.api.fetchError = failure('permission-denied')
  await drive(startLinking(dev), dev.cloud)
  assert.deepEqual(dev.lastToast(), { message: OWNER_ONLY, tone: 'rose', duration: 8000 })
  assert.equal(dev.api.user, null)
  assert.equal(readMarker(), null)
  assert.equal(dev.snap().linked, false)
  assert.equal(dev.snap().linking, null)
  assert.deepEqual(comparable(dev.state()), comparable(book()))
})

test('the sign-in sheet shows a refusal inline instead of a toast', async () => {
  const dev = device({ state: book() })
  dev.api.fetchError = failure('permission-denied')
  await ready(dev)
  dev.ui.openSheet('cloudSignIn', {})
  await drive(dev.actions.startLink(), dev.cloud)
  assert.equal(dev.snap().notice, OWNER_ONLY)
  assert.equal(dev.toasts.length, 0)
  assert.equal(dev.sheet.kind, 'cloudSignIn')
})

test('a cloud book saved by a newer Gullak is left alone', async () => {
  const docs = upload(book())
  docs.set('core', { ...docs.get('core'), version: SCHEMA_VERSION + 1 })
  const cloud = new FakeCloud(docs)
  const dev = device({ cloud })
  await drive(startLinking(dev), cloud)
  assert.match(dev.lastToast().message, /newer version of Gullak/)
  assert.equal(dev.api.user, null)
  assert.equal(readMarker(), null)
  assert.equal(cloud.commits.length, 0)
})

test('a check that fails offline says so', async () => {
  const dev = device({ state: book() })
  dev.api.fetchError = failure('unavailable')
  await drive(startLinking(dev), dev.cloud)
  assert.equal(dev.lastToast().message, 'You seem to be offline. Check your connection and try again.')
  assert.equal(dev.api.user, null)
  assert.equal(readMarker(), null)
})
