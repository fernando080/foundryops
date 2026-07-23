import { describe, it, expect } from 'vitest'
import { validateCustomerDraft } from './compose'
import type { CustomerDraft, EvidenceBundle } from '@/domain/schemas'
const rec = (id: string, over: Record<string, unknown> = {}) => ({ id, kind: 'classification' as const, valueKind: 'categorical' as const, numericValue: null, unit: null, categoricalValue: 'x', displayLabel: 'l', sourceRef: 'r', provenanceChain: [], ...over })
const bundle: EvidenceBundle = { experimentId: 'e', summaryStats: {}, records: [
  rec('ev_conf', { claimPolarity: 'confirmed', categoricalValue: 'confirmed binder' }),
  rec('ev_inc', { claimPolarity: 'inconclusive', categoricalValue: 'inconclusive' }),
  rec('ev_reco', { kind: 'approved_recommendation', categoricalValue: 'recommended for follow-up' }),
  rec('ev_kd', { kind: 'qc_calculation', valueKind: 'numeric', numericValue: 2, unit: 'nM', categoricalValue: null }) ] }
const draft = (evidenceId: string, claimType: 'confirmed' | 'inconclusive' | 'recommendation'): CustomerDraft => ({ segments: [{ kind: 'evidence', evidenceId, claimType, prefix: '', suffix: '' }], generatedBy: { adapter: 's', model: 's', promptHash: 'x' }, status: 'draft' })
describe('claimType ↔ evidence compatibility', () => {
  it('confirmed cannot cite an inconclusive classification', () => expect(validateCustomerDraft(draft('ev_inc', 'confirmed'), bundle).errors.some(e => e.code === 'CLAIMTYPE_EVIDENCE_MISMATCH')).toBe(true))
  it('inconclusive cannot cite a confirmed classification', () => expect(validateCustomerDraft(draft('ev_conf', 'inconclusive'), bundle).errors.some(e => e.code === 'CLAIMTYPE_EVIDENCE_MISMATCH')).toBe(true))
  it('confirmed may cite a confirmed classification', () => expect(validateCustomerDraft(draft('ev_conf', 'confirmed'), bundle).ok).toBe(true))
  it('inconclusive may cite an inconclusive classification', () => expect(validateCustomerDraft(draft('ev_inc', 'inconclusive'), bundle).ok).toBe(true))
  it('recommendation requires approved_recommendation evidence', () => { expect(validateCustomerDraft(draft('ev_reco', 'recommendation'), bundle).ok).toBe(true); expect(validateCustomerDraft(draft('ev_conf', 'recommendation'), bundle).errors.some(e => e.code === 'CLAIMTYPE_EVIDENCE_MISMATCH')).toBe(true) })
  it('confirmed may cite a numeric qc_calculation fact', () => expect(validateCustomerDraft(draft('ev_kd', 'confirmed'), bundle).ok).toBe(true))
})
