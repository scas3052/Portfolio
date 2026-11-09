import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { FINANCE_ENABLED } from './src/config.js'

const page = (path) => fileURLToPath(new URL(path, import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the build works on any static host or sub-path (e.g. GitHub Pages).
  base: './',
  plugins: [react()],
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
