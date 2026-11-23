// Vercel Function: /api/app. The newest Gullak Android build, for the website's "Get the Android app" button
// and the app's update check (see server/appRelease.js). Needs a public Vercel Blob store connected to this
// project (Storage → Blob → Connect), which sets BLOB_READ_WRITE_TOKEN; the "Android app" GitHub workflow
// publishes builds into it.
import { head } from '@vercel/blob'
import { createAppRelease } from '../server/appRelease.js'

const release = createAppRelease({ head })

export function GET(request) {
  return release(request)
}

export function OPTIONS(request) {
  return release(request)
}
