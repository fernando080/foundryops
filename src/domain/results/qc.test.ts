import { describe, it, expect } from 'vitest'
import { classifyCandidate, coefficientOfVariation } from './qc'
import { demoResultRecords } from '../../../fixtures/results'

const byId = (id: string) => demoResultRecords.find(r => r.candidateId === id)!

describe('classifyCandidate (demo-qc-policy@v1)', () => {
  it('AC-1 confirmed_binder, qcStatus pass', () => {
    const r = classifyCandidate(byId('AC-1'))
    expect(r.bindingClass).toBe('confirmed_binder')
    expect(r.qcStatus).toBe('pass')
    expect(r.recommendation).toBe('follow_up')
  })

  it('AC-2 apparent_binder_poor_fit', () =>
    expect(classifyCandidate(byId('AC-2')).bindingClass).toBe('apparent_binder_poor_fit')
  )

  it('AC-3 no_detectable_binding is a VALID negative (qcStatus pass)', () => {
    const r = classifyCandidate(byId('AC-3'))
    expect(r.bindingClass).toBe('no_detectable_binding')
    expect(r.qcStatus).toBe('pass')
  })

  it('AC-4 inconclusive_replicate_inconsistent', () =>
    expect(classifyCandidate(byId('AC-4')).bindingClass).toBe('inconclusive_replicate_inconsistent')
  )

  it('control failure fails data quality but is separate from outcome', () => {
    const r = classifyCandidate({ ...byId('AC-1'), controlOutcome: 'fail' })
    expect(r.qcStatus).toBe('fail')
    expect(r.warnings).toContain('CONTROL_FAILED')
  })

  it('negative KD → data-quality fail + no_detectable_binding', () => {
    const r = classifyCandidate({ ...byId('AC-1'), replicateKdsM: [-1e-9], kdMeanM: -1e-9 })
    expect(r.qcStatus).toBe('fail')
    expect(r.bindingClass).toBe('no_detectable_binding')
  })

  it('CV = sample stdev / mean', () =>
    expect(coefficientOfVariation([5e-9, 500e-9, 250e-9])).toBeGreaterThan(0.2)
  )
})
