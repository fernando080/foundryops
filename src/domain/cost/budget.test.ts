import { describe, it, expect } from 'vitest'
import { applyBudget } from './budget'

describe('applyBudget', () => {
  it('over budget for 6 candidates and computes max 4', () => {
    const r = applyBudget(970000, 800000)
    expect(r.withinBudget).toBe(false)
    expect(r.overageMinor).toBe(170000)
    expect(r.maxWithinBudget).toBe(4)
  })
  it('returns null (never Infinity) when there is no budget', () => {
    expect(applyBudget(970000, null).maxWithinBudget).toBeNull()
  })
})
