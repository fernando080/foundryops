'use server'
// Release-polish Item 5: the approval card claims "this is the exact
// payload Foundry will receive" but only ever rendered a summary. This
// action loads the persisted, server-side DraftPayload for a request and
// maps it to a RESIDUE-FREE view — candidate identity and count only, never
// `sequences[].residues` — so the UI can show the literal exact-payload
// fields without ever putting raw sequence data on the wire to the client.
import { getSharedDb } from '@/infrastructure/db/client'
import { getRequest } from '@/infrastructure/repositories'
import { DraftPayloadSchema } from '@/domain/schemas'

export interface ApprovalPayloadView {
  method: string
  experimentType: string
  targetId: string
  candidateIds: string[]
  candidateCount: number
  concentrations: number[]
  replicates: number
  costTotalMinor: number
  currency: string
  environment: string
  operation: string
  version: number
  canonicalHash?: string
}

export async function getApprovalPayloadViewAction(requestId: string): Promise<{ ok: boolean; view?: ApprovalPayloadView; reason?: string }> {
  const db = getSharedDb()
  const req = getRequest(db, requestId)
  if (!req || !req.payloadJson) return { ok: false, reason: 'NOT_READY' }
  const payload = DraftPayloadSchema.parse(JSON.parse(req.payloadJson))
  const view: ApprovalPayloadView = {
    method: payload.method,
    experimentType: payload.experimentType,
    targetId: payload.targetId,
    candidateIds: payload.sequences.map((s) => s.id),
    candidateCount: payload.sequences.length,
    concentrations: payload.concentrations,
    replicates: payload.replicates,
    costTotalMinor: payload.costTotalMinor,
    currency: payload.currency,
    environment: payload.environment,
    operation: payload.operation,
    version: payload.version,
    ...(payload.canonicalHash !== undefined ? { canonicalHash: payload.canonicalHash } : {}),
  }
  return { ok: true, view }
}
