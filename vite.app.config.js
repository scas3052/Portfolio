import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import agentRelay from './server/viteAgentPlugin.js'

const here = (path) => fileURLToPath(new URL(path, import.meta.url))

// Gullak on its own, for the Android app: `npm run build:app` writes dist-app/, which Capacitor wraps.
// `npm run dev:app` serves the same app in a browser (with sample captured payments, since there is no
// phone), and runs Munshi's relay like `npm run dev` does. The portfolio and its build are untouched.
export default defineConfig({
  root: here('./app'),
  // .env.local lives at the project root, next to this file.
  envDir: here('.'),
  publicDir: false,
  base: './',
  plugins: [react(), agentRelay()],
  server: { port: 5174 },
  preview: { port: 4174 },
  build: {
    outDir: here('./dist-app'),
    emptyOutDir: true,
    // One bundle (~820 kB) read from the phone's own storage, not the network, so its size isn't a
    // concern. Firebase (cloud sync) still splits off and loads only once sync is used.
    chunkSizeWarningLimit: 1000,
  },
})
