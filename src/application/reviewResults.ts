import type { FoundryClient } from './ports'
import { classifyCandidate } from '@/domain/results/qc'
import { buildEvidenceBundle } from '@/domain/evidence/bundle'
export async function reviewResults(foundry: FoundryClient, experimentId: string) {
  const records = await foundry.getResults(experimentId)
  const pairs = records.map((record) => ({ record, qc: classifyCandidate(record) }))
  return { pairs, bundle: buildEvidenceBundle(experimentId, pairs) }
}
