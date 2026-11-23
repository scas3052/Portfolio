import { afterEach, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { ackOutbox, addToOutbox, clearOutbox, newToken, OUTBOX_KEY, readOutbox } from '../../src/finance/cloud/outbox.js'
import { installWindow } from '../helpers/ctx.mjs'

let restore
beforeEach(() => {
  restore = installWindow()
})
afterEach(() => restore())

test('edits waiting for the cloud are kept in localStorage under a token', () => {
  assert.deepEqual(readOutbox(), {})
  const first = newToken()
  const second = newToken()
  assert.notEqual(first, second)

  addToOutbox(['txn:a', 'budget:food'], first)
  addToOutbox(['txn:a', 'settings:name'], second)
  addToOutbox([], newToken())
  assert.deepEqual(readOutbox(), { 'txn:a': second, 'budget:food': first, 'settings:name': second })
  assert.deepEqual(JSON.parse(window.localStorage.getItem(OUTBOX_KEY)), readOutbox())
})

test('a confirmed write clears only the keys that have not been edited again since', () => {
  const sent = newToken()
  addToOutbox(['txn:a', 'txn:b'], sent)
  const later = newToken()
  addToOutbox(['txn:b'], later)

  ackOutbox(new Map([['txn:a', sent], ['txn:b', sent], ['txn:gone', sent]]))
  assert.deepEqual(readOutbox(), { 'txn:b': later })

  ackOutbox(new Map([['txn:b', later]]))
  assert.deepEqual(readOutbox(), {})
  assert.equal(window.localStorage.getItem(OUTBOX_KEY), null)
})

test('clearing empties it, and anything unreadable counts as empty', () => {
  addToOutbox(['txn:a'], newToken())
  clearOutbox()
  assert.equal(window.localStorage.getItem(OUTBOX_KEY), null)

  for (const junk of ['{oops', '[1,2]', 'null', '42', '"text"']) {
    window.localStorage.setItem(OUTBOX_KEY, junk)
    assert.deepEqual(readOutbox(), {}, junk)
  }
  window.localStorage.setItem(OUTBOX_KEY, JSON.stringify({ 'txn:a': 't.1', nokey: 't.2', 'txn:b': 3 }))
  assert.deepEqual(readOutbox(), { 'txn:a': 't.1' })
})

test('a browser that refuses to store anything does not break saving', () => {
  window.localStorage.setItem = () => {
    throw new Error('QuotaExceededError')
  }
  assert.doesNotThrow(() => addToOutbox(['txn:a'], newToken()))
  assert.deepEqual(readOutbox(), {})
})
