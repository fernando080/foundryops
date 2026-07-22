'use server'
import { getSharedDb } from '@/infrastructure/db/client'
import { getRequest, insertApproval } from '@/infrastructure/repositories'
import { buildApproval } from '@/application/approval'
import { createDraftUseCase } from '@/application/createDraft'
import { buildDraftIdGenerator } from '@/adapters/foundry/factory'
import { DraftPayloadSchema } from '@/domain/schemas'
export async function requestApprovalAction(requestId: string): Promise<{ ok: boolean; approvalId?: string; payloadHash?: string; reason?: string }> {
  const db = getSharedDb(); const req = getRequest(db, requestId)
  if (!req || req.requestState !== 'READY_FOR_APPROVAL' || !req.payloadJson) return { ok: false, reason: 'NOT_READY' }
  const payload = DraftPayloadSchema.parse(JSON.parse(req.payloadJson))
  const approval = buildApproval(payload, { actor: 'operator', issuedAt: new Date().toISOString(), ttlMinutes: 15, requestId })
  insertApproval(db, approval)
  return { ok: true, approvalId: approval.id, payloadHash: approval.payloadHash }
}
export async function createDraftAction(requestId: string, approvalId: string): Promise<{ ok: boolean; experimentId?: string; reason?: string }> {
  return createDraftUseCase(getSharedDb(), buildDraftIdGenerator(), { requestId, approvalId, nowIso: new Date().toISOString() })
}
