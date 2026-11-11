// What to do when a device links to the cloud for the first time.
import { SCHEMA_VERSION } from '../lib/schema'

/** True when the book holds something the user made (the sample book does not count). */
export function hasUserData(state) {
  if (!state?.settings?.onboarded || state.meta?.sample) return false
  return (
    state.transactions.length > 0 ||
    state.accounts.length > 0 ||
    state.loans.length > 0 ||
    state.people.length > 0 ||
    state.goals.length > 0 ||
    Object.keys(state.budgets).length > 0
  )
}

/**
 * 'upload' sends this device's book up, 'adopt' takes the cloud's, and 'ask' means both hold
 * real data and the user has to choose. 'newer' means the cloud book was saved by a newer version
 * of the app and must be left alone. `remote` is the result of readBook.
 */
export function decideLink(local, remote) {
  if (remote.status === 'newer') return 'newer'
  if (remote.status !== 'ok') return 'upload'
  const mine = hasUserData(local)
  const theirs = hasUserData(remote.state)
  if (mine && theirs) return 'ask'
  if (mine) return 'upload'
  if (remote.state.settings.onboarded) return 'adopt'
  return 'upload'
}

function unionById(mine, theirs) {
  const byId = new Map(mine.map((item) => [item.id, item]))
  for (const item of theirs) byId.set(item.id, item)
  return [...byId.values()]
}

/** Both books in one: everything from each side, and the cloud's copy where an id exists in both. */
export function mergeBooks(local, remote) {
  return {
    version: SCHEMA_VERSION,
    settings: {
      name: remote.settings.name || local.settings.name,
      privacy: local.settings.privacy,
      pinHash: remote.settings.pinHash ?? local.settings.pinHash,
      onboarded: true,
    },
    accounts: unionById(local.accounts, remote.accounts),
    transactions: unionById(local.transactions, remote.transactions),
    loans: unionById(local.loans, remote.loans),
    people: unionById(local.people, remote.people),
    budgets: { ...local.budgets, ...remote.budgets },
    goals: unionById(local.goals, remote.goals),
    meta: { sample: false },
  }
}
