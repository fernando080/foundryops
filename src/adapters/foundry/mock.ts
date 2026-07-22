import type { FoundryClient } from '@/application/ports'
import type { Target, CostEstimate, DraftPayload, ResultRecord } from '@/domain/schemas'
import { SETUP_COST_MINOR, PER_CANDIDATE_MINOR } from '@/domain/constants'
import { applyBudget } from '@/domain/cost/budget'
import { MockDraftIdGenerator } from './ids'
import { demoTargets } from '../../../fixtures/targets'
import { demoResultRecords } from '../../../fixtures/results'

const idGen = new MockDraftIdGenerator()

export class MockFoundryClient implements FoundryClient {
  async searchTargets({ query }: { query: string }): Promise<Target[]> {
    const q = query.trim().toLowerCase()
    return demoTargets.filter(
      t => t.aliases.some(a => a.toLowerCase() === q) || t.name.toLowerCase().includes(q)
    )
  }

  async estimateCost({ acceptedCount, budgetMinor }: { acceptedCount: number; budgetMinor: number | null }): Promise<CostEstimate> {
    const totalMinor = SETUP_COST_MINOR + PER_CANDIDATE_MINOR * acceptedCount
    const b = applyBudget(totalMinor, budgetMinor)
    return {
      foundryQuoteRef: `quote_${acceptedCount}`,
      currency: 'USD',
      totalMinor,
      ...b,
      lineItems: [
        { label: 'Assay setup', amountMinor: SETUP_COST_MINOR },
        { label: `Per-candidate (${acceptedCount})`, amountMinor: PER_CANDIDATE_MINOR * acceptedCount }
      ]
    }
  }

  async createDraft(_p: DraftPayload, opts: { operationKey: string }) {
    const id = idGen.idFor(opts.operationKey)
    return { experimentId: id, draftId: id.replace('exp_', 'draft_') }
  }

  async getExperimentStatus(_id: string): Promise<{ statusWire: string }> {
    return { statusWire: 'done' }
  }

  async getResults(_id: string): Promise<ResultRecord[]> {
    return demoResultRecords
  }
}
