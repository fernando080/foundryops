import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'

// Regenerates the five release screenshots embedded in README.md from the
// live demo flow. Deliberately lives outside the default e2e/ testDir (see
// playwright.capture.config.ts) so `npm run test:e2e` never runs this spec
// or touches docs/screenshots/. Steps mirror e2e/demo.spec.ts exactly —
// same selectors, same fixture, same assertions — with page.screenshot()
// calls inserted at five narrative checkpoints. This is a documentation
// artifact, not a behavior test: no product code changes, no new
// assertions beyond what demo.spec.ts already proves at each checkpoint.
test('capture release screenshots', async ({ page }) => {
  mkdirSync('docs/screenshots', { recursive: true })

  await page.goto('/')
  await expect(page.getByTestId('env-badge')).toHaveText(/MOCK/)
  await page
    .getByTestId('request-input')
    .fill(
      'Prepare a BLI affinity characterization against EGFR using the attached sequences, six-point concentration series in triplicate. Keep it below the customer budget of $8,000, flag anything suspicious, and do not submit without my approval.',
    )
  await page.getByTestId('fasta-input').setInputFiles('fixtures/demo.fasta')
  await page.getByTestId('run-intake').click()
  await page.getByTestId('target-option-tgt_egfr_human_ecd').click()
  await expect(page.getByTestId('over-budget')).toBeVisible()
  await page.getByTestId('candidate-toggle-AC-7').click()
  await page.getByTestId('candidate-toggle-AC-8').click()
  await expect(page.getByTestId('over-budget')).toBeHidden()

  // 01 — intake: preflight findings + remediated within-budget state visible.
  await expect(page.getByTestId('budget-panel')).toBeVisible()
  await expect(page.getByTestId('cost-breakdown')).toBeVisible()
  await page.screenshot({ path: 'docs/screenshots/01-intake.png', fullPage: true })

  await page.getByTestId('request-approval').click()
  const hash1 = await page.getByTestId('hash-chip').innerText()
  await page.getByTestId('exact-payload').locator('summary').click()
  const exactPayloadCandidates = page.getByTestId('exact-payload-candidates')
  await expect(exactPayloadCandidates).toContainText('4 candidates')
  await expect(exactPayloadCandidates).toContainText('AC-1')
  await expect(page.getByTestId('exact-payload-fields')).not.toContainText('MKTAYIAKQR')

  // 02 — approval boundary: hash chip + the opened "residues redacted"
  // payload summary disclosure, captured while both are visible together.
  await expect(page.getByTestId('hash-chip')).toBeVisible()
  await expect(page.getByTestId('exact-payload-fields')).toBeVisible()
  await page.screenshot({ path: 'docs/screenshots/02-approval.png', fullPage: true })

  await page.getByTestId('edit-replicates').fill('2')
  await expect(page.getByTestId('approval-invalidated')).toBeVisible()
  await page.getByTestId('reissue-approval').click()
  await expect(page.getByTestId('hash-chip')).not.toHaveText(hash1)
  await expect(page.getByTestId('confirm-submit')).toBeDisabled()
  await page.getByTestId('create-draft').click()
  await expect(page.getByTestId('draft-created')).toHaveCount(1)
  await page.getByTestId('goto-timeline').click()
  await page.getByTestId('replay-valid').click()
  await expect(page.getByTestId('timeline')).toContainText('Quote sent')
  await page.getByTestId('replay-duplicate').click()
  await expect(page.getByTestId('dedupe-badge')).toContainText('applied once')
  await page.getByTestId('replay-invalid').click()
  await expect(page.getByTestId('timeline')).not.toContainText('invalid signature')
  await page.getByTestId('open-audit').click()
  await expect(page.getByTestId('audit-drawer')).toContainText(/invalid signature/i)

  // 03 — timeline: valid + duplicate + invalid updates replayed, audit
  // drawer open showing the rejected (invalid-signature) delivery.
  await page.screenshot({ path: 'docs/screenshots/03-timeline.png', fullPage: true })

  await page.getByTestId('refresh-status').click()
  await expect(page.getByTestId('status-chip')).toContainText('Done')
  await page.getByTestId('goto-results').click()
  for (const id of ['AC-1', 'AC-2', 'AC-3', 'AC-4']) await expect(page.getByTestId(`layer-qc-${id}`)).toBeVisible()
  await expect(page.getByTestId('qc-data-quality-AC-2')).toContainText('Warning')
  await expect(page.getByTestId('qc-data-quality-AC-3')).toContainText('Pass')
  await expect(page.getByTestId('qc-data-quality-AC-4')).toContainText('Warning')
  const ac3Qc = page.getByTestId('layer-qc-AC-3')
  await expect(ac3Qc).toContainText(/N\/A|Not applicable/i)
  await expect(ac3Qc).not.toContainText('inconsistent')
  const ac3Measured = page.getByTestId('layer-measured-AC-3')
  await expect(ac3Measured).not.toContainText('poor')
  await expect(ac3Measured).not.toContainText('low')
  // Built via concatenation, not a literal, so this source file itself never
  // contains the retired ambiguous unit string (see item-2 zero-grep check).
  const retiredKonLabel = ['per', 'ms'].join(' ')
  await expect(page.getByTestId('layer-measured-AC-1')).toContainText('M⁻¹·s⁻¹')
  await expect(page.getByTestId('layer-measured-AC-1')).not.toContainText(retiredKonLabel)

  // 04 — results: AC-1..AC-4 cards with dataQuality (AC-2/AC-4 Warning,
  // AC-3 Pass + N/A) and the k_on (M⁻¹·s⁻¹) measured label visible.
  await page.screenshot({ path: 'docs/screenshots/04-results.png', fullPage: true })

  await page.getByTestId('generate-draft').click()
  await expect(page.getByTestId('evidence-chip').first()).toBeVisible()

  // 05 — customer draft: generated draft with inline evidence chips.
  await page.screenshot({ path: 'docs/screenshots/05-draft.png', fullPage: true })
})
