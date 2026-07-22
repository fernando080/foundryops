import { describe, it, expect } from 'vitest'
import { DeterministicLlmAdapter } from './deterministic'
import { DEMO_REQUEST_TEXT } from '../../../fixtures/request'
describe('DeterministicLlmAdapter.extractIntent', () => {
  it('returns the demo intent for the exact request (triplicate)', async () => { const r = await new DeterministicLlmAdapter().extractIntent({ requestText: DEMO_REQUEST_TEXT }); expect(r.ok).toBe(true); if (r.ok) { expect(r.raw.targetQuery).toBe('EGFR'); expect(r.raw.replicates).toBe(3) } })
  it('returns NO_STUB_FIXTURE for unknown text (never a silent affinity intent)', async () => { const r = await new DeterministicLlmAdapter().extractIntent({ requestText: 'hello' }); expect(r).toEqual({ ok: false, error: 'NO_STUB_FIXTURE' }) })
})
