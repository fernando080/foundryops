import { describe, it, expect } from 'vitest'
import { validateCustomerDraft, renderCustomerDraft } from './compose'
import type { CustomerDraft, EvidenceBundle } from '@/domain/schemas'
const bundle: EvidenceBundle = { experimentId: 'e', summaryStats: {}, records: [
  { id: 'ev_AC-1_name', kind: 'classification', valueKind: 'categorical', numericValue: null, unit: null, categoricalValue: 'AC-1', displayLabel: 'n', sourceRef: 'r', provenanceChain: [] },
  { id: 'ev_AC-1_kd', kind: 'qc_calculation', valueKind: 'numeric', numericValue: 2.0, unit: 'nM', categoricalValue: null, displayLabel: 'k', sourceRef: 'r', provenanceChain: [] },
  { id: 'ev_AC-1_reco', kind: 'approved_recommendation', valueKind: 'categorical', numericValue: null, unit: null, categoricalValue: 'recommended for follow-up', displayLabel: 'r', sourceRef: 'r', provenanceChain: [] } ] }
const draft = (segs: CustomerDraft['segments']): CustomerDraft => ({ segments: segs, generatedBy: { adapter: 's', model: 's', promptHash: 'x' }, status: 'draft' })
describe('customer draft compose', () => {
  it('renders inserting values from evidence', () => {
    const d = draft([{ kind: 'evidence', evidenceId: 'ev_AC-1_name', claimType: 'confirmed', prefix: '', suffix: '' }, { kind: 'text', text: ' binds with KD ' }, { kind: 'evidence', evidenceId: 'ev_AC-1_kd', claimType: 'confirmed', prefix: '', suffix: '.' }])
    expect(validateCustomerDraft(d, bundle).ok).toBe(true)
    expect(renderCustomerDraft(d, bundle)).toBe('AC-1 binds with KD 2 nM.')
  })
  it('blocks a text segment that contains a number', () => {
    expect(validateCustomerDraft(draft([{ kind: 'text', text: 'KD 2.0 nM improvement of 40%' }]), bundle).errors.some(e => e.code === 'TEXT_SEGMENT_HAS_NUMBER')).toBe(true) })
  it('blocks a missing evidence id (fail-closed)', () => {
    expect(validateCustomerDraft(draft([{ kind: 'evidence', evidenceId: 'ev_nope', claimType: 'confirmed', prefix: '', suffix: '' }]), bundle).errors.some(e => e.code === 'EVIDENCE_NOT_FOUND')).toBe(true) })
  it('blocks a digit in prefix/suffix', () => { const d = draft([{ kind: 'evidence', evidenceId: 'ev_AC-1_kd', claimType: 'confirmed', prefix: 'was 2', suffix: '' }]); expect(validateCustomerDraft(d, bundle).errors.some(e => e.code === 'TEXT_SEGMENT_HAS_NUMBER')).toBe(true) })
  it('blocks a claimType/kind mismatch', () => { const d = draft([{ kind: 'evidence', evidenceId: 'ev_AC-1_kd', claimType: 'recommendation', prefix: '', suffix: '' }]); expect(validateCustomerDraft(d, bundle).errors.some(e => e.code === 'CLAIMTYPE_EVIDENCE_MISMATCH')).toBe(true) })
})
