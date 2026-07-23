import { defineConfig } from '@playwright/test'

// Dedicated config for regenerating docs/screenshots/*.png from the running
// demo. Deliberately separate from playwright.config.ts (testDir: './e2e')
// so `npm run test:e2e` never discovers, runs, or is slowed by this spec,
// and a normal gate run never dirties docs/screenshots/ or git status.
// Reuses the same e2e webServer (port 3100, mock mode) and the same
// global-setup (wipes ./data/e2e.db) so captures start from a clean db.
export default defineConfig({
  testDir: './e2e-capture',
  globalSetup: './e2e/global-setup.ts',
  timeout: 60000,
  use: { baseURL: 'http://127.0.0.1:3100' },
  webServer: {
    command: 'npm run dev:e2e',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: true,
    timeout: 180000,
  },
})
