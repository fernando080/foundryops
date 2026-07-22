import { describe, it, expect } from 'vitest'
import { runIntake } from '@/application/intake'
import { MockFoundryClient } from '@/adapters/foundry/mock'
import { DeterministicLlmAdapter } from '@/adapters/llm/deterministic'
import { DEMO_REQUEST_TEXT } from '../fixtures/request'
import { demoFasta } from '../fixtures/candidates'

describe('runIntake', () => {
  it('extracts, validates, preflights, and reports ambiguous target', async () => {
    const r = await runIntake(new DeterministicLlmAdapter(), new MockFoundryClient(), DEMO_REQUEST_TEXT, demoFasta)
    expect(r.intentResult.ok).toBe(true)
    expect(r.resolution.status).toBe('ambiguous')
    expect(r.sequenceSet.acceptedIds).toEqual(['AC-1','AC-2','AC-3','AC-4','AC-7','AC-8'])
  })
})
