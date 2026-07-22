'use server'
import { getSharedDb } from '@/infrastructure/db/client'
import { getRequest, setRequestPayload, setRequestState } from '@/infrastructure/repositories'
import { buildFoundryClient } from '@/adapters/foundry/factory'
import { estimate } from '@/application/estimate'
import { hashDraftPayload } from '@/domain/payload/canonical'
import { ValidatedAffinityIntentSchema, SequenceSetSchema, type DraftPayload } from '@/domain/schemas'
import { CANONICALIZER_VERSION } from '@/domain/constants'
import { env } from '@/infrastructure/config/env'
export async function prepareRequestAction(requestId: string, targetId: string, selectedCandidateIds: string[]): Promise<{ ok: boolean; payloadHash?: string; version?: number; withinBudget?: boolean; totalMinor?: number; reason?: string }> {
  const db = getSharedDb(); const req = getRequest(db, requestId)
  if (!req || !req.intentJson || !req.sequencesJson) return { ok: false, reason: 'REQUEST_NOT_FOUND' }
  const intent = ValidatedAffinityIntentSchema.parse(JSON.parse(req.intentJson))
  const seqSet = SequenceSetSchema.parse(JSON.parse(req.sequencesJson))
  const selected = seqSet.sequences.filter((s) => selectedCandidateIds.includes(s.id))
  const cost = await estimate(buildFoundryClient(), selected.length, intent.budget?.amountMinor ?? null)
  const version = (req.payloadVersion ?? 0) + 1
  const payload: DraftPayload = { method: 'bli', experimentType: 'affinity', targetId,
    sequences: selected.map((s) => ({ id: s.id, residues: s.residues })), concentrations: intent.concentrations, replicates: intent.replicates,
    costTotalMinor: cost.totalMinor, currency: cost.currency, environment: env.foundryMode, operation: 'create_draft', canonicalizerVersion: CANONICALIZER_VERSION, version }
  const payloadHash = hashDraftPayload(payload)
  setRequestPayload(db, requestId, { payloadJson: JSON.stringify(payload), payloadHash, payloadVersion: version })
  const ready = Boolean(targetId) && cost.withinBudget && selected.length > 0
  setRequestState(db, requestId, ready ? 'READY_FOR_APPROVAL' : 'ESTIMATED')
  return { ok: true, payloadHash, version, withinBudget: cost.withinBudget, totalMinor: cost.totalMinor }
}
