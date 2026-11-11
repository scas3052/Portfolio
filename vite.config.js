import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import agentRelay from './server/viteAgentPlugin.js'
import { FINANCE_ENABLED } from './src/config.js'

const page = (path) => fileURLToPath(new URL(path, import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the build works on any static host or sub-path (e.g. GitHub Pages).
  base: './',
  // agentRelay serves Gullak's assistant endpoint (/api/agent) in dev and preview.
  plugins: [react(), ...(FINANCE_ENABLED ? [agentRelay()] : [])],
  build: {
    rolldownOptions: {
      // Two pages: the portfolio, and Gullak (personal finance) at /finance/.
      input: {
        main: page('./index.html'),
        ...(FINANCE_ENABLED && { finance: page('./finance/index.html') }),
      },
    },
  },
})
