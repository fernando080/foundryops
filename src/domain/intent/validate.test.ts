import { describe, it, expect } from 'vitest'
import { validateIntent } from './validate'
import type { RawExtractedIntent } from '@/domain/schemas'
const raw = (o: Partial<RawExtractedIntent>): RawExtractedIntent => ({ experimentType: 'affinity', method: 'bli',
  targetQuery: 'EGFR', requestedCount: 8, concentrations: [1e-9], replicates: 2, budget: null, fields: [], ambiguities: [], ...o })
describe('validateIntent', () => {
  it('blocks unsupported experiment types deterministically', () => {
    const r = validateIntent(raw({ experimentType: 'screening', method: 'elisa' }))
    expect(r.ok).toBe(false); if (!r.ok) expect(r.finding.code).toBe('UNSUPPORTED_EXPERIMENT_TYPE')
  })
  it('applies assay defaults when concentrations/replicates are null and sets policy approvalRequired', () => {
    const r = validateIntent(raw({ concentrations: null, replicates: null }))
    expect(r.ok).toBe(true); if (r.ok) { expect(r.intent.assayDefaultsApplied).toBe(true); expect(r.intent.approvalRequired).toBe(true); expect(r.intent.replicates).toBe(3) }
  })
})
