import type { RawExtractedIntent } from '@/domain/schemas'
import { DEMO_BUDGET_MINOR } from '@/domain/constants'
export const demoRawIntent: RawExtractedIntent = { experimentType: 'affinity', method: 'bli', targetQuery: 'EGFR',
  requestedCount: 8, concentrations: [1e-7, 3e-8, 1e-8, 3e-9, 1e-9, 4e-10], replicates: 3,
  budget: { amountMinor: DEMO_BUDGET_MINOR, currency: 'USD' },
  fields: [ { name: 'target', value: 'EGFR', confidence: 0.72, sourceSpan: { start: 40, end: 44 } },
    { name: 'method', value: 'bli', confidence: 0.96, sourceSpan: { start: 12, end: 15 } },
    { name: 'budget', value: 8000, confidence: 0.9, sourceSpan: { start: 120, end: 126 } } ],
  ambiguities: [ { field: 'target', reason: 'EGFR resolves to more than one construct', options: ['tgt_egfr_human_ecd', 'tgt_egfr_ecd_fc'] } ] }
export const demoRawIntentNoBudget: RawExtractedIntent = { ...demoRawIntent, budget: null, fields: demoRawIntent.fields.filter(f => f.name !== 'budget') }
