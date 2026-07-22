import { describe, it, expect } from 'vitest'
import { runPreflight } from './engine'
import { parseFasta } from '@/domain/sequence/fasta'
import { demoFasta } from '../../../fixtures/candidates'
describe('runPreflight', () => {
  it('rejects malformed + duplicate and accepts AC-1..AC-4,AC-7,AC-8', () => {
    const { findings, sequenceSet } = runPreflight({ sequences: parseFasta(demoFasta, 'f'), requestedCount: 8 })
    expect(findings.find(f => f.code === 'INVALID_RESIDUE')?.evidenceLocation.sequenceId).toBe('AC-5')
    expect(findings.find(f => f.code === 'DUPLICATE_SEQUENCE')?.duplicateOf).toBe('AC-1')
    expect(sequenceSet.acceptedIds).toEqual(['AC-1','AC-2','AC-3','AC-4','AC-7','AC-8'])
  })
  it('auto-excluded malformed/duplicate findings do not block progression', () => {
    const { findings } = runPreflight({ sequences: parseFasta(demoFasta, 'f'), requestedCount: 8 })
    expect(findings.find(f => f.code === 'INVALID_RESIDUE')!.blocksProgression).toBe(false)
    expect(findings.find(f => f.code === 'DUPLICATE_SEQUENCE')!.blocksProgression).toBe(false)
  })
})
