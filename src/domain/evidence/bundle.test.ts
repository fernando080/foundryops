import { describe, it, expect } from 'vitest'
import { buildEvidenceBundle, resolveEvidence } from './bundle'
import { classifyCandidate } from '@/domain/results/qc'
import { demoResultRecords } from '../../../fixtures/results'

const rec = demoResultRecords[0]!

describe('buildEvidenceBundle', () => {
  it('emits numeric and categorical records', () => {
    const b = buildEvidenceBundle('exp-1', [{ record: rec, qc: classifyCandidate(rec) }])
    expect(resolveEvidence(b, 'ev_AC-1_kd')).toMatchObject({ valueKind: 'numeric', unit: 'nM' })
    expect(resolveEvidence(b, 'ev_AC-1_kd')!.numericValue).toBeCloseTo(2.0, 1)
    expect(resolveEvidence(b, 'ev_AC-1_class')).toMatchObject({ valueKind: 'categorical', categoricalValue: 'confirmed binder' })
    expect(resolveEvidence(b, 'ev_AC-1_reco')!.categoricalValue).toBe('recommended for follow-up')
  })
})
