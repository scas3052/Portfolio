#!/usr/bin/env node
// Publishes a signed Gullak APK to Vercel Blob, where /api/app (api/app.js) finds it for the website's
// "Get the Android app" button and the app's update check. Run by the "Android app" workflow:
//
//   BLOB_READ_WRITE_TOKEN=… node scripts/upload-apk.mjs app-release.apk --version-name 1.0.12 --version-code 12
//
// Writes gullak/apk/gullak-<version>-<code>-<hash>.apk, then gullak/latest.json pointing at it, and keeps
// only the newest few APKs.
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { parseArgs } from 'node:util'
import { del, list, put } from '@vercel/blob'
import { APK_PREFIX, LATEST_PATH } from '../server/appRelease.js'

const KEEP = 5

function fail(message) {
  console.error(`upload-apk: ${message}`)
  process.exit(1)
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    'version-name': { type: 'string' },
    'version-code': { type: 'string' },
  },
})
const [file] = positionals
const versionName = String(values['version-name'] || '').trim()
const versionCode = Number(values['version-code'])
const token = process.env.BLOB_READ_WRITE_TOKEN

if (!file) fail('give the APK to publish: node scripts/upload-apk.mjs <file.apk> --version-name 1.0.0 --version-code 1')
if (!/^[0-9A-Za-z][0-9A-Za-z.+-]*$/.test(versionName)) fail(`--version-name "${versionName}" isn't a version like 1.0.12.`)
if (!Number.isInteger(versionCode) || versionCode < 1) fail('--version-code must be a whole number from 1 up.')
if (!token) fail('BLOB_READ_WRITE_TOKEN is not set (GitHub → Settings → Secrets and variables → Actions).')

const body = await readFile(file)
if (body.length < 1024 || body[0] !== 0x50 || body[1] !== 0x4b) fail(`${basename(file)} doesn't look like an APK.`)
const sha256 = createHash('sha256').update(body).digest('hex')

// The hash in the name gives every build its own URL, so CDN caches never hand out a stale file.
const pathname = `${APK_PREFIX}gullak-${versionName}-${versionCode}-${sha256.slice(0, 8)}.apk`
const apk = await put(pathname, body, {
  access: 'public',
  addRandomSuffix: false,
  allowOverwrite: true,
  contentType: 'application/vnd.android.package-archive',
  token,
})
console.log(`Uploaded ${pathname} (${(body.length / 1024 / 1024).toFixed(1)} MB)`)

const latest = {
  versionName,
  versionCode,
  url: apk.url,
  downloadUrl: apk.downloadUrl || apk.url,
  sha256,
  size: body.length,
  publishedAt: new Date().toISOString(),
}
await put(LATEST_PATH, `${JSON.stringify(latest, null, 2)}\n`, {
  access: 'public',
  addRandomSuffix: false,
  allowOverwrite: true,
  contentType: 'application/json',
  cacheControlMaxAge: 60,
  token,
})
console.log(`Published Gullak ${versionName} (${versionCode}) · sha256 ${sha256}`)

// Keep the newest few builds (someone may be mid-download); remove the rest.
const { blobs } = await list({ prefix: APK_PREFIX, limit: 1000, token })
const old = blobs
  .filter((blob) => blob.pathname !== pathname)
  .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
  .slice(KEEP - 1)
if (old.length) {
  await del(
    old.map((blob) => blob.url),
    { token },
  )
  console.log(`Removed ${old.length} older build${old.length === 1 ? '' : 's'}.`)
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFile } = await import('node:fs/promises')
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    [
      `### Published Gullak ${versionName} (${versionCode})`,
      '',
      `- APK: ${apk.url}`,
      `- Size: ${(body.length / 1024 / 1024).toFixed(1)} MB`,
      `- SHA-256: \`${sha256}\``,
      '',
    ].join('\n'),
  )
}
