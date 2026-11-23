import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'dist-app', 'android']),
  {
    files: ['**/*.{js,jsx,mjs}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    // Serverless functions, the Vite configs and dev middleware, build scripts and the Node test suite.
    files: [
      'api/**/*.js',
      'netlify/**/*.{js,mjs}',
      'server/**/*.js',
      'scripts/**/*.{js,mjs}',
      'tests/**/*.{js,mjs}',
      'vite.config.js',
      'vite.app.config.js',
    ],
    languageOptions: { globals: globals.node },
  },
])
