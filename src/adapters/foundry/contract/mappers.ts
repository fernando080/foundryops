import type { CostEstimate, CostLineItem, ResultRecord, Target } from '@/domain/schemas'
import { applyBudget } from '@/domain/cost/budget'
import type {
  AffinityResultWire,
  CostEstimateResponseWire,
  CreateExpResponseWire,
  TargetListItemWire,
} from './schemas'

// ---------------------------------------------------------------------------
// WIRE → domain mappers — Task 5.3
//
// Deterministic, side-effect-free. Each mapper's output is asserted (in
// mappers.test.ts) to parse against the corresponding domain Zod schema —
// that parse is the actual contract proof, not this file.
// ---------------------------------------------------------------------------

const FIT_QUALITIES = new Set(['good', 'medium', 'poor'])
const CONFIDENCES = new Set(['high', 'medium', 'low'])

function narrowFitQuality(v: string | null | undefined): 'good' | 'medium' | 'poor' | null {
  return v != null && FIT_QUALITIES.has(v) ? (v as 'good' | 'medium' | 'poor') : null
}

function narrowConfidence(v: string | null | undefined): 'high' | 'medium' | 'low' | null {
  return v != null && CONFIDENCES.has(v) ? (v as 'high' | 'medium' | 'low') : null
}

// (1) GET /api/v1/targets item → domain Target
//
// ASSUMPTION: `aliases`/`organism` only exist under the wire's `details`
// block, which the snapshot documents as populated only when the caller
// passes `?detailed=true` (list) or on the single-target detail endpoint.
// When `details` is absent, this mapper defaults aliases to `[]`, organism
// to `'unknown'`, and uniprotId to `''` (uniprot_id is independently
// nullable — ~18% of targets, mostly viral, have none per the snapshot).
// The real HTTP client should call the targets endpoint with
// `detailed=true` for target-resolution use to avoid these defaults.
export function mapTarget(wire: TargetListItemWire): Target {
  return {
    foundryTargetId: wire.id,
    name: wire.name,
    aliases: wire.details?.synonyms ?? [],
    organism: wire.details?.organism ?? 'unknown',
    uniprotId: wire.uniprot_id ?? '',
  }
}

// (2) POST /api/v1/experiments/cost-estimate response → domain CostEstimate
//
// ASSUMPTION: the wire response has no quote/estimate identifier field at
// all (`cost-estimate` is explicitly documented as a preview that "does not
// create an experiment"). `foundryQuoteRef` is synthesized from
// `pricing_version` (e.g. "v1_2026-01-20") as the closest available stable
// reference; a real quote id only exists after `/quotes` or `/experiments`.
// ASSUMPTION: the wire response has no currency field — all `_cents`
// amounts are implicitly USD per the snapshot's cost-model description, so
// `currency` is hardcoded to `'USD'` (matches MockFoundryClient's existing
// hardcode).
export function mapCostEstimate(
  wire: CostEstimateResponseWire,
  budgetMinor: number | null
): CostEstimate {
  if (wire.breakdown) {
    const { assay, materials, pricing_version, total_cents } = wire.breakdown
    const lineItems: CostLineItem[] = [
      { label: `Assay (${assay.experiment_type})`, amountMinor: assay.subtotal_cents },
    ]
    if (materials) {
      lineItems.push({ label: `Materials (${materials.target.name})`, amountMinor: materials.subtotal_cents })
    }
    return {
      foundryQuoteRef: pricing_version,
      lineItems,
      totalMinor: total_cents,
      currency: 'USD',
      ...applyBudget(total_cents, budgetMinor),
    }
  }

  if (wire.incomplete) {
    const { assay, materials_unavailable, pricing_version, total_cents } = wire.incomplete
    // ASSUMPTION: when materials pricing is unavailable, `total_cents` is
    // documented only as `"default": null` with no `type` in the snapshot.
    // Fall back to the always-calculable assay subtotal (materials cost is
    // genuinely unknown, not zero — reflected via the line item below).
    const totalMinor = total_cents ?? assay.subtotal_cents
    const lineItems: CostLineItem[] = [
      { label: `Assay (${assay.experiment_type})`, amountMinor: assay.subtotal_cents },
      { label: `Materials unavailable: ${materials_unavailable.reason}`, amountMinor: 0 },
    ]
    return {
      foundryQuoteRef: pricing_version,
      lineItems,
      totalMinor,
      currency: 'USD',
      ...applyBudget(totalMinor, budgetMinor),
    }
  }

  throw new Error('Foundry cost-estimate response has neither `breakdown` nor `incomplete`')
}

// (3) POST /api/v1/experiments response → experiment id
export function mapExperimentId(wire: CreateExpResponseWire): string {
  return wire.experiment_id
}

// (4) AffinityResult wire item → domain ResultRecord
//
// DEVIATION FROM TASK TEXT: takes `experimentId` as a second argument.
// AffinityResult (per the snapshot) carries no `experiment_id` field of its
// own — that id lives on the enclosing `ResultInfo` the results endpoint
// returns. The real client already knows `experimentId` (it is the
// `FoundryClient.getResults(experimentId)` input), so it is threaded
// through here rather than fabricated.
//
// ASSUMPTION: `candidateId` comes from `sequence.name`, which is nullable
// in the snapshot; falls back to the literal `'unknown-candidate'` when
// absent (the AffinityResult item carries no other unique identifier).
// ASSUMPTION: `confidence` is per-replicate only in the snapshot (no
// top-level `AffinityResult.confidence` field exists, despite the task
// description mentioning it alongside top-level fields) — taken from the
// first replicate's `confidence`.
// ASSUMPTION: `controlOutcome` has no direct wire equivalent. The snapshot's
// `positive_control` flags whether *this row* is the control, and
// `performance` gives qualitative better/worse comparisons vs named
// controls — neither is a pass/fail signal for "did the experiment's
// control work". Conservatively mapped to `'na'` (never fabricates
// `'fail'`; QC's `classifyCandidate` only treats `'fail'` as a hard stop).
// ASSUMPTION: `measurements` (raw per-concentration response curve points)
// isn't part of this response shape — AffinityResult/AffinityReplicate only
// carry fitted aggregates, not the underlying sensorgram points — so it is
// mapped to `[]`.
// Units: `kon_1to1`/`koff_1to1`/`kd_mean` are copied as-is (no scaling);
// per the snapshot they are already M⁻¹s⁻¹ / s⁻¹ / M respectively, matching
// the magnitudes already used by the domain's own demo fixtures.
export function mapAffinityResult(wire: AffinityResultWire, experimentId: string): ResultRecord {
  const kds = wire.replicates
    .map(r => r.kd)
    .filter((v): v is number => v !== null && v !== undefined)
  const firstConfidence = wire.replicates[0]?.confidence ?? null

  return {
    experimentId,
    candidateId: wire.sequence.name ?? 'unknown-candidate',
    replicateKdsM: kds.length > 0 ? kds : null,
    konPerMs: wire.kon_1to1?.value ?? null,
    koffPerS: wire.koff_1to1?.value ?? null,
    kdMeanM: wire.kd_mean ?? null,
    rmseMaxSignalPct: wire.rmse_max_signal_pct ?? null,
    fitQualityReported: narrowFitQuality(wire.fit_quality),
    confidence: narrowConfidence(firstConfidence),
    controlOutcome: 'na',
    measurements: [],
  }
}
