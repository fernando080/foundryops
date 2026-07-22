import { defineConfig } from '@playwright/test'

// Port 3100, not 3000: on this dev machine, 127.0.0.1:3000 is permanently
// bound by an unrelated project's long-running Docker container
// (bookcraifter-staging-local-web-1). reuseExistingServer would otherwise
// silently point every test at that other app instead of failing loudly.
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 60000,
  use: { baseURL: 'http://127.0.0.1:3100' },
  webServer: {
    command: 'npm run dev:e2e',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 180000,
  },
})
