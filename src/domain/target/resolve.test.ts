import { describe, it, expect } from 'vitest'
import { resolveTarget } from './resolve'
import { demoTargets } from '../../../fixtures/targets'

describe('resolveTarget', () => {
  it('is ambiguous for EGFR across two constructs and blocks', () => {
    const r = resolveTarget('EGFR', demoTargets)
    expect(r.status).toBe('ambiguous')
    expect(r.chosen).toBeNull()
  })
  it('is missing for null/empty', () => {
    expect(resolveTarget(null, demoTargets).status).toBe('missing')
  })
})
