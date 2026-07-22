import type { RawExtractedIntent, ValidatedAffinityIntent, PreflightFinding } from '@/domain/schemas'
const DEFAULT_CONC = [1e-7, 3e-8, 1e-8, 3e-9, 1e-9, 4e-10]
export function validateIntent(raw: RawExtractedIntent): { ok: true; intent: ValidatedAffinityIntent } | { ok: false; finding: PreflightFinding } {
  if (raw.experimentType !== 'affinity' || raw.method !== 'bli') {
    return { ok: false, finding: { code: 'UNSUPPORTED_EXPERIMENT_TYPE', severity: 'error',
      message: `Only affinity/BLI is supported in this MVP; got ${raw.experimentType}/${raw.method}.`,
      evidenceLocation: { sequenceId: null, position: null }, remediation: 'Resubmit as a BLI affinity characterization.', blocksProgression: true } }
  }
  const assayDefaultsApplied = raw.concentrations === null || raw.replicates === null
  return { ok: true, intent: { experimentType: 'affinity', method: 'bli', targetQuery: raw.targetQuery,
    requestedCount: raw.requestedCount, concentrations: raw.concentrations ?? DEFAULT_CONC, replicates: raw.replicates ?? 3,
    budget: raw.budget, approvalRequired: true, assayDefaultsApplied, fields: raw.fields, ambiguities: raw.ambiguities } }
}
