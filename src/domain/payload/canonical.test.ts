import { describe, it, expect } from 'vitest'
import { hashDraftPayload, canonicalizeDraftPayload } from './canonical'
import type { DraftPayload } from '@/domain/schemas'
const base: DraftPayload = { method: 'bli', experimentType: 'affinity', targetId: 'tgt_egfr_human_ecd',
  sequences: [{ id: 'AC-1', residues: 'MKTAYIAKQR' }, { id: 'AC-2', residues: 'MKQWERTYIPL' }],
  concentrations: [1e-7, 1e-9], replicates: 2, costTotalMinor: 730000, currency: 'USD', environment: 'mock',
  operation: 'create_draft', canonicalizerVersion: 'canon@v1', version: 1 }
describe('canonical hash', () => {
  it('stable under reorder + volatile change', () => { expect(hashDraftPayload({ ...base, sequences: [base.sequences[1]!, base.sequences[0]!], version: 99, requestId: 'r' })).toBe(hashDraftPayload(base)) })
  it('sensitive to every invalidator', () => { const h = hashDraftPayload(base)
    for (const m of [{ targetId: 'x' }, { costTotalMinor: 730001 }, { currency: 'EUR' }, { environment: 'live' as const }, { operation: 'confirm_experiment' as const }, { sequences: [base.sequences[0]!] }]) expect(hashDraftPayload({ ...base, ...m })).not.toBe(h) })
  it('rejects float money and unknown fields', () => { expect(() => canonicalizeDraftPayload({ ...base, costTotalMinor: 1.5 })).toThrow(/integer/); expect(() => canonicalizeDraftPayload({ ...(base as any), surprise: 1 })).toThrow(/Unclassified/) })
  it('rejects an unexpected canonicalizerVersion', () => { expect(() => canonicalizeDraftPayload({ ...base, canonicalizerVersion: 'canon@v2' })).toThrow(/canonicalizerVersion/) })
})
