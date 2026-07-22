'use server'
import { getSharedDb } from '@/infrastructure/db/client'
import { getRequest, insertApproval, setRequestState } from '@/infrastructure/repositories'
import { buildApproval } from '@/application/approval'
import { createDraftUseCase } from '@/application/createDraft'
import { buildDraftIdGenerator } from '@/adapters/foundry/factory'
import { DraftPayloadSchema } from '@/domain/schemas'

// Requests reach here either freshly estimated (already transitioned to
// READY_FOR_APPROVAL by prepareRequestAction) or REMEDIATED — the state
// editReplicatesUseCase leaves behind after an atomic edit invalidates the
// prior approval. Both have a valid, current persisted payload; a
// DRAFT_CREATED request does not belong in this set, so it is rejected.
const REISSUABLE_STATES = new Set(['READY_FOR_APPROVAL', 'REMEDIATED'])

export async function requestApprovalAction(requestId: string): Promise<{ ok: boolean; approvalId?: string; payloadHash?: string; reason?: string }> {
  const db = getSharedDb(); const req = getRequest(db, requestId)
  if (!req || !REISSUABLE_STATES.has(req.requestState) || !req.payloadJson) return { ok: false, reason: 'NOT_READY' }
  const payload = DraftPayloadSchema.parse(JSON.parse(req.payloadJson))
  const approval = buildApproval(payload, { actor: 'operator', issuedAt: new Date().toISOString(), ttlMinutes: 15, requestId })
  // Issue the fresh approval and (re)confirm READY_FOR_APPROVAL atomically —
  // a REMEDIATED request must never be observable as "approved" without a
  // matching valid approval row, and vice versa.
  db.transaction(() => {
    insertApproval(db, approval)
    setRequestState(db, requestId, 'READY_FOR_APPROVAL')
  })()
  return { ok: true, approvalId: approval.id, payloadHash: approval.payloadHash }
}
export async function createDraftAction(requestId: string, approvalId: string): Promise<{ ok: boolean; experimentId?: string; reason?: string }> {
  return createDraftUseCase(getSharedDb(), buildDraftIdGenerator(), { requestId, approvalId, nowIso: new Date().toISOString() })
}
