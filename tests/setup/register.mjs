// The app's source uses Vite-style extensionless imports ('../lib/dates').
// This hook lets plain Node resolve them by retrying with `.js`.
import { registerHooks } from 'node:module'

const RELATIVE = /^\.{1,2}\//
const HAS_EXTENSION = /\.[cm]?[jt]sx?$|\.json$/

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context)
    } catch (err) {
      const retry = (err?.code === 'ERR_MODULE_NOT_FOUND' || err?.code === 'ERR_UNSUPPORTED_DIR_IMPORT') && RELATIVE.test(specifier) && !HAS_EXTENSION.test(specifier)
      if (!retry) throw err
      try {
        return nextResolve(`${specifier}.js`, context)
      } catch {
        return nextResolve(`${specifier}/index.js`, context)
      }
    }
  },
})
