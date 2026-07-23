import { describe, it, expect } from 'vitest'
import { demoResultRecords } from './results'
import { signedUpdate, verifyForTest } from './updates'
const byId = (id: string) => demoResultRecords.find(r => r.candidateId === id)!
describe('fixtures', () => {
  it('AC-1..AC-4 triplicate result records with populated series', () => {
    expect(demoResultRecords.map(r => r.candidateId)).toEqual(['AC-1','AC-2','AC-3','AC-4'])
    expect(demoResultRecords[0]!.replicateKdsM!.length).toBe(3)
    expect(demoResultRecords[0]!.measurements.length).toBe(18) })   // 6 conc x 3 reps
  it('AC-1 exposes association rate as konMInvSInv (M^-1 s^-1)', () => {
    const ac1 = byId('AC-1')
    expect(ac1.konMInvSInv).toBe(3.1e5)
    expect(Object.keys(ac1)).toContain('konMInvSInv') })
  it('AC-3 has no determinable KD, so fitQualityReported and confidence default to null (no poor/low overrides)', () => {
    const ac3 = byId('AC-3')
    expect(ac3.kdMeanM).toBeNull()
    expect(ac3.fitQualityReported).toBeNull()
    expect(ac3.confidence).toBeNull() })
  it('signed experiment_update matches headers and verifies', () => {
    const { rawBody, headers, body } = signedUpdate({ experimentId: 'e', experimentCode: 'EXP-1', name: 'Quote sent', description: 'A quote was prepared', updateType: 'quote' }, 'sec', 'D1')
    expect(headers['X-Adaptyv-Event']).toBe('experiment_update'); expect(headers['X-Adaptyv-Delivery-Id']).toBe(body.delivery_id)
    expect(verifyForTest(rawBody, headers['X-Adaptyv-Signature'], 'sec')).toBe(true) })
})
