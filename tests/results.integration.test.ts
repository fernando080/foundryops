import { describe, it, expect } from 'vitest'
import { MockFoundryClient } from '@/adapters/foundry/mock'
import { DeterministicLlmAdapter } from '@/adapters/llm/deterministic'
import { reviewResults } from '@/application/reviewResults'
import { draftCustomerUpdate } from '@/application/draftComms'
describe('results + draft', () => {
  it('reviews AC-1..AC-4 and renders an evidence-backed draft', async () => {
    const { pairs, bundle } = await reviewResults(new MockFoundryClient(), 'exp-demo')
    expect(pairs.map(p => p.qc.bindingClass)).toEqual(['confirmed_binder','apparent_binder_poor_fit','no_detectable_binding','inconclusive_replicate_inconsistent'])
    const r = await draftCustomerUpdate(new DeterministicLlmAdapter(), bundle)
    expect(r.ok).toBe(true); expect(r.rendered).toContain('AC-1'); expect(r.rendered).toContain('2 nM')
  })
})
