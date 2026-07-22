import { describe, it, expect } from 'vitest'
import { draftCustomerUpdate } from '@/application/draftComms'
import { DeterministicLlmAdapter } from '@/adapters/llm/deterministic'
import type { EvidenceBundle } from '@/domain/schemas'

// bundle has ev_AC-1_class (so the adapter emits AC-1 segments) but is missing ev_AC-1_reco → fail closed
const partial: EvidenceBundle = {
  experimentId: 'e',
  summaryStats: {},
  records: [
    {
      id: 'ev_AC-1_name',
      kind: 'classification',
      valueKind: 'categorical',
      numericValue: null,
      unit: null,
      categoricalValue: 'AC-1',
      displayLabel: 'n',
      sourceRef: 'r',
      provenanceChain: [],
    },
    {
      id: 'ev_AC-1_class',
      kind: 'classification',
      valueKind: 'categorical',
      numericValue: null,
      unit: null,
      categoricalValue: 'confirmed binder',
      displayLabel: 'c',
      sourceRef: 'r',
      provenanceChain: [],
    },
  ],
}

describe('fail-closed customer draft', () => {
  it('blocks when a cited evidence id is missing', async () => {
    const r = await draftCustomerUpdate(new DeterministicLlmAdapter(), partial)
    expect(r.ok).toBe(false)
    expect(r.errors?.some((e) => e.code === 'EVIDENCE_NOT_FOUND')).toBe(true)
  })
})
