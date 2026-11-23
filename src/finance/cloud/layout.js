// How a book is stored in Firestore, and how local edits turn into writes.
//
//   users/{uid}/book/core      settings, budgets, meta, and every account, loan, person and goal
//   users/{uid}/book/YYYY-MM   { items: { <txn id>: txn } } for the entries dated in that month
//
// Splitting entries by month keeps each document well under Firestore's 1 MiB limit, and an edit
// rewrites only the fields it touched, so saving one entry costs one write.
//
// Everything is addressed by a flat key: `txn:<id>`, `account:<id>`, `loan:<id>`, `person:<id>`,
// `goal:<id>`, `budget:<category>`, `settings:<field>` and `meta:sample`.
import { normalizeState, SCHEMA_VERSION } from '../lib/schema'

export const CORE = 'core'
export const MONTH_DOC = /^\d{4}-\d{2}$/
export const LISTS = ['accounts', 'loans', 'people', 'goals']
const KIND_OF = { accounts: 'account', loans: 'loan', people: 'person', goals: 'goal' }
const LIST_OF = { account: 'accounts', loan: 'loans', person: 'people', goal: 'goals' }
// Hiding amounts is a per-device choice, so `privacy` never leaves the browser.
export const SETTINGS_FIELDS = ['name', 'pinHash', 'onboarded']

const MAX = Number.MAX_SAFE_INTEGER

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const compareIds = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const posValue = (value) => (Number.isFinite(value) ? value : MAX)

export function splitKey(key) {
  const at = key.indexOf(':')
  return at < 0 ? [key, ''] : [key.slice(0, at), key.slice(at + 1)]
}

// Firestore rejects empty field names and names shaped like __this__, so those get a `~` prefix.
// Names that already start with `~` get one too, which keeps the mapping reversible.
export function esc(name) {
  return name === '' || name.startsWith('~') || (name.startsWith('__') && name.endsWith('__')) ? `~${name}` : name
}

export function unesc(name) {
  return name.startsWith('~') ? name.slice(1) : name
}

function omitId(item) {
  const out = {}
  for (const key of Object.keys(item)) if (key !== 'id') out[key] = item[key]
  return out
}

/** The `YYYY-MM` document a transaction belongs in, or null when its date is unusable. */
export function monthDoc(txn) {
  const month = txn && typeof txn.date === 'string' ? txn.date.slice(0, 7) : ''
  return MONTH_DOC.test(month) ? month : null
}

export function shallowEqual(a, b) {
  if (a === b) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  return keys.every((key) => Object.hasOwn(b, key) && a[key] === b[key])
}

/** Every synced value of a book under its flat key. Values are the state's own objects. */
export function flatten(state) {
  const flat = new Map()
  for (const txn of state.transactions) flat.set(`txn:${txn.id}`, txn)
  for (const list of LISTS) for (const item of state[list]) flat.set(`${KIND_OF[list]}:${item.id}`, item)
  for (const [category, amount] of Object.entries(state.budgets)) flat.set(`budget:${category}`, amount)
  for (const field of SETTINGS_FIELDS) flat.set(`settings:${field}`, state.settings[field])
  flat.set('meta:sample', Boolean(state.meta?.sample))
  return flat
}

function diffList(kind, before, after, keys) {
  const old = new Map(before.map((item) => [item.id, item]))
  const kept = new Set()
  for (const item of after) {
    kept.add(item.id)
    const was = old.get(item.id)
    if (!was || (was !== item && !shallowEqual(was, item))) keys.add(`${kind}:${item.id}`)
  }
  for (const id of old.keys()) if (!kept.has(id)) keys.add(`${kind}:${id}`)
}

/** The keys whose synced value differs between two states (added, edited or removed). */
export function changedKeys(prev, next) {
  if (prev === next) return []
  const keys = new Set()
  if (prev.transactions !== next.transactions) diffList('txn', prev.transactions, next.transactions, keys)
  for (const list of LISTS) if (prev[list] !== next[list]) diffList(KIND_OF[list], prev[list], next[list], keys)
  if (prev.budgets !== next.budgets) {
    for (const category of Object.keys(prev.budgets)) {
      if (!Object.hasOwn(next.budgets, category) || next.budgets[category] !== prev.budgets[category]) {
        keys.add(`budget:${category}`)
      }
    }
    for (const category of Object.keys(next.budgets)) {
      if (!Object.hasOwn(prev.budgets, category)) keys.add(`budget:${category}`)
    }
  }
  if (prev.settings !== next.settings) {
    for (const field of SETTINGS_FIELDS) if (prev.settings[field] !== next.settings[field]) keys.add(`settings:${field}`)
  }
  if (Boolean(prev.meta?.sample) !== Boolean(next.meta?.sample)) keys.add('meta:sample')
  return [...keys]
}

/** Which month each of the given transactions sat in, so a move or delete also clears that spot. */
export function txnMonths(state, keys) {
  const months = new Map()
  const wanted = new Set(keys.filter((key) => key.startsWith('txn:')))
  if (!wanted.size) return months
  for (const txn of state.transactions) {
    const key = `txn:${txn.id}`
    const month = monthDoc(txn)
    if (month && wanted.has(key)) months.set(key, month)
  }
  return months
}

/**
 * Decodes the documents of a book (a Map of document id to data).
 * Returns {status: 'missing'} when there is no book yet, {status: 'newer'} when it was written by a
 * newer version of the app, or {status: 'ok', state, flat, pos, loc}: `pos` holds each entity's
 * stored position and `loc` the month documents each transaction was found in.
 */
export function readBook(docs) {
  const core = docs.get(CORE)
  if (!isObject(core) || typeof core.version !== 'number') return { status: 'missing' }
  if (core.version > SCHEMA_VERSION) return { status: 'newer' }

  const pos = new Map()
  const raw = {
    settings: isObject(core.settings) ? core.settings : {},
    meta: isObject(core.meta) ? core.meta : {},
    budgets: {},
  }
  if (isObject(core.budgets)) {
    for (const [name, amount] of Object.entries(core.budgets)) raw.budgets[unesc(name)] = amount
  }
  for (const list of LISTS) {
    const kind = KIND_OF[list]
    const entries = isObject(core[list])
      ? Object.entries(core[list])
          .filter(([, value]) => isObject(value))
          .map(([name, value]) => ({ id: unesc(name), value }))
      : []
    entries.sort((a, b) => {
      const pa = posValue(a.value.pos)
      const pb = posValue(b.value.pos)
      return pa < pb ? -1 : pa > pb ? 1 : compareIds(a.id, b.id)
    })
    raw[list] = entries.map(({ id, value }) => {
      if (Number.isFinite(value.pos)) pos.set(`${kind}:${id}`, value.pos)
      return { ...value, id }
    })
  }

  // A transaction normally lives in the month of its date. If an interrupted move left a copy
  // elsewhere, the copy in the right month wins and `loc` remembers the stray one for clean-up.
  const loc = new Map()
  const best = new Map()
  const months = [...docs.keys()].filter((id) => MONTH_DOC.test(id)).sort()
  for (const month of months) {
    const items = docs.get(month)?.items
    if (!isObject(items)) continue
    for (const [name, value] of Object.entries(items)) {
      if (!isObject(value)) continue
      const id = unesc(name)
      const key = `txn:${id}`
      if (!loc.has(key)) loc.set(key, new Set())
      loc.get(key).add(month)
      const canonical = typeof value.date === 'string' && value.date.slice(0, 7) === month
      const current = best.get(id)
      if (!current || canonical || !current.canonical) best.set(id, { txn: { ...value, id }, canonical })
    }
  }
  raw.transactions = [...best.values()].map((entry) => entry.txn)

  const state = normalizeState(raw)
  state.transactions.sort((a, b) => a.createdAt - b.createdAt || compareIds(a.id, b.id))
  return { status: 'ok', state, flat: flatten(state), pos, loc }
}

function sameItems(a, b) {
  return a.length === b.length && a.every((item, index) => item === b[index])
}

function rebuildList(items, kind, out, pos) {
  const result = []
  const seen = new Set()
  for (const item of items) {
    const key = `${kind}:${item.id}`
    if (seen.has(key) || !out.has(key)) continue
    seen.add(key)
    result.push(out.get(key))
  }
  for (const [key, value] of out) {
    if (seen.has(key) || splitKey(key)[0] !== kind) continue
    seen.add(key)
    result.push(value)
  }
  if (pos) {
    // Stored positions decide the order; entries without one (not yet saved) stay at the end.
    const ranked = result.map((item, index) => ({ item, index, at: posValue(pos.get(`${kind}:${item.id}`)) }))
    ranked.sort((a, b) => {
      if (a.at !== b.at) return a.at < b.at ? -1 : 1
      if (a.at !== MAX && a.item.id !== b.item.id) return compareIds(a.item.id, b.item.id)
      return a.index - b.index
    })
    for (let i = 0; i < ranked.length; i += 1) result[i] = ranked[i].item
  }
  return sameItems(result, items) ? items : result
}

function buildState(local, out, pos) {
  const budgets = {}
  const settings = { ...local.settings }
  let sample = Boolean(local.meta?.sample)
  for (const [key, value] of out) {
    const [kind, rest] = splitKey(key)
    if (kind === 'budget') budgets[rest] = value
    else if (kind === 'settings' && SETTINGS_FIELDS.includes(rest)) settings[rest] = value
    else if (key === 'meta:sample') sample = Boolean(value)
  }
  return {
    version: SCHEMA_VERSION,
    settings: shallowEqual(settings, local.settings) ? local.settings : settings,
    accounts: rebuildList(local.accounts, 'account', out, pos),
    transactions: rebuildList(local.transactions, 'txn', out, null),
    loans: rebuildList(local.loans, 'loan', out, pos),
    people: rebuildList(local.people, 'person', out, pos),
    budgets: shallowEqual(budgets, local.budgets) ? local.budgets : budgets,
    goals: rebuildList(local.goals, 'goal', out, pos),
    meta: sample === Boolean(local.meta?.sample) ? local.meta : { sample },
  }
}

/**
 * Folds a decoded cloud book into the local one. Keys in `pending` (local edits that have not
 * reached the cloud yet) keep their local value; every other key follows the cloud. Returns
 * `local` itself when nothing changes, and reuses unchanged objects so React skips them.
 */
export function mergeRemote(local, remote, pending, pos) {
  const mine = flatten(local)
  const theirs = remote.flat
  const out = new Map()
  let differs = false
  for (const [key, value] of mine) {
    if (pending.has(key)) {
      out.set(key, value)
    } else if (theirs.has(key)) {
      const other = theirs.get(key)
      if (other === value || shallowEqual(other, value)) out.set(key, value)
      else {
        out.set(key, other)
        differs = true
      }
    } else {
      differs = true
    }
  }
  for (const [key, value] of theirs) {
    if (mine.has(key) || pending.has(key)) continue
    out.set(key, value)
    differs = true
  }
  return differs ? buildState(local, out, pos) : local
}

function coreDoc(state) {
  const doc = {
    version: SCHEMA_VERSION,
    settings: {
      name: state.settings.name ?? '',
      pinHash: state.settings.pinHash ?? null,
      onboarded: Boolean(state.settings.onboarded),
    },
    meta: { sample: Boolean(state.meta?.sample) },
    budgets: {},
  }
  for (const [category, amount] of Object.entries(state.budgets)) doc.budgets[esc(category)] = amount
  for (const list of LISTS) {
    doc[list] = {}
    state[list].forEach((item, index) => {
      doc[list][esc(item.id)] = { ...omitId(item), pos: index }
    })
  }
  return doc
}

/**
 * Writes that replace the whole cloud book with `state`. Month documents that would be left
 * holding stale entries are emptied, and the core document goes last so a half-finished upload
 * still reads as "no book yet".
 */
export function uploadOps(state, existingDocIds = []) {
  const months = new Map()
  for (const txn of state.transactions) {
    const month = monthDoc(txn)
    if (!month) continue
    if (!months.has(month)) months.set(month, {})
    months.get(month)[esc(txn.id)] = omitId(txn)
  }
  const ops = [...months.keys()].sort().map((month) => ({ type: 'replace', doc: month, data: { items: months.get(month) } }))
  for (const id of [...existingDocIds].sort()) {
    if (MONTH_DOC.test(id) && !months.has(id)) ops.push({ type: 'replace', doc: id, data: { items: {} } })
  }
  ops.push({ type: 'replace', doc: CORE, data: coreDoc(state) })
  return ops
}

/**
 * Field-level writes that bring the cloud in line with `state` for the given keys: one merge per
 * touched document. `loc` says where each transaction sits in the cloud today and `pos` holds the
 * known entity positions. Also returns where each transaction ends up (`placed`) and the positions
 * handed to new entities (`posUpdates`).
 */
export function pushOps(keys, state, { loc = new Map(), pos = new Map() } = {}) {
  const flat = flatten(state)
  const docs = new Map()
  const placed = new Map()
  const posUpdates = new Map()
  const write = (doc, field) => {
    if (!docs.has(doc)) docs.set(doc, [])
    docs.get(doc).push(field)
  }
  const nextPos = (kind) => {
    let max = -1
    for (const known of [pos, posUpdates]) {
      for (const [key, value] of known) if (key.startsWith(`${kind}:`) && Number.isFinite(value) && value > max) max = value
    }
    return Math.floor(max) + 1
  }

  for (const key of keys) {
    const [kind, rest] = splitKey(key)
    const value = flat.get(key)
    if (kind === 'txn') {
      const path = ['items', esc(rest)]
      const target = value ? monthDoc(value) : null
      if (target) write(target, { path, value: omitId(value) })
      for (const month of loc.get(key) || []) if (month !== target) write(month, { path, delete: true })
      placed.set(key, target)
    } else if (LIST_OF[kind]) {
      const path = [LIST_OF[kind], esc(rest)]
      if (value) {
        let at = pos.get(key)
        if (!Number.isFinite(at)) {
          at = nextPos(kind)
          posUpdates.set(key, at)
        }
        write(CORE, { path, value: { ...omitId(value), pos: at } })
      } else {
        write(CORE, { path, delete: true })
      }
    } else if (kind === 'budget') {
      const path = ['budgets', esc(rest)]
      if (flat.has(key)) write(CORE, { path, value })
      else write(CORE, { path, delete: true })
    } else if (kind === 'settings' && SETTINGS_FIELDS.includes(rest)) {
      write(CORE, { path: ['settings', rest], value: value ?? null })
    } else if (key === 'meta:sample') {
      write(CORE, { path: ['meta', 'sample'], value: Boolean(value) })
    }
  }

  const ops = [...docs].map(([doc, fields]) => ({ type: 'merge', doc, fields }))
  return { ops, placed, posUpdates }
}

/** Splits writes into batches that stay inside Firestore's per-commit limits, keeping their order. */
export function chunkOps(ops, { maxOps = 450, maxChars = 3_000_000 } = {}) {
  const chunks = []
  let current = []
  let chars = 0
  for (const op of ops) {
    const size = JSON.stringify(op).length
    if (current.length && (current.length >= maxOps || chars + size > maxChars)) {
      chunks.push(current)
      current = []
      chars = 0
    }
    current.push(op)
    chars += size
  }
  if (current.length) chunks.push(current)
  return chunks
}
