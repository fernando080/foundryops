import { rmSync } from 'node:fs'

// Full e2e DB isolation: the e2e webServer runs against ./data/e2e.db (see
// package.json "dev:e2e" + playwright.config.ts). Deleting it (and its WAL/SHM/
// journal siblings) before every run guarantees the demo flow starts from a
// clean, empty database regardless of what a previous run left behind.
export default function globalSetup(): void {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    try {
      rmSync(`./data/e2e.db${suffix}`)
    } catch {
      // File may not exist yet — nothing to clean up.
    }
  }
}
