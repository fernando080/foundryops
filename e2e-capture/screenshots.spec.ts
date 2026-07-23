import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'

// Regenerates the five release screenshots embedded in README.md from the
// live demo flow. Deliberately lives outside the default e2e/ testDir (see
// playwright.capture.config.ts) so `npm run test:e2e` never runs this spec
// or touches docs/screenshots/. The flow mirrors e2e/demo.spec.ts — same
// selectors, same fixture — but this is a documentation artifact, not a
// behavior test: it makes no product code changes and only adds
// capture-time assertions that guarantee each PNG actually shows the state
// its README caption claims. Screenshots 01–02 are full-page (early stages,
// small); 03 is a viewport capture (its audit drawer is position:fixed, so an
// element shot cannot include it); 04–05 are focused element captures
// (results-stage / draft-stage). Every stage stacks on one page, so a
// full-page shot this late would stack all prior stages and shrink the
// subject to an unreadable sliver in the README.
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

  // Status is fetched separately (getExperimentStatus), not carried by the
  // signed update — refresh it BEFORE the capture so screenshot 03 shows Done.
  await page.getByTestId('refresh-status').click()
  await expect(page.getByTestId('status-chip')).toContainText('Done')

  // Open the audit drawer so the rejected (invalid-signature) delivery is
  // visible — it must appear ONLY here, never in the trusted timeline.
  await page.getByTestId('open-audit').click()
  await expect(page.getByTestId('audit-drawer')).toContainText(/invalid signature/i)

  // 03 — timeline: a viewport (not full-page, not element) capture. The audit
  // drawer is position:fixed to the viewport's right edge, so an element
  // screenshot of the timeline card cannot include it. Pinning the compact
  // timeline card to the top of the viewport and capturing the viewport shows
  // all four facts together — Quote sent (trusted timeline), duplicate applied
  // once, status Done, and the invalid-signature delivery inside the open
  // drawer — while still excluding the stacked prior stages a full-page shot
  // would drag in.
  const timelineStage = page.getByTestId('timeline-stage')
  await expect(timelineStage).toContainText('Quote sent')
  await expect(timelineStage.getByTestId('dedupe-badge')).toContainText('applied once')
  await expect(timelineStage.getByTestId('status-chip')).toContainText('Done')
  await expect(timelineStage.getByTestId('audit-drawer')).toContainText(/invalid signature/i)
  await timelineStage.evaluate((el) => el.scrollIntoView({ block: 'start' }))
  await page.screenshot({ path: 'docs/screenshots/03-timeline.png' })

  // Close the audit drawer immediately — it must not appear in 04 or 05.
  await page.getByTestId('close-audit').click()
  await expect(page.getByTestId('audit-drawer')).toHaveCount(0)

  await page.getByTestId('goto-results').click()
  for (const id of ['AC-1', 'AC-2', 'AC-3', 'AC-4']) await expect(page.getByTestId(`layer-qc-${id}`)).toBeVisible()
  await expect(page.getByTestId('qc-data-quality-AC-2')).toContainText('Warning')
  await expect(page.getByTestId('qc-data-quality-AC-3')).toContainText('Pass')
  await expect(page.getByTestId('qc-data-quality-AC-4')).toContainText('Warning')

  // AC-3 is a valid negative (no KD): replicate consistency AND fit quality
  // must both read exactly N/A — never a numeric value or an
  // "inconsistent"/"fail" verdict.
  const ac3Qc = page.getByTestId('layer-qc-AC-3')
  await expect(ac3Qc).toContainText('Replicate consistency')
  await expect(ac3Qc).toContainText('Fit quality')
  await expect(ac3Qc.getByText('N/A', { exact: true })).toHaveCount(2)
  await expect(ac3Qc).not.toContainText('inconsistent')
  const ac3Measured = page.getByTestId('layer-measured-AC-3')
  await expect(ac3Measured).not.toContainText('poor')
  await expect(ac3Measured).not.toContainText('low')

  // Corrected BLI units — k_on in M⁻¹·s⁻¹, never the retired ambiguous label.
  // Built via concatenation so this source file itself never contains that
  // retired unit string (see the item-2 zero-grep check).
  const retiredKonLabel = ['per', 'ms'].join(' ')
  const ac1Measured = page.getByTestId('layer-measured-AC-1')
  await expect(ac1Measured).toContainText('k_on (M⁻¹·s⁻¹)')
  await expect(ac1Measured).not.toContainText(retiredKonLabel)

  // All three bands present for a representative candidate so the
  // Measured / Deterministic QC / Model Commentary layers are all in frame.
  await expect(page.getByTestId('layer-measured-AC-1')).toBeVisible()
  await expect(page.getByTestId('layer-qc-AC-1')).toBeVisible()
  await expect(page.getByTestId('layer-commentary-AC-1')).toBeVisible()

  // 04 — results: focused on results-stage (draft not yet generated, audit
  // drawer closed) so the three-layer cards read clearly in the README.
  const resultsStage = page.getByTestId('results-stage')
  await expect(page.getByTestId('audit-drawer')).toHaveCount(0)
  await resultsStage.scrollIntoViewIfNeeded()
  await resultsStage.screenshot({ path: 'docs/screenshots/04-results.png' })

  await page.getByTestId('generate-draft').click()
  const draftStage = page.getByTestId('draft-stage')
  await expect(draftStage.getByTestId('draft-not-sent-label')).toContainText(/Not sent .* manual send only/)
  await expect(draftStage.getByTestId('draft-rendered')).toBeVisible()
  const draftChips = draftStage.getByTestId('draft-evidence-chip')
  expect(await draftChips.count()).toBeGreaterThanOrEqual(3)
  await expect(draftChips.first()).toBeVisible()

  // 05 — customer draft: focused on draft-stage showing the not-sent label,
  // the evidence-backed prose, and several inline evidence chips. The
  // provenance popover is intentionally left closed so it can neither obscure
  // the draft text nor overflow the focused element frame. The audit drawer
  // is confirmed absent here too.
  await expect(page.getByTestId('audit-drawer')).toHaveCount(0)
  await draftStage.scrollIntoViewIfNeeded()
  await draftStage.screenshot({ path: 'docs/screenshots/05-draft.png' })
})
