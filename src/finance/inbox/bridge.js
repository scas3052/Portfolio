import { isNativeApp } from '../app/platform'

let loading = null

/**
 * `{plugin}`: the native SpendCapture plugin on the phone, a stand-in with sample payments in the browser
 * preview (`npm run dev:app`), or null anywhere else. Loaded once, on first use.
 *
 * The plugin comes wrapped because a Capacitor plugin answers every property, `then` included, so a promise
 * that resolved to the plugin itself would treat it as another promise and never settle.
 */
export function loadCapture() {
  if (!loading) {
    if (isNativeApp()) {
      loading = import('@capacitor/core').then(({ registerPlugin }) => ({ plugin: registerPlugin('SpendCapture') }))
    } else if (import.meta.env.DEV) {
      loading = import('./mock').then((module) => ({ plugin: module.createMockCapture() }))
    } else {
      loading = Promise.resolve({ plugin: null })
    }
  }
  return loading
}
