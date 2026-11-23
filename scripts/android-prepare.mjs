// Builds the android/ project: Capacitor's own template (so Gradle, the wrapper and the plugin wiring always
// match the installed Capacitor), with Gullak's native code and resources from native/android/ copied on top.
// android/ is generated, so it isn't committed. Run `npm run build:app` first.
//
//   npm run android:prepare            create android/ if needed, apply native/android, cap sync
//   npm run android:prepare -- --fresh delete android/ first and start again
import { execSync } from 'node:child_process'
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const android = join(root, 'android')
const overlay = join(root, 'native', 'android')

const run = (command) => {
  console.log(`\n> ${command}`)
  execSync(command, { cwd: root, stdio: 'inherit', shell: true })
}

if (!existsSync(join(root, 'dist-app', 'index.html'))) {
  console.error('dist-app/ is missing. Run `npm run build:app` first.')
  process.exit(1)
}

if (process.argv.includes('--fresh') && existsSync(android)) {
  console.log('Removing android/ to start fresh')
  rmSync(android, { recursive: true, force: true })
}

if (!existsSync(android)) run('npx cap add android')

console.log('\nCopying native/android over the generated project')
cpSync(overlay, android, { recursive: true, force: true })

// The template's splash images aren't used: Gullak's launch screen is a vector on the paper colour.
const res = join(android, 'app', 'src', 'main', 'res')
for (const dir of readdirSync(res)) {
  if (!dir.startsWith('drawable')) continue
  const splash = join(res, dir, 'splash.png')
  if (existsSync(splash)) rmSync(splash)
}

run('npx cap sync android')
console.log('\nandroid/ is ready. Build with: cd android && ./gradlew assembleRelease (or assembleDebug)')
