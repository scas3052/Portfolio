import { useSyncExternalStore } from 'react'
import {
  LuChartPie,
  LuHandshake,
  LuHistory,
  LuLandmark,
  LuLayoutGrid,
  LuSettings,
  LuTarget,
  LuWallet,
} from 'react-icons/lu'

export const VIEWS = [
  { id: 'overview', label: 'Overview', short: 'Home', icon: LuLayoutGrid, key: '1', tone: 'lime', month: true },
  { id: 'activity', label: 'Activity', short: 'Activity', icon: LuHistory, key: '2', tone: 'sky', month: true },
  { id: 'spending', label: 'Spending', short: 'Spending', icon: LuChartPie, key: '3', tone: 'peach', month: true },
  { id: 'accounts', label: 'Accounts', short: 'Accounts', icon: LuWallet, key: '4', tone: 'butter' },
  { id: 'emis', label: 'EMIs & loans', short: 'EMIs', icon: LuLandmark, key: '5', tone: 'coral' },
  { id: 'people', label: 'Lend & owe', short: 'People', icon: LuHandshake, key: '6', tone: 'mint' },
  { id: 'plan', label: 'Budgets & goals', short: 'Plan', icon: LuTarget, key: '7', tone: 'lilac', month: true },
  { id: 'settings', label: 'Settings', short: 'Settings', icon: LuSettings, key: '8', tone: 'gray' },
]

const INDEX = new Map(VIEWS.map((view, i) => [view.id, i]))
const SERVER_SNAPSHOT = { hash: '', view: 'overview', params: {}, direction: 0 }

export function viewMeta(id) {
  return VIEWS[INDEX.get(id) ?? 0]
}

function parseHash(hash) {
  const raw = hash.replace(/^#\/?/, '')
  const [path, query = ''] = raw.split('?')
  return {
    view: INDEX.has(path) ? path : 'overview',
    params: Object.fromEntries(new URLSearchParams(query)),
  }
}

let snapshot = null

function getSnapshot() {
  const hash = window.location.hash
  if (!snapshot || snapshot.hash !== hash) {
    const next = parseHash(hash)
    const from = snapshot ? INDEX.get(snapshot.view) : INDEX.get(next.view)
    const to = INDEX.get(next.view)
    snapshot = { hash, ...next, direction: to === from ? 0 : to > from ? 1 : -1 }
  }
  return snapshot
}

function subscribe(callback) {
  window.addEventListener('hashchange', callback)
  return () => window.removeEventListener('hashchange', callback)
}

export function useHashRoute() {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT)
}

export function hrefFor(view, params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  ).toString()
  return `#/${view}${query ? `?${query}` : ''}`
}

export function navigate(view, params) {
  const next = hrefFor(view, params)
  if (window.location.hash !== next) window.location.hash = next
}
