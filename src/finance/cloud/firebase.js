// Everything that touches the Firebase SDK. It is only ever loaded with import('./firebase'), so
// the SDK stays out of the main bundle and is fetched once someone turns sync on.
import { getApps, initializeApp } from 'firebase/app'
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  getAuth,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  signInWithCredential,
  signInWithPopup,
  signOut as signOutOfAuth,
} from 'firebase/auth'
import {
  collection,
  deleteField,
  doc,
  FieldPath,
  getDocsFromServer,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  onSnapshot,
  terminate as terminateFirestore,
  waitForPendingWrites,
  writeBatch,
} from 'firebase/firestore'
import { chunkOps } from './layout'

const APP_NAME = 'gullak'

let connection = null

function setIn(target, path, value) {
  let node = target
  for (const name of path.slice(0, -1)) {
    if (!node[name] || typeof node[name] !== 'object') node[name] = {}
    node = node[name]
  }
  node[path[path.length - 1]] = value
}

const toMap = (docs) => new Map(docs.map((snap) => [snap.id, snap.data()]))

/**
 * Sets up the Firebase app, auth and (lazily) Firestore once, and returns what sync needs.
 * `nativeAuth` (Android app only) supplies Google ID tokens from the phone's account picker, since an
 * app's web view can't open Google's sign-in popup.
 */
export function connect(config, { nativeAuth = null } = {}) {
  if (connection) return connection

  const app = getApps().find((item) => item.name === APP_NAME) || initializeApp(config, APP_NAME)
  let auth
  try {
    auth = initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
      ...(nativeAuth ? {} : { popupRedirectResolver: browserPopupRedirectResolver }),
    })
  } catch {
    // Already set up (a hot reload during development).
    auth = getAuth(app)
  }
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  const googleCredential = () => nativeAuth.googleIdToken().then((idToken) => GoogleAuthProvider.credential(idToken))

  // The book already lives in localStorage, so Firestore keeps only a small in-memory cache.
  let db = null
  const firestore = () => {
    if (!db) {
      try {
        db = initializeFirestore(app, { localCache: memoryLocalCache(), ignoreUndefinedProperties: true })
      } catch {
        db = getFirestore(app)
      }
    }
    return db
  }

  /** The sync adapter for one user's book (see engine.js). */
  function book(uid) {
    const store = firestore()
    const shelf = collection(store, 'users', uid, 'book')
    return {
      listen(onSnap, onError) {
        return onSnapshot(
          shelf,
          { includeMetadataChanges: true },
          (snap) => {
            onSnap({
              fromCache: snap.metadata.fromCache,
              // Metadata-only updates (a write being confirmed, say) are left out here.
              changed: snap.docChanges().length > 0,
              docs: () => toMap(snap.docs),
            })
          },
          onError,
        )
      },
      async commit(ops, onChunk) {
        for (const chunk of chunkOps(ops)) {
          const batch = writeBatch(store)
          for (const op of chunk) {
            const ref = doc(shelf, op.doc)
            if (op.type === 'replace') {
              batch.set(ref, op.data)
            } else {
              const data = {}
              for (const field of op.fields) setIn(data, field.path, field.delete ? deleteField() : field.value)
              batch.set(ref, data, { mergeFields: op.fields.map((field) => new FieldPath(...field.path)) })
            }
          }
          onChunk?.()
          await batch.commit()
        }
      },
      async fetchAll() {
        const snap = await getDocsFromServer(shelf)
        return toMap(snap.docs)
      },
    }
  }

  connection = {
    onUser: (callback) => onAuthStateChanged(auth, callback),
    currentUser: () => auth.currentUser,
    authReady: () => auth.authStateReady(),
    // On the web both open a popup, so call them straight from a click handler.
    signIn: () => {
      if (nativeAuth) return googleCredential().then((credential) => signInWithCredential(auth, credential)).then((result) => result.user)
      return signInWithPopup(auth, provider).then((result) => result.user)
    },
    reauth: () => {
      if (!auth.currentUser) return Promise.reject(Object.assign(new Error('Not signed in'), { code: 'auth/no-current-user' }))
      const user = auth.currentUser
      if (nativeAuth) return googleCredential().then((credential) => reauthenticateWithCredential(user, credential)).then((result) => result.user)
      return reauthenticateWithPopup(user, provider).then((result) => result.user)
    },
    // Signing out of the app also forgets the Google account it picked, so the next sign-in asks again.
    signOut: () => signOutOfAuth(auth).finally(() => nativeAuth?.signOut()),
    book,
    /** Resolves once queued writes reach the server; never resolves while offline. */
    waitForWrites: () => (db ? waitForPendingWrites(db) : Promise.resolve()),
    /** Shuts Firestore down (dropping its listeners and cache); it starts afresh on next use. */
    async terminate() {
      if (!db) return
      const current = db
      db = null
      await terminateFirestore(current)
    },
  }
  return connection
}
