import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { emptyState, normalizeState } from '../../src/finance/lib/schema.js'
import { DATA_KEY } from '../../src/finance/lib/storage.js'
import { createBookStore } from '../../src/finance/store/bookStore.js'
import { installWindow } from '../helpers/ctx.mjs'

const named = (name) => ({ type: 'settings/update', patch: { name } })
const withName = (name) => ({ ...emptyState(), settings: { ...emptyState().settings, name } })
const stored = () => JSON.parse(window.localStorage.getItem(DATA_KEY))

/** Records writes to the book and the events the store sends. */
function watchWindow() {
  const writes = []
  const events = []
  const setItem = window.localStorage.setItem
  window.localStorage.setItem = (key, value) => {
    if (key === DATA_KEY) writes.push(value)
    setItem(key, value)
  }
  window.dispatchEvent = (event) => {
    events.push(event.type)
    return true
  }
  return { writes, events }
}

describe('book store', () => {
  let restore

  beforeEach(() => {
    restore = installWindow()
  })

  afterEach(() => {
    restore()
  })

  test('boots from the saved book and leaves it alone when it is already current', () => {
    window.localStorage.setItem(DATA_KEY, JSON.stringify(normalizeState(withName('Asha'))))
    const { writes } = watchWindow()

    const store = createBookStore()
    store.saveNow()

    assert.equal(store.getSnapshot().settings.name, 'Asha')
    assert.equal(writes.length, 0)
  })

  test('writes a fresh book on first use, and replaces a malformed one', () => {
    createBookStore().saveNow()
    assert.deepEqual(stored(), emptyState())

    window.localStorage.setItem(DATA_KEY, '{not json')
    createBookStore().saveNow()
    assert.deepEqual(stored(), emptyState())
  })

  test('saves each edit before telling views and edit listeners about it', () => {
    const store = createBookStore()
    store.saveNow()
    const seen = []
    store.subscribe(() => seen.push(['view', stored().settings.name]))
    store.bridge.subscribeLocal((prev, next) => seen.push(['edit', prev.settings.name, next.settings.name]))

    store.dispatch(named('Ravi'))

    assert.deepEqual(seen, [
      ['view', 'Ravi'],
      ['edit', '', 'Ravi'],
    ])
    assert.equal(store.getSnapshot().settings.name, 'Ravi')
  })

  test('an action that changes nothing saves nothing and reports nothing', () => {
    const store = createBookStore()
    store.saveNow()
    const { writes } = watchWindow()
    let calls = 0
    store.subscribe(() => calls++)
    store.bridge.subscribeLocal(() => calls++)
    const before = store.getSnapshot()

    store.dispatch({ type: 'nothing/here' })

    assert.equal(store.getSnapshot(), before)
    assert.equal(writes.length, 0)
    assert.equal(calls, 0)
  })

  test('a book from the cloud is saved and shown but is not reported as an edit', () => {
    const store = createBookStore()
    store.saveNow()
    let views = 0
    let edits = 0
    store.subscribe(() => views++)
    store.bridge.subscribeLocal(() => edits++)
    const remote = withName('Cloud')

    store.bridge.applyRemote(remote)

    assert.equal(store.getSnapshot(), remote)
    assert.equal(stored().settings.name, 'Cloud')
    assert.equal(views, 1)
    assert.equal(edits, 0)
  })

  test('picks up a book another tab saved, and edits build on it', () => {
    const store = createBookStore()
    store.saveNow()
    let views = 0
    const edits = []
    store.subscribe(() => views++)
    store.bridge.subscribeLocal((prev, next) => edits.push([prev.settings.name, next.settings.name]))

    const other = withName('Other tab')
    window.localStorage.setItem(DATA_KEY, JSON.stringify(other))
    assert.equal(store.bridge.getState().settings.name, 'Other tab')
    assert.equal(views, 1)
    assert.deepEqual(edits, [])

    window.localStorage.setItem(DATA_KEY, JSON.stringify({ ...other, settings: { ...other.settings, onboarded: true } }))
    store.dispatch(named('Here'))
    assert.deepEqual(edits, [['Other tab', 'Here']])
    assert.equal(stored().settings.onboarded, true)
    assert.equal(stored().settings.name, 'Here')
  })

  test('ignores a malformed write from elsewhere and writes its own book back on the next edit', () => {
    const store = createBookStore()
    store.dispatch(named('Mine'))
    window.localStorage.setItem(DATA_KEY, '{broken')

    store.refresh()
    assert.equal(store.getSnapshot().settings.name, 'Mine')

    store.dispatch({ type: 'settings/update', patch: { onboarded: true } })
    assert.equal(stored().settings.name, 'Mine')
    assert.equal(stored().settings.onboarded, true)
  })

  test('says so when the book cannot be saved, and keeps the edit on screen', () => {
    const store = createBookStore()
    store.saveNow()
    const before = window.localStorage.getItem(DATA_KEY)
    const { events } = watchWindow()
    window.localStorage.setItem = () => {
      throw new Error('QuotaExceededError')
    }

    store.dispatch(named('Unsaved'))

    assert.deepEqual(events, ['gullak:save-failed'])
    assert.equal(store.getSnapshot().settings.name, 'Unsaved')
    assert.equal(window.localStorage.getItem(DATA_KEY), before)
    store.refresh()
    assert.equal(store.getSnapshot().settings.name, 'Unsaved')
  })

  test('a failing edit listener does not undo or block the edit', (t) => {
    const logged = t.mock.method(console, 'error', () => {})
    const store = createBookStore()
    const seen = []
    store.bridge.subscribeLocal(() => {
      throw new Error('boom')
    })
    store.bridge.subscribeLocal((prev, next) => seen.push(next.settings.name))

    store.dispatch(named('Still here'))

    assert.deepEqual(seen, ['Still here'])
    assert.equal(stored().settings.name, 'Still here')
    assert.equal(logged.mock.callCount(), 1)
  })

  test('unsubscribing stops further reports', () => {
    const store = createBookStore()
    let views = 0
    let edits = 0
    const stopView = store.subscribe(() => views++)
    const stopEdits = store.bridge.subscribeLocal(() => edits++)
    stopView()
    stopEdits()

    store.dispatch(named('Quiet'))

    assert.equal(views, 0)
    assert.equal(edits, 0)
  })
})
