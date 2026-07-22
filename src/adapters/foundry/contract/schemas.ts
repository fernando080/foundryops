import { z } from 'zod'

// ---------------------------------------------------------------------------
// Foundry WIRE contract schemas (Zod) — Task 5.3
//
// These describe the raw HTTP JSON shapes, derived by reading the pinned
// `openapi.snapshot.json` (Adaptyv Foundry OpenAPI v0.0.2, SHA256 pinned in
// `snapshot.meta.ts`). Field names/casing/nesting are copied verbatim from
// the snapshot's `components.schemas` and inline path-response shapes.
//
// Only the four operations Task 5.3 needs are modeled, and only to the
// depth the mappers in `./mappers.ts` actually read. Nested vendor-specific
// blocks we never read (e.g. `TargetDetails.structures`, `LotAllocation`)
// use `.passthrough()`/loose typing rather than full re-modeling — this is
// a wire *contract* proof, not a full client SDK.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// (1) GET /api/v1/targets → 200 → items[] — target list item
// ---------------------------------------------------------------------------

// components.schemas.TargetPricing (oneOf, discriminated by `type`)
export const TargetPricingWireSchema = z.union([
  z.object({
    type: z.literal('per_sequence'),
    price_per_sequence_cents: z.number().int(),
  }),
  z.object({
    type: z.literal('per_broken_lot'),
    lot_prices: z.array(
      z.object({ num_sequences: z.number().int(), price_usdcent: z.number().int() })
    ),
  }),
])
export type TargetPricingWire = z.infer<typeof TargetPricingWireSchema>

// components.schemas.TargetDetails — populated only when the list request
// passed `?detailed=true` (or on the single-target detail endpoint).
// `.passthrough()`: only `organism`/`synonyms` are read by mapTarget; the
// remaining vendor-enrichment fields (gene_names, structures, tags, ...) are
// preserved on the parsed object but not individually re-typed here.
export const TargetDetailsWireSchema = z
  .object({
    organism: z.string().nullable().optional(),
    synonyms: z.array(z.string()).nullable().optional(),
  })
  .passthrough()
export type TargetDetailsWire = z.infer<typeof TargetDetailsWireSchema>

export const TargetListItemWireSchema = z.object({
  id: z.string(),
  name: z.string(),
  vendor_name: z.string(),
  catalog_number: z.string(),
  url: z.string(),
  // Present on ~82% of targets per the snapshot description; null for
  // viral/non-standard proteins (which carry `details.ncbi_id` instead).
  uniprot_id: z.string().nullable(),
  pricing: TargetPricingWireSchema.nullable().optional(),
  details: TargetDetailsWireSchema.nullable().optional(),
})
export type TargetListItemWire = z.infer<typeof TargetListItemWireSchema>

// ---------------------------------------------------------------------------
// (2) POST /api/v1/experiments/cost-estimate → 200 → CostEstimateResponse
// ---------------------------------------------------------------------------

// components.schemas.AssayCost
export const AssayCostWireSchema = z.object({
  experiment_type: z.string(),
  sequence_count: z.number().int(),
  n_replicates: z.number().int(),
  unit_price_cents: z.number().int(),
  replicate_price_cents: z.number().int(),
  subtotal_cents: z.number().int(),
})
export type AssayCostWire = z.infer<typeof AssayCostWireSchema>

// components.schemas.TargetReference — the single shape every response uses
// to name a resolved target (experiment spec, results, cost line items).
export const TargetReferenceWireSchema = z.object({
  name: z.string(),
  sequence: z.string().nullable().optional(),
  supplier_url: z.string().nullable().optional(),
  target_catalog_id: z.string().nullable().optional(),
})
export type TargetReferenceWire = z.infer<typeof TargetReferenceWireSchema>

// components.schemas.MaterialCost (oneOf, discriminated by `type`). The
// `lots` array (components.schemas.LotAllocation) isn't read by the mapper,
// so it's typed loosely rather than fully re-modeled.
export const MaterialCostWireSchema = z.union([
  z.object({
    type: z.literal('per_sequence'),
    target: TargetReferenceWireSchema,
    sequence_count: z.number().int(),
    price_per_sequence_cents: z.number().int(),
    subtotal_cents: z.number().int(),
  }),
  z.object({
    type: z.literal('per_broken_lot'),
    target: TargetReferenceWireSchema,
    sequence_count: z.number().int(),
    lots: z.array(z.unknown()),
    subtotal_cents: z.number().int(),
  }),
])
export type MaterialCostWire = z.infer<typeof MaterialCostWireSchema>

// components.schemas.CostBreakdown — present in `breakdown` when the target
// has self-service pricing.
export const CostBreakdownWireSchema = z.object({
  pricing_version: z.string(),
  assay: AssayCostWireSchema,
  materials: MaterialCostWireSchema.nullable().optional(),
  total_cents: z.number().int(),
})
export type CostBreakdownWire = z.infer<typeof CostBreakdownWireSchema>

// components.schemas.MaterialsUnavailable
export const MaterialsUnavailableWireSchema = z.object({
  reason: z.string(),
  target: TargetReferenceWireSchema,
})
export type MaterialsUnavailableWire = z.infer<typeof MaterialsUnavailableWireSchema>

// components.schemas.IncompleteCostEstimate — present in `incomplete` when
// the target lacks self-service materials pricing. `total_cents` is
// declared in the snapshot only as `"default": null` (no `type`); modeled
// here as nullable int since the assay subtotal is always a whole cents
// amount when present.
export const IncompleteCostEstimateWireSchema = z.object({
  pricing_version: z.string(),
  assay: AssayCostWireSchema,
  materials_unavailable: MaterialsUnavailableWireSchema,
  total_cents: z.number().int().nullable(),
})
export type IncompleteCostEstimateWire = z.infer<typeof IncompleteCostEstimateWireSchema>

// components.schemas.CostEstimateResponse
export const CostEstimateResponseWireSchema = z.object({
  breakdown: CostBreakdownWireSchema.nullable(),
  incomplete: IncompleteCostEstimateWireSchema.nullable(),
  warnings: z.array(z.string()),
})
export type CostEstimateResponseWire = z.infer<typeof CostEstimateResponseWireSchema>

// ---------------------------------------------------------------------------
// (3) POST /api/v1/experiments → 201 → CreateExpResponse
// ---------------------------------------------------------------------------

export const CreateExpResponseWireSchema = z.object({
  experiment_id: z.string(),
  error: z.string().nullable().optional(),
  stripe_hosted_invoice_url: z.string().nullable().optional(),
  stripe_invoice_id: z.string().nullable().optional(),
})
export type CreateExpResponseWire = z.infer<typeof CreateExpResponseWireSchema>

// ---------------------------------------------------------------------------
// (4) Affinity result item — components.schemas.AffinityResult /
// AffinityReplicate, embedded (tagged `result_type: "affinity"`) in each
// `ResultInfo.summary[]` entry returned by the results endpoints.
// ---------------------------------------------------------------------------

// components.schemas.KineticInterval
export const KineticIntervalWireSchema = z.object({
  value: z.number(),
  ci_low: z.number().nullable().optional(),
  ci_high: z.number().nullable().optional(),
})
export type KineticIntervalWire = z.infer<typeof KineticIntervalWireSchema>

// components.schemas.SequenceEntry (the tested antibody sequence)
export const SequenceEntryWireSchema = z.object({
  aa_string: z.string(),
  control: z.boolean().optional(),
  name: z.string().nullable().optional(),
  metadata: z.unknown().optional(),
})
export type SequenceEntryWire = z.infer<typeof SequenceEntryWireSchema>

// components.schemas.AffinityReplicate — `fit_quality`/`confidence` are
// declared in the snapshot as plain `string|null` (not enums); the mapper
// narrows them defensively rather than the schema rejecting on drift.
export const AffinityReplicateWireSchema = z.object({
  replicate: z.number().int(),
  binding: z.string().nullable().optional(),
  binding_strength: z.string().nullable().optional(),
  confidence: z.string().nullable().optional(),
  expression: z.string().nullable().optional(),
  fit_quality: z.string().nullable().optional(),
  kd: z.number().nullable().optional(),
  kd_app: KineticIntervalWireSchema.nullable().optional(),
  koff: z.number().nullable().optional(),
  koff_1to1: KineticIntervalWireSchema.nullable().optional(),
  koff_method: z.string().nullable().optional(),
  kon: z.number().nullable().optional(),
  kon_1to1: KineticIntervalWireSchema.nullable().optional(),
  kon_method: z.string().nullable().optional(),
  method: z.string().nullable().optional(),
  rmse_max_signal_pct: z.number().nullable().optional(),
})
export type AffinityReplicateWire = z.infer<typeof AffinityReplicateWireSchema>

// components.schemas.AffinityResult
export const AffinityResultWireSchema = z.object({
  sequence: SequenceEntryWireSchema,
  kd_units: z.string(),
  binding: z.string().nullable().optional(),
  binding_strength: z.string(),
  binding_model: z.array(z.string()).nullable().optional(),
  concentration_display: z.string().nullable().optional(),
  concentration_value: z.number().nullable().optional(),
  expression: z.string().nullable().optional(),
  fit_quality: z.string().nullable().optional(),
  kd_app: KineticIntervalWireSchema.nullable().optional(),
  kd_log_std: z.number().nullable().optional(),
  kd_mean: z.number().nullable().optional(),
  koff_1to1: KineticIntervalWireSchema.nullable().optional(),
  koff_log_std: z.number().nullable().optional(),
  koff_mean: z.number().nullable().optional(),
  kon_1to1: KineticIntervalWireSchema.nullable().optional(),
  kon_log_std: z.number().nullable().optional(),
  kon_mean: z.number().nullable().optional(),
  method: z.array(z.string()).nullable().optional(),
  performance: z.record(z.string(), z.string().nullable()),
  place: z.number().int().nullable().optional(),
  positive_control: z.boolean(),
  replicates: z.array(AffinityReplicateWireSchema),
  rmse_max_signal_pct: z.number().nullable().optional(),
  target: TargetReferenceWireSchema.nullable().optional(),
})
export type AffinityResultWire = z.infer<typeof AffinityResultWireSchema>
