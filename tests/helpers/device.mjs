import assert from 'node:assert/strict'
import { afterEach, beforeEach } from 'node:test'
import { createCloudController } from '../../src/finance/cloud/controller.js'
import { readBook, uploadOps } from '../../src/finance/cloud/layout.js'
import { writeMarker } from '../../src/finance/cloud/marker.js'
import { buildSample } from '../../src/finance/lib/sample.js'
import { emptyState, normalizeState } from '../../src/finance/lib/schema.js'
import { DATA_KEY } from '../../src/finance/lib/storage.js'
import { createBookStore } from '../../src/finance/store/bookStore.js'
import { applyOps, FakeCloud, fakeTimers, settle } from './cloud.mjs'
import { installWindow, TODAY } from './ctx.mjs'

export const OWNER = Object.freeze({ uid: 'u1', email: 'owner@example.com' })
export const OTHER = Object.freeze({ uid: 'u2', email: 'someone@example.com' })

const SAMPLE = buildSample(TODAY)

/** The owner's book: the sample data, onboarded, with a name and a PIN. */
export function book() {
  const state = structuredClone(SAMPLE)
  state.settings = { ...state.settings, name: 'Asha', pinHash: 'hash', onboarded: true }
  state.meta = { ...state.meta, sample: false }
  return state
}

/** A cloud copy that differs from book() in its name, its PIN and one entry each way. */
export function cloudBook() {
  const state = book()
  const [, second] = state.transactions
  state.settings = { ...state.settings, name: 'Asha K', pinHash: null }
  state.transactions = [...state.transactions.slice(1), { ...second, id: 'cloud-only' }]
  return state
}

export function upload(state) {
  const docs = new Map()
  applyOps(docs, uploadOps(state))
  return docs
}

export const cloudState = (cloud) => readBook(cloud.server).state

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** Leaves out what may differ between two copies of one book: the per-device privacy switch and entry order. */
export function comparable(state) {
  const s = normalizeState(state)
  return { ...s, settings: { ...s.settings, privacy: false }, transactions: [...s.transactions].sort(byId) }
}

export const rename = (dev, name = 'Asha R') => dev.edit({ type: 'settings/update', patch: { name } })

/** Firebase as the controller sees it, with the server played by a FakeCloud. */
function fakeApi(cloud, user) {
  const watchers = new Set()
  const api = {
    user,
    // Who the next sign-in popup returns; an Error rejects it instead.
    nextUser: OWNER,
    fetchError: null,
    signIns: 0,
    reauths: 0,
    signOuts: 0,
    terminated: 0,
    authReady: async () => {},
    currentUser: () => api.user,
    onUser(fn) {
      watchers.add(fn)
      queueMicrotask(() => {
        if (watchers.has(fn)) fn(api.user)
      })
      return () => watchers.delete(fn)
    },
    setUser(next) {
      api.user = next
      for (const fn of [...watchers]) fn(next)
    },
    async signIn() {
      api.signIns += 1
      if (api.nextUser instanceof Error) throw api.nextUser
      api.setUser(api.nextUser)
      return api.nextUser
    },
    async reauth() {
      api.reauths += 1
      if (api.nextUser instanceof Error) throw api.nextUser
      return api.nextUser
    },
    async signOut() {
      api.signOuts += 1
      api.setUser(null)
    },
    async terminate() {
      api.terminated += 1
    },
    waitForWrites: async () => {},
    book: () => ({
      listen: (onSnap, onError) => cloud.listen(onSnap, onError),
      commit: (ops, onChunk) => cloud.commit(ops, onChunk),
      async fetchAll() {
        if (api.fetchError) throw api.fetchError
        return structuredClone(cloud.server)
      },
    }),
  }
  return api
}

const live = []

/** Gives each test a fresh window, and stops the controllers it started. */
export function setupDevices() {
  let restore = null
  beforeEach(() => {
    restore = installWindow()
  })
  afterEach(() => {
    for (const dev of live.splice(0)) dev.controller.stop()
    restore()
  })
}

/** One browser: its saved book and sync marker, a book store, a fake UI and a running controller. */
export function device({ state = emptyState(), marker = null, user = null, cloud = new FakeCloud(), available = true, failLoad = false } = {}) {
  window.localStorage.setItem(DATA_KEY, JSON.stringify(normalizeState(state)))
  if (marker) writeMarker(marker)
  const store = createBookStore()
  const timers = fakeTimers()
  const api = fakeApi(cloud, user)
  let clock = 1_000
  const dev = { api, cloud, store, timers, failLoad, loads: 0, sheet: null, toasts: [], unlocks: 0, forgets: 0 }
  const controller = createCloudController({
    available,
    loadApi: async () => {
      dev.loads += 1
      if (dev.failLoad) throw new Error('The Firebase chunk did not load.')
      return api
    },
    bridge: store.bridge,
    dispatch: store.dispatch,
    wait: () => settle(),
    now: () => (clock += 1),
    settleMs: 1_000,
    timers,
  })
  const ui = {
    openSheet(kind, props) {
      dev.sheet = { kind, props }
      controller.noteSheet(kind)
    },
    closeSheet() {
      dev.sheet = null
      controller.noteSheet(null)
    },
    toast(message, options = {}) {
      dev.toasts.push({ message, ...options })
    },
    unlock() {
      dev.unlocks += 1
    },
    forgetDevice() {
      dev.forgets += 1
    },
  }
  controller.setUi(ui)
  Object.assign(dev, {
    controller,
    ui,
    actions: controller.actions,
    edit: (action) => store.dispatch(action),
    state: () => store.bridge.getState(),
    snap: () => controller.getSnapshot(),
    lastToast: () => dev.toasts.at(-1),
    /** Presses confirm on the open sheet, which closes itself before it acts (as ConfirmSheet does). */
    confirm() {
      const { props } = dev.sheet
      ui.closeSheet()
      return props.onConfirm()
    },
  })
  controller.start()
  live.push(dev)
  return dev
}

export async function waitFor(check, what) {
  for (let i = 0; i < 100 && !check(); i += 1) await settle()
  assert.ok(check(), `timed out waiting for ${typeof what === 'function' ? what() : what}`)
}

/** Waits for `promise`, letting the server accept each commit sent meanwhile. */
export async function drive(promise, cloud) {
  let done = false
  Promise.resolve(promise).then(
    () => (done = true),
    () => (done = true),
  )
  for (let i = 0; i < 100 && !done; i += 1) {
    while (cloud.waiting) cloud.ack()
    await settle()
  }
  assert.ok(done, 'timed out waiting for the action to finish')
  return promise
}

export async function synced(dev) {
  await waitFor(
    () => {
      while (dev.cloud.waiting) dev.cloud.ack()
      return dev.snap().status === 'synced'
    },
    () => `sync; the status is ${dev.snap().status} (${dev.snap().detail})`,
  )
}

export async function ready(dev) {
  dev.actions.prepare()
  await waitFor(() => dev.snap().sdk === 'ready', 'Firebase to load')
}

export async function startLinking(dev) {
  await ready(dev)
  return dev.actions.startLink()
}

/** A device signed in to the owner's account, in sync with a cloud copy of `state`. */
export async function linkedDevice(state = book()) {
  const dev = device({ state, marker: OWNER, user: OWNER, cloud: new FakeCloud(upload(state)) })
  await synced(dev)
  return dev
}

/** A device linked to the owner whose sign-in has lapsed. */
export async function signedOutDevice(state = book()) {
  const dev = device({ state, marker: OWNER, cloud: new FakeCloud(upload(state)) })
  await waitFor(() => dev.snap().status === 'signedOut', () => `signed out; the status is ${dev.snap().status}`)
  return dev
}
