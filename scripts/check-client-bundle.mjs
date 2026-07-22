#!/usr/bin/env node
// Fails the build if secret-shaped strings ended up in the client bundle.
// Server-only secrets (Gemini API keys, the Foundry token) must never be
// reachable from code shipped to the browser.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'

const BUNDLE_DIR = join(process.cwd(), '.next', 'static')

// Patterns that must never appear in client-bundled JS/CSS/source maps.
const FORBIDDEN_PATTERNS = [
  { name: 'GEMINI_API_KEY', pattern: /GEMINI_API_KEY/ },
  { name: 'FOUNDRY_TOKEN', pattern: /FOUNDRY_TOKEN/ },
  { name: 'Google API key literal (AIza…)', pattern: /AIza[0-9A-Za-z_-]{10,}/ },
]

// .next/static also contains binary assets (fonts, images, media) that must
// not be decoded as utf8 — only scan the text-like file types secrets could
// plausibly end up in.
const SCANNABLE_EXTENSIONS = new Set(['.js', '.mjs', '.css', '.html', '.json', '.txt'])

function collectFiles(dir) {
  const results = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stats = statSync(full)
    if (stats.isDirectory()) {
      results.push(...collectFiles(full))
    } else {
      results.push(full)
    }
  }
  return results
}

let staticFiles
try {
  staticFiles = collectFiles(BUNDLE_DIR)
} catch (err) {
  console.error(
    `check-client-bundle: could not read "${BUNDLE_DIR}" (${err.code ?? err.message}).\n` +
      'Run "npm run build" before this check so the client bundle exists.',
  )
  process.exit(1)
}

const scannedFiles = staticFiles.filter((file) => SCANNABLE_EXTENSIONS.has(extname(file)))

let hits = 0

for (const file of scannedFiles) {
  const contents = readFileSync(file, 'utf8')
  for (const { name, pattern } of FORBIDDEN_PATTERNS) {
    if (pattern.test(contents)) {
      hits += 1
      console.error(`check-client-bundle: found "${name}" in ${file}`)
    }
  }
}

if (hits > 0) {
  console.error(`check-client-bundle: FAILED (${hits} hit${hits === 1 ? '' : 's'}).`)
  process.exit(1)
}

console.log(`check-client-bundle: OK (${scannedFiles.length} files scanned, 0 hits).`)
