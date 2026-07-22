import { z } from 'zod'

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------
// "Money is integer minor units (cents)" — §6 class legend. Applied to every
// Money-typed field (budget, *Minor fields, amountMinor).

export const MoneyMinorSchema = z.number().int()

// R2 baseline (commit 61dc086) shape, restored verbatim.
export const SequenceSourceLocationSchema = z.object({
  file: z.string(),
  lineStart: z.number().int(),
  lineEnd: z.number().int(),
})
export type SequenceSourceLocation = z.infer<typeof SequenceSourceLocationSchema>

// ---------------------------------------------------------------------------
// Intent (LLM-authored, re-validated) — §6, §9
// ---------------------------------------------------------------------------

// R2 baseline (commit 61dc086) shape, restored verbatim: an extracted field
// is a name/value/confidence/sourceSpan record, not a bare string.
export const ExtractedFieldSchema = z.object({
  name: z.string(),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  confidence: z.number().min(0).max(1),
  sourceSpan: z.object({ start: z.number().int(), end: z.number().int() }).nullable(),
})
export type ExtractedField = z.infer<typeof ExtractedFieldSchema>

export const AmbiguitySchema = z.object({
  field: z.string(),
  reason: z.string(),
  options: z.array(z.string()).optional(),
})
export type Ambiguity = z.infer<typeof AmbiguitySchema>

export const RawExtractedIntentSchema = z.object({
  experimentType: z.string(),
  method: z.string(),
  targetQuery: z.string().nullable(),
  requestedCount: z.number().int().nullable(),
  concentrations: z.array(z.number()).nullable(),
  replicates: z.number().int().nullable(),
  budget: MoneyMinorSchema.nullable(),
  fields: z.array(ExtractedFieldSchema),
  ambiguities: z.array(AmbiguitySchema),
})
export type RawExtractedIntent = z.infer<typeof RawExtractedIntentSchema>

export const ValidatedAffinityIntentSchema = z.object({
  experimentType: z.literal('affinity'),
  method: z.literal('bli'),
  targetQuery: z.string().nullable(),
  requestedCount: z.number().int().nullable(),
  concentrations: z.array(z.number()),
  replicates: z.number().int(),
  budget: MoneyMinorSchema.nullable(),
  approvalRequired: z.literal(true),
  assayDefaultsApplied: z.boolean(),
  fields: z.array(ExtractedFieldSchema),
  ambiguities: z.array(AmbiguitySchema),
})
export type ValidatedAffinityIntent = z.infer<typeof ValidatedAffinityIntentSchema>

// ---------------------------------------------------------------------------
// Sequences (untrusted input; never sent to the LLM) — §6
// ---------------------------------------------------------------------------

export const SequenceSchema = z.object({
  id: z.string(),
  rawHeader: z.string(),
  residues: z.string(),
  chains: z.array(z.string()),
  length: z.number().int(),
  normHash: z.string(),
  sourceLoc: SequenceSourceLocationSchema,
})
export type Sequence = z.infer<typeof SequenceSchema>

export const SequenceSetSchema = z.object({
  sequences: z.array(SequenceSchema),
  acceptedIds: z.array(z.string()),
  rejectedIds: z.array(z.string()),
})
export type SequenceSet = z.infer<typeof SequenceSetSchema>

// ---------------------------------------------------------------------------
// Preflight — §6, §7a
// ---------------------------------------------------------------------------

export const PreflightEvidenceLocationSchema = z.object({
  sequenceId: z.string().nullable(),
  position: z.number().int().nullable(),
})
export type PreflightEvidenceLocation = z.infer<typeof PreflightEvidenceLocationSchema>

export const PreflightFindingSchema = z.object({
  code: z.string(),
  severity: z.enum(['error', 'warning', 'info']),
  message: z.string(),
  evidenceLocation: PreflightEvidenceLocationSchema,
  remediation: z.string(),
  blocksProgression: z.boolean(),
  duplicateOf: z.string().optional(),
})
export type PreflightFinding = z.infer<typeof PreflightFindingSchema>

// ---------------------------------------------------------------------------
// Target resolution — §6, §12 (material intake ambiguity)
// ---------------------------------------------------------------------------

export const TargetSchema = z.object({
  foundryTargetId: z.string(),
  name: z.string(),
  aliases: z.array(z.string()),
  organism: z.string(),
  uniprotId: z.string(),
})
export type Target = z.infer<typeof TargetSchema>

export const TargetResolutionSchema = z.object({
  query: z.string(),
  chosen: TargetSchema.nullable(),
  alternatives: z.array(TargetSchema),
  status: z.enum(['resolved', 'ambiguous', 'missing']),
})
export type TargetResolution = z.infer<typeof TargetResolutionSchema>

// ---------------------------------------------------------------------------
// Cost estimate — §6, §12 (cost model)
// ---------------------------------------------------------------------------

export const CostLineItemSchema = z.object({
  label: z.string(),
  amountMinor: z.number().int(),
})
export type CostLineItem = z.infer<typeof CostLineItemSchema>

export const CostEstimateSchema = z.object({
  foundryQuoteRef: z.string(),
  lineItems: z.array(CostLineItemSchema),
  totalMinor: z.number().int(),
  currency: z.string().length(3),
  withinBudget: z.boolean(),
  overageMinor: z.number().int(),
  maxWithinBudget: z.number().int().nullable(),
})
export type CostEstimate = z.infer<typeof CostEstimateSchema>

// ---------------------------------------------------------------------------
// Draft payload + canonicalization inputs — §6, §7c
// ---------------------------------------------------------------------------

export const EnvironmentSchema = z.enum(['mock', 'sandbox', 'live'])
export type Environment = z.infer<typeof EnvironmentSchema>

// R2 baseline (commit 61dc086) shape, restored verbatim.
export const OperationSchema = z.enum(['create_draft', 'confirm_experiment'])
export type Operation = z.infer<typeof OperationSchema>

export const DraftPayloadSequenceRefSchema = z.object({
  id: z.string(),
  residues: z.string(),
})
export type DraftPayloadSequenceRef = z.infer<typeof DraftPayloadSequenceRefSchema>

export const DraftPayloadSchema = z.object({
  // semantic (hashed)
  method: z.literal('bli'),
  experimentType: z.literal('affinity'),
  targetId: z.string(),
  sequences: z.array(DraftPayloadSequenceRefSchema),
  concentrations: z.array(z.number()),
  replicates: z.number().int(),
  costTotalMinor: z.number().int(),
  currency: z.string().length(3),
  environment: EnvironmentSchema,
  operation: OperationSchema,
  canonicalizerVersion: z.string(),
  // volatile (not hashed)
  version: z.number().int(),
  costEstimateRef: z.string().optional(),
  requestId: z.string().optional(),
  canonicalHash: z.string().optional(),
  createdAt: z.string().optional(),
})
export type DraftPayload = z.infer<typeof DraftPayloadSchema>

// ---------------------------------------------------------------------------
// Approval — §6, §7b
// ---------------------------------------------------------------------------

export const ApprovalSchema = z.object({
  id: z.string(),
  requestId: z.string(),
  operation: OperationSchema,
  environment: EnvironmentSchema,
  payloadHash: z.string(),
  payloadVersion: z.number().int(),
  costSnapshotMinor: z.number().int(),
  actor: z.string(),
  issuedAt: z.string(),
  expiresAt: z.string(),
  status: z.enum(['valid', 'consumed', 'expired', 'invalidated']),
  consumedAt: z.string().nullable(),
})
export type Approval = z.infer<typeof ApprovalSchema>

// ---------------------------------------------------------------------------
// Foundry update timeline + experiment status — §6, §7a
// ---------------------------------------------------------------------------

export const FoundryUpdateDataSchema = z.object({
  type: z.literal('experiment.update'),
  experimentId: z.string(),
  experimentCode: z.string(),
  organizationId: z.string(),
  updateId: z.string(),
  name: z.string(),
  description: z.string(),
  updateType: z.string(),
  eta: z.string().nullable(),
  createdAt: z.string(),
})
export type FoundryUpdateData = z.infer<typeof FoundryUpdateDataSchema>

// The webhook carries no experiment status. Do not add status/title/content —
// see §6 (FoundryUpdate row) and R2.1 change log.
export const FoundryUpdateSchema = z.object({
  deliveryId: z.string(),
  event: z.literal('experiment_update'),
  timestamp: z.string(),
  apiVersion: z.string(),
  signatureVerified: z.boolean(),
  data: FoundryUpdateDataSchema,
})
export type FoundryUpdate = z.infer<typeof FoundryUpdateSchema>

export const ExperimentStatusSchema = z.enum([
  'Draft',
  'WaitingForConfirmation',
  'QuoteSent',
  'WaitingForMaterials',
  'InQueue',
  'InProduction',
  'DataAnalysis',
  'InReview',
  'Done',
  'Canceled',
])
export type ExperimentStatus = z.infer<typeof ExperimentStatusSchema>

// ---------------------------------------------------------------------------
// Results — §6 (contract-faithful BLI fields; no non-contract metrics)
// ---------------------------------------------------------------------------

export const MeasurementSchema = z.object({
  candidateId: z.string(),
  concentrationM: z.number(),
  replicateIndex: z.number().int(),
  responseValue: z.number(),
})
export type Measurement = z.infer<typeof MeasurementSchema>

export const ResultRecordSchema = z.object({
  experimentId: z.string(),
  candidateId: z.string(),
  replicateKdsM: z.array(z.number()).nullable(),
  konPerMs: z.number().nullable(),
  koffPerS: z.number().nullable(),
  kdMeanM: z.number().nullable(),
  rmseMaxSignalPct: z.number().nullable(),
  fitQualityReported: z.enum(['good', 'medium', 'poor']).nullable(),
  confidence: z.enum(['high', 'medium', 'low']).nullable(),
  controlOutcome: z.enum(['pass', 'fail', 'na']),
  measurements: z.array(MeasurementSchema),
})
export type ResultRecord = z.infer<typeof ResultRecordSchema>

// ---------------------------------------------------------------------------
// QC — §6, §12 (data quality vs binding outcome, kept as separate fields)
// ---------------------------------------------------------------------------

export const QCResultSchema = z.object({
  candidateId: z.string(),
  qcStatus: z.enum(['pass', 'fail']),
  bindingClass: z.enum([
    'confirmed_binder',
    'apparent_binder_poor_fit',
    'no_detectable_binding',
    'inconclusive_replicate_inconsistent',
    'non_binder',
  ]),
  affinity: z.object({
    kdM: z.number().nullable(),
    ciLowM: z.number().nullable(),
    ciHighM: z.number().nullable(),
  }),
  replicateConsistency: z.object({
    cv: z.number().nullable(),
    consistent: z.boolean(),
  }),
  fitQuality: z.object({
    rmseMaxSignalPct: z.number().nullable(),
    reported: z.enum(['good', 'medium', 'poor']).nullable(),
    pass: z.boolean(),
  }),
  confidence: z.enum(['high', 'medium', 'low']).nullable(),
  controlOutcome: z.enum(['pass', 'fail', 'na']),
  recommendation: z.enum(['follow_up', 'inconclusive', 'drop']),
  appliedThresholds: z.literal('demo-qc-policy@v1'),
  warnings: z.array(z.string()),
})
export type QCResult = z.infer<typeof QCResultSchema>

// ---------------------------------------------------------------------------
// Evidence — §6, §9 (only object the drafting LLM sees)
// ---------------------------------------------------------------------------

export const EvidenceRecordSchema = z.object({
  id: z.string(),
  kind: z.enum([
    'measurement',
    'qc_calculation',
    'control',
    'threshold',
    'classification',
    'approved_recommendation',
  ]),
  valueKind: z.enum(['numeric', 'categorical']),
  numericValue: z.number().nullable(),
  unit: z.string().nullable(),
  categoricalValue: z.string().nullable(),
  displayLabel: z.string(),
  sourceRef: z.string(),
  provenanceChain: z.array(z.string()),
})
export type EvidenceRecord = z.infer<typeof EvidenceRecordSchema>

export const EvidenceBundleSchema = z.object({
  experimentId: z.string(),
  records: z.array(EvidenceRecordSchema),
  summaryStats: z.record(z.string(), z.number()),
})
export type EvidenceBundle = z.infer<typeof EvidenceBundleSchema>

// ---------------------------------------------------------------------------
// Customer draft — §6, §9 (renderer-inserted numbers; fail-closed validation)
// ---------------------------------------------------------------------------

export const CustomerDraftTextSegmentSchema = z.object({
  kind: z.literal('text'),
  text: z.string(),
})
export type CustomerDraftTextSegment = z.infer<typeof CustomerDraftTextSegmentSchema>

export const CustomerDraftEvidenceSegmentSchema = z.object({
  kind: z.literal('evidence'),
  evidenceId: z.string(),
  claimType: z.enum(['confirmed', 'recommendation', 'inconclusive']),
  prefix: z.string(),
  suffix: z.string(),
})
export type CustomerDraftEvidenceSegment = z.infer<typeof CustomerDraftEvidenceSegmentSchema>

export const CustomerDraftSegmentSchema = z.discriminatedUnion('kind', [
  CustomerDraftTextSegmentSchema,
  CustomerDraftEvidenceSegmentSchema,
])
export type CustomerDraftSegment = z.infer<typeof CustomerDraftSegmentSchema>

export const CustomerDraftSchema = z.object({
  segments: z.array(CustomerDraftSegmentSchema),
  generatedBy: z.object({
    adapter: z.string(),
    model: z.string(),
    promptHash: z.string(),
  }),
  status: z.literal('draft'),
})
export type CustomerDraft = z.infer<typeof CustomerDraftSchema>
