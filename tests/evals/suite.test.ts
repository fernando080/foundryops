import { describe, it, expect } from 'vitest'
import { EVAL_CASES } from './registry'

describe('golden/adversarial eval suite', () => {
  it('has >= 10 adversarial cases', () => expect(EVAL_CASES.filter((c) => c.adversarial).length).toBeGreaterThanOrEqual(10))
  for (const c of EVAL_CASES) it(`${c.id} [${c.layer}]`, async () => { await c.run() })
})
