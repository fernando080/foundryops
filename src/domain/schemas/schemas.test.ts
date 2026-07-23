import { describe, it, expect } from 'vitest'
import { RawExtractedIntentSchema, FoundryUpdateSchema, ResultRecordSchema, QCResultSchema } from './index'
import { demoQcPolicyV1, WIRE_STATUS_MAP, WEBHOOK_API_VERSION } from '../constants'
describe('schemas + constants', () => {
  it('RawExtractedIntent allows unsupported types + null concentrations', () => {
    expect(RawExtractedIntentSchema.parse({ experimentType: 'screening', method: 'elisa', targetQuery: null, requestedCount: null, concentrations: null, replicates: null, budget: null, fields: [], ambiguities: [] }).experimentType).toBe('screening') })
  it('FoundryUpdate has no status/title/content and a separate api_version', () => {
    const u = FoundryUpdateSchema.parse({ deliveryId: 'D1', event: 'experiment_update', timestamp: 't', apiVersion: '2026-02', signatureVerified: true,
      data: { type: 'experiment.update', experimentId: 'e', experimentCode: 'c', organizationId: 'o', updateId: 'u', name: 'n', description: 'd', updateType: 'status_note', eta: null, createdAt: 't' } })
    expect((u.data as any).status).toBeUndefined(); expect(WEBHOOK_API_VERSION).toBe('2026-02') })
  it('ResultRecord carries contract fields incl. confidence; QCResult separates dataQuality from bindingClass', () => {
    ResultRecordSchema.parse({ experimentId: 'e', candidateId: 'AC-1', replicateKdsM: [2e-9], konMInvSInv: 3e5, koffPerS: 6e-4, kdMeanM: 2e-9, rmseMaxSignalPct: 4, fitQualityReported: 'good', confidence: 'high', controlOutcome: 'pass', measurements: [] })
    const q = QCResultSchema.parse({ candidateId: 'AC-1', dataQuality: 'pass', bindingClass: 'confirmed_binder', affinity: { kdM: 2e-9, ciLowM: null, ciHighM: null }, replicateConsistency: { cv: 0.03, consistent: true, status: 'consistent' }, fitQuality: { rmseMaxSignalPct: 4, reported: 'good', pass: true, status: 'pass' }, confidence: 'high', controlOutcome: 'pass', recommendation: 'follow_up', appliedThresholds: 'demo-qc-policy@v1', warnings: [] })
    expect(q.dataQuality).toBe('pass') })
  it('exposes policy + wire status map', () => { expect(demoQcPolicyV1.version).toBe('demo-qc-policy@v1'); expect(WIRE_STATUS_MAP.done).toBe('Done') })
})
