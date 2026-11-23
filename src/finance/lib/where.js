// Gullak runs as the website and as the Android app, whose page (app/index.html) marks <html data-gullak-app>.
// Text that says where the book is kept reads "this browser" on the site and "this phone" in the app.
export const inGullakApp = () =>
  typeof document !== 'undefined' && Boolean(document.documentElement?.hasAttribute('data-gullak-app'))

/** Where the book is stored on this device: "this browser" or "this phone". */
export const thisDevice = () => (inGullakApp() ? 'this phone' : 'this browser')

/** The same with its preposition: "in this browser" or "on this phone". */
export const onThisDevice = () => (inGullakApp() ? 'on this phone' : 'in this browser')
