import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const outputDir = process.env.AUDIT_OUTPUT_DIR ?? '/tmp/foundryops-audit'
const baseURL = process.env.AUDIT_BASE_URL ?? 'http://127.0.0.1:3100'
const requestText =
  'Prepare a BLI affinity characterization against EGFR using the attached sequences, six-point concentration series in triplicate. Keep it below the customer budget of $8,000, flag anything suspicious, and do not submit without my approval.'

await mkdir(outputDir, { recursive: true })
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })

try {
  await page.goto(baseURL, { waitUntil: 'networkidle' })
  await page.screenshot({ path: join(outputDir, '01-workspace.png'), fullPage: true })

  await page.getByTestId('request-input').fill(requestText)
  await page.getByTestId('fasta-input').setInputFiles('fixtures/demo.fasta')
  await page.getByTestId('run-intake').click()
  await page.getByTestId('target-option-tgt_egfr_human_ecd').waitFor()
  await page.screenshot({ path: join(outputDir, '02-intake-preflight-budget.png'), fullPage: true })

  await page.getByTestId('target-option-tgt_egfr_human_ecd').click()
  await page.getByTestId('candidate-toggle-AC-7').click()
  await page.getByTestId('candidate-toggle-AC-8').click()
  await page.getByTestId('request-approval').click()
  await page.getByTestId('approval-stage').waitFor()
  await page.getByTestId('approval-stage').screenshot({ path: join(outputDir, '03-approval.png') })

  await page.getByTestId('edit-replicates').fill('2')
  await page.getByTestId('approval-invalidated').waitFor()
  await page.getByTestId('approval-stage').screenshot({ path: join(outputDir, '04-approval-invalidated.png') })

  await page.getByTestId('reissue-approval').click()
  await page.getByTestId('approval-invalidated').waitFor({ state: 'hidden' })
  await page.getByTestId('create-draft').click()
  await page.getByTestId('draft-created').waitFor()
  await page.getByTestId('goto-timeline').click()
  await page.getByTestId('replay-valid').click()
  await page.getByTestId('replay-duplicate').click()
  await page.getByTestId('replay-invalid').click()
  await page.getByTestId('refresh-status').click()
  await page.getByTestId('open-audit').click()
  await page.getByTestId('audit-drawer').waitFor()
  await page.getByTestId('timeline-stage').screenshot({ path: join(outputDir, '05-timeline-audit.png') })
  await page.getByTestId('close-audit').click()

  await page.getByTestId('goto-results').click()
  await page.getByTestId('candidate-grid').waitFor()
  await page.getByTestId('results-stage').screenshot({ path: join(outputDir, '06-results.png') })

  await page.getByTestId('generate-draft').click()
  await page.getByTestId('evidence-chip').first().waitFor()
  await page.getByTestId('results-stage').screenshot({ path: join(outputDir, '07-evidence-backed-draft.png') })
} finally {
  await browser.close()
}
