// Where Gullak is running: inside the Android app (Capacitor's native bridge is present) or in a browser,
// including the app's browser preview (npm run dev:app).
export const isNativeApp = () => Boolean(globalThis.Capacitor?.isNativePlatform?.())
