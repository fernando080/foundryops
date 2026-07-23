import { describe, it, expect } from 'vitest'
import { classifyCandidate, coefficientOfVariation } from './qc'
import { demoResultRecords } from '../../../fixtures/results'
const byId = (id: string) => demoResultRecords.find(r => r.candidateId === id)!
describe('classifyCandidate (demo-qc-policy@v1) — dataQuality semantics', () => {
  it('AC-1: pass + confirmed_binder', () => { const r = classifyCandidate(byId('AC-1')); expect(r.dataQuality).toBe('pass'); expect(r.bindingClass).toBe('confirmed_binder') })
  it('AC-2: warning + apparent_binder_poor_fit', () => { const r = classifyCandidate(byId('AC-2')); expect(r.dataQuality).toBe('warning'); expect(r.bindingClass).toBe('apparent_binder_poor_fit'); expect(r.fitQuality.status).toBe('fail') })
  it('AC-3: pass + no_detectable_binding, replicate & fit not_applicable', () => { const r = classifyCandidate(byId('AC-3')); expect(r.dataQuality).toBe('pass'); expect(r.bindingClass).toBe('no_detectable_binding'); expect(r.replicateConsistency.status).toBe('not_applicable'); expect(r.fitQuality.status).toBe('not_applicable') })
  it('AC-4: warning + inconclusive_replicate_inconsistent', () => { const r = classifyCandidate(byId('AC-4')); expect(r.dataQuality).toBe('warning'); expect(r.bindingClass).toBe('inconclusive_replicate_inconsistent'); expect(r.replicateConsistency.status).toBe('inconsistent') })
  it('failed control → dataQuality fail', () => { const r = classifyCandidate({ ...byId('AC-1'), controlOutcome: 'fail' }); expect(r.dataQuality).toBe('fail'); expect(r.warnings).toContain('CONTROL_FAILED') })
  it('non-finite/negative KD → dataQuality fail + no_detectable_binding', () => { const r = classifyCandidate({ ...byId('AC-1'), replicateKdsM: [-1e-9], kdMeanM: -1e-9 }); expect(r.dataQuality).toBe('fail'); expect(r.bindingClass).toBe('no_detectable_binding') })
  it('CV = sample stdev / mean', () => expect(coefficientOfVariation([5e-9, 500e-9, 250e-9])).toBeGreaterThan(0.2))
})
