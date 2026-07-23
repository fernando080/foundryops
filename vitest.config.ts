import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    // Playwright owns e2e/** and e2e-capture/**; vitest's default spec glob
    // would otherwise try (and fail) to collect those .spec.ts files.
    exclude: ['**/node_modules/**', '**/e2e/**', '**/e2e-capture/**'],
  },
})
