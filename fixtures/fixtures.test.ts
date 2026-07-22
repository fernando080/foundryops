import { describe, it, expect } from 'vitest'
import { demoResultRecords } from './results'
import { signedUpdate, verifyForTest } from './updates'
describe('fixtures', () => {
  it('AC-1..AC-4 triplicate result records with populated series', () => {
    expect(demoResultRecords.map(r => r.candidateId)).toEqual(['AC-1','AC-2','AC-3','AC-4'])
    expect(demoResultRecords[0]!.replicateKdsM!.length).toBe(3)
    expect(demoResultRecords[0]!.measurements.length).toBe(18) })   // 6 conc x 3 reps
  it('signed experiment_update matches headers and verifies', () => {
    const { rawBody, headers, body } = signedUpdate({ experimentId: 'e', experimentCode: 'EXP-1', name: 'Quote sent', description: 'A quote was prepared', updateType: 'quote' }, 'sec', 'D1')
    expect(headers['X-Adaptyv-Event']).toBe('experiment_update'); expect(headers['X-Adaptyv-Delivery-Id']).toBe(body.delivery_id)
    expect(verifyForTest(rawBody, headers['X-Adaptyv-Signature'], 'sec')).toBe(true) })
})
