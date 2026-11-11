// Firebase web config, filled in at build time from VITE_FIREBASE_* variables (see .env.example).
// These values only identify the project; the Firestore rules decide who may read or write.
// Keep the plain `import.meta.env.X` form so Vite can replace each one statically.
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
}

/** Cloud sync only shows up when the build was given a Firebase project. */
export const cloudAvailable = Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId)
