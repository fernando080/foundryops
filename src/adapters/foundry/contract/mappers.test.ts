import { describe, it, expect } from 'vitest'
import { TargetSchema, CostEstimateSchema, ResultRecordSchema } from '@/domain/schemas'
import { mapWireStatus } from '@/domain/status/map'
import { mapTarget, mapCostEstimate, mapExperimentId, mapAffinityResult } from './mappers'
import type {
  TargetListItemWire,
  CostEstimateResponseWire,
  CreateExpResponseWire,
  AffinityResultWire,
} from './schemas'

// Representative WIRE payloads, shaped from openapi.snapshot.json (Adaptyv
// Foundry OpenAPI v0.0.2). Field names/nesting copied from:
// - GET /api/v1/targets 200 → items[] (components.schemas inline target entry)
// - POST /api/v1/experiments/cost-estimate 200 → CostEstimateResponse
// - POST /api/v1/experiments 201 → CreateExpResponse
// - AffinityResult / AffinityReplicate (embedded in ResultInfo.summary[])

describe('mapWireStatus (imported for the wire-status contract proof)', () => {
  it('maps lower_snake_case wire status to domain PascalCase', () => {
    expect(mapWireStatus('waiting_for_confirmation')).toBe('WaitingForConfirmation')
  })
})

describe('mapTarget', () => {
  it('maps a detailed target list item to a valid domain Target', () => {
    const wire: TargetListItemWire = {
      id: '019a03da-b87f-7e15-8b02-cef171c9871d',
      name: 'Human PD-L1',
      vendor_name: 'ACRO Biosystems',
      catalog_number: 'PD1-H5220',
      url: 'https://targets.adaptyvbio.com/protein/019a03da-b87f-7e15-8b02-cef171c9871d',
      uniprot_id: 'Q9NZQ7',
      pricing: { type: 'per_sequence', price_per_sequence_cents: 500 },
      details: {
        organism: 'Human',
        synonyms: ['Programmed death-ligand 1', 'CD274'],
        gene_names: ['CD274', 'PDCD1LG1'],
      },
    }

    const target = mapTarget(wire)

    expect(TargetSchema.parse(target)).toEqual(target)
    expect(target).toEqual({
      foundryTargetId: '019a03da-b87f-7e15-8b02-cef171c9871d',
      name: 'Human PD-L1',
      aliases: ['Programmed death-ligand 1', 'CD274'],
      organism: 'Human',
      uniprotId: 'Q9NZQ7',
    })
  })

  it('defaults aliases/organism/uniprotId when the list omits `details` and `uniprot_id` is null', () => {
    const wire: TargetListItemWire = {
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      name: 'Custom antigen',
      vendor_name: 'Custom Vendor',
      catalog_number: 'CV-001',
      url: 'https://targets.adaptyvbio.com/protein/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      uniprot_id: null,
      pricing: null,
      details: null,
    }

    const target = mapTarget(wire)

    expect(() => TargetSchema.parse(target)).not.toThrow()
    expect(target.aliases).toEqual([])
    expect(target.organism).toBe('unknown')
    expect(target.uniprotId).toBe('')
  })
})

describe('mapCostEstimate', () => {
  it('maps a complete breakdown response, within budget', () => {
    const wire: CostEstimateResponseWire = {
      breakdown: {
        pricing_version: 'v1_2026-01-20',
        assay: {
          experiment_type: 'affinity',
          sequence_count: 2,
          n_replicates: 3,
          unit_price_cents: 14900,
          replicate_price_cents: 5800,
          subtotal_cents: 55000,
        },
        materials: {
          type: 'per_sequence',
          target: { name: 'Human PD-L1', target_catalog_id: '019a03da-b87f-7e15-8b02-cef171c9871d' },
          sequence_count: 2,
          price_per_sequence_cents: 500,
          subtotal_cents: 1000,
        },
        total_cents: 56000,
      },
      incomplete: null,
      warnings: [],
    }

    const est = mapCostEstimate(wire, 800_000)

    expect(CostEstimateSchema.parse(est)).toEqual(est)
    expect(est.totalMinor).toBe(56000)
    expect(est.currency).toBe('USD')
    expect(est.withinBudget).toBe(true)
    expect(est.overageMinor).toBe(0)
    expect(est.lineItems).toEqual([
      { label: 'Assay (affinity)', amountMinor: 55000 },
      { label: 'Materials (Human PD-L1)', amountMinor: 1000 },
    ])
  })

  it('maps an incomplete estimate (no self-service materials pricing) and computes overage', () => {
    const wire: CostEstimateResponseWire = {
      breakdown: null,
      incomplete: {
        pricing_version: 'v1_2026-01-20',
        assay: {
          experiment_type: 'screening',
          sequence_count: 5,
          n_replicates: 3,
          unit_price_cents: 14900,
          replicate_price_cents: 5800,
          subtotal_cents: 103500,
        },
        materials_unavailable: {
          reason: "This target is not yet onboarded to self-service pricing. You'll receive a quote with full price information.",
          target: { name: 'This target', target_catalog_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
        },
        total_cents: null,
      },
      warnings: ['materials pricing unavailable'],
    }

    const est = mapCostEstimate(wire, 50_000)

    expect(CostEstimateSchema.parse(est)).toEqual(est)
    expect(est.totalMinor).toBe(103500)
    expect(est.withinBudget).toBe(false)
    expect(est.overageMinor).toBe(53500)
  })

  it('is budget-agnostic when budgetMinor is null', () => {
    const wire: CostEstimateResponseWire = {
      breakdown: {
        pricing_version: 'v1_2026-01-20',
        assay: {
          experiment_type: 'affinity',
          sequence_count: 1,
          n_replicates: 3,
          unit_price_cents: 14900,
          replicate_price_cents: 5800,
          subtotal_cents: 26500,
        },
        materials: null,
        total_cents: 26500,
      },
      incomplete: null,
      warnings: [],
    }

    const est = mapCostEstimate(wire, null)

    expect(CostEstimateSchema.parse(est)).toEqual(est)
    expect(est.withinBudget).toBe(true)
    expect(est.maxWithinBudget).toBeNull()
  })
})

describe('mapExperimentId', () => {
  it('extracts the experiment id from a create-experiment response', () => {
    const wire: CreateExpResponseWire = {
      experiment_id: '019a03da-c000-7000-8000-abcdefabcdef',
      error: null,
      stripe_hosted_invoice_url: null,
      stripe_invoice_id: null,
    }

    expect(mapExperimentId(wire)).toBe('019a03da-c000-7000-8000-abcdefabcdef')
  })
})

describe('mapAffinityResult', () => {
  it('maps a fully-populated AffinityResult to a valid domain ResultRecord', () => {
    const wire: AffinityResultWire = {
      sequence: { aa_string: 'EVQLVESGGGLVQPGGSLRLSCAAS', control: false, name: 'AC-1', metadata: null },
      kd_units: 'M',
      binding: 'true',
      binding_strength: 'strong',
      binding_model: ['standard'],
      concentration_display: '12.3',
      concentration_value: 12.3,
      expression: 'high',
      fit_quality: 'good',
      kd_app: { value: 2.02e-9, ci_low: 1.9e-9, ci_high: 2.15e-9 },
      kd_log_std: 0.02,
      kd_mean: 2.02e-9,
      koff_1to1: { value: 6.3e-4, ci_low: 6.0e-4, ci_high: 6.6e-4 },
      koff_log_std: 0.01,
      koff_mean: 6.3e-4,
      kon_1to1: { value: 3.1e5, ci_low: 3.0e5, ci_high: 3.2e5 },
      kon_log_std: 0.01,
      kon_mean: 3.1e5,
      method: ['1:1'],
      performance: { 'Positive Control': 'better' },
      place: 1,
      positive_control: false,
      replicates: [
        { replicate: 1, kd: 2.0e-9, kon: 3.1e5, koff: 6.3e-4, confidence: 'high', fit_quality: 'good', rmse_max_signal_pct: 4.0, binding: 'true', binding_strength: 'strong', expression: 'high', method: '1:1', kon_method: '1:1', koff_method: '1:1', kd_app: null, kon_1to1: null, koff_1to1: null },
        { replicate: 2, kd: 2.1e-9, kon: 3.05e5, koff: 6.4e-4, confidence: 'high', fit_quality: 'good', rmse_max_signal_pct: 4.4, binding: 'true', binding_strength: 'strong', expression: 'high', method: '1:1', kon_method: '1:1', koff_method: '1:1', kd_app: null, kon_1to1: null, koff_1to1: null },
        { replicate: 3, kd: 1.95e-9, kon: 3.15e5, koff: 6.2e-4, confidence: 'high', fit_quality: 'good', rmse_max_signal_pct: 4.2, binding: 'true', binding_strength: 'strong', expression: 'high', method: '1:1', kon_method: '1:1', koff_method: '1:1', kd_app: null, kon_1to1: null, koff_1to1: null },
      ],
      rmse_max_signal_pct: 4.2,
      target: { name: 'Human PD-L1', target_catalog_id: '019a03da-b87f-7e15-8b02-cef171c9871d', sequence: null, supplier_url: null },
    }

    const rec = mapAffinityResult(wire, 'exp-demo')

    expect(ResultRecordSchema.parse(rec)).toEqual(rec)
    expect(rec).toEqual({
      experimentId: 'exp-demo',
      candidateId: 'AC-1',
      replicateKdsM: [2.0e-9, 2.1e-9, 1.95e-9],
      konMInvSInv: 3.1e5,
      koffPerS: 6.3e-4,
      kdMeanM: 2.02e-9,
      rmseMaxSignalPct: 4.2,
      fitQualityReported: 'good',
      confidence: 'high',
      controlOutcome: 'na',
      measurements: [],
    })
  })

  it('handles a poorly-fit result with unmeasurable replicate kds and no candidate name', () => {
    const wire: AffinityResultWire = {
      sequence: { aa_string: 'EVQLVESGGGLVQPGGSLRLSCAAS', control: false, name: null, metadata: null },
      kd_units: 'M',
      binding: 'unknown',
      binding_strength: 'none',
      binding_model: null,
      concentration_display: null,
      concentration_value: null,
      expression: null,
      fit_quality: null,
      kd_app: null,
      kd_log_std: null,
      kd_mean: null,
      koff_1to1: null,
      koff_log_std: null,
      koff_mean: null,
      kon_1to1: null,
      kon_log_std: null,
      kon_mean: null,
      method: null,
      performance: { 'Positive Control': null },
      place: null,
      positive_control: false,
      replicates: [
        { replicate: 1, kd: null, kon: null, koff: null, confidence: null, fit_quality: 'poor', rmse_max_signal_pct: null, binding: 'unknown', binding_strength: 'none', expression: null, method: null, kon_method: null, koff_method: null, kd_app: null, kon_1to1: null, koff_1to1: null },
      ],
      rmse_max_signal_pct: null,
      target: null,
    }

    const rec = mapAffinityResult(wire, 'exp-demo')

    expect(ResultRecordSchema.parse(rec)).toEqual(rec)
    expect(rec.candidateId).toBe('unknown-candidate')
    expect(rec.replicateKdsM).toBeNull()
    expect(rec.konMInvSInv).toBeNull()
    expect(rec.koffPerS).toBeNull()
    expect(rec.kdMeanM).toBeNull()
    expect(rec.fitQualityReported).toBeNull()
    expect(rec.confidence).toBeNull()
    expect(rec.controlOutcome).toBe('na')
  })
})
