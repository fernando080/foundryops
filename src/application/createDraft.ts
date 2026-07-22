import type { DraftIdGenerator } from './ports'
import { DraftPayloadSchema, type Approval } from '@/domain/schemas'
import { hashDraftPayload } from '@/domain/payload/canonical'
import { approvalStatusFor } from '@/domain/approval/rules'
import { getRequest, loadApproval, consumeApproval, insertDraftOperationOnce, getDraftOperation, setRequestState, appendEvent } from '@/infrastructure/repositories'
import type { Db } from '@/infrastructure/db/client'
export function createDraftUseCase(db: Db, idGen: DraftIdGenerator, input: { requestId: string; approvalId: string; nowIso: string }): { ok: boolean; experimentId?: string; reason?: string } {
  const tx = db.transaction((): { ok: boolean; experimentId?: string; reason?: string } => {
    const req = getRequest(db, input.requestId)
    if (!req || req.requestState !== 'READY_FOR_APPROVAL' || !req.payloadJson) return { ok: false, reason: 'REQUEST_NOT_READY' }
    const payload = DraftPayloadSchema.parse(JSON.parse(req.payloadJson))
    const apRow = loadApproval(db, input.approvalId)
    if (!apRow) return { ok: false, reason: 'APPROVAL_NOT_FOUND' }
    const status = approvalStatusFor(apRow as unknown as Approval, payload, input.nowIso, input.requestId)
    if (status !== 'valid') return { ok: false, reason: `APPROVAL_${status.toUpperCase()}` }
    if (!consumeApproval(db, input.approvalId, input.nowIso)) return { ok: false, reason: 'APPROVAL_NOT_CONSUMABLE' }
    const operationKey = `${input.requestId}::${payload.operation}::${hashDraftPayload(payload)}`
    const experimentId = idGen.idFor(operationKey)
    insertDraftOperationOnce(db, operationKey, { experimentId, requestId: input.requestId })
    const stored = getDraftOperation(db, operationKey)!.experimentId
    setRequestState(db, input.requestId, 'DRAFT_CREATED')
    appendEvent(db, { kind: 'draft_created', detail: stored, at: input.nowIso })
    return { ok: true, experimentId: stored }
  })
  return tx()
}
