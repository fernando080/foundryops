import { describe, it, expect } from 'vitest'
import { MockFoundryClient } from './mock'

describe('MockFoundryClient', () => {
  it('estimates 6-candidate cost over an 800000 budget', async () => {
    const e = await new MockFoundryClient().estimateCost({ acceptedCount: 6, budgetMinor: 800000 })
    expect(e.totalMinor).toBe(970000)
    expect(e.withinBudget).toBe(false)
    expect(e.maxWithinBudget).toBe(4)
  })

  it('resolves EGFR to two targets', async () => {
    expect((await new MockFoundryClient().searchTargets({ query: 'EGFR' })).length).toBe(2)
  })

  it('createDraft id is a deterministic function of operationKey', async () => {
    const c = new MockFoundryClient()
    const a = await c.createDraft({} as any, { operationKey: 'k' })
    const b = await c.createDraft({} as any, { operationKey: 'k' })
    expect(a.experimentId).toBe(b.experimentId)
  })

  it('getExperimentStatus returns a lower_snake_case wire status', async () => {
    expect((await new MockFoundryClient().getExperimentStatus('e')).statusWire).toBe('done')
  })
})
