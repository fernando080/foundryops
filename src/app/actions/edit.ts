'use server'
// Presentation/composition root helper for the EDIT -> INVALIDATE -> REISSUE
// approval flow (Task 2.5). `prepareRequestAction` (application/estimate +
// domain/payload/canonical) always re-reads `replicates` from the persisted
// intent row, so an in-place edit needs to land there first; this action is
// the narrow, deterministic write path for that single field. It never
// touches the payload/hash/approval tables directly — the caller must follow
// up with `prepareRequestAction` to regenerate the authoritative payload and
// hash from the updated intent.
import { getSharedDb } from '@/infrastructure/db/client'
import { getRequest, upsertRequest } from '@/infrastructure/repositories'
import { ValidatedAffinityIntentSchema } from '@/domain/schemas'

export async function updateReplicatesAction(requestId: string, replicates: number): Promise<{ ok: boolean; reason?: string }> {
  if (!Number.isInteger(replicates) || replicates < 1) return { ok: false, reason: 'INVALID_REPLICATES' }
  const db = getSharedDb()
  const req = getRequest(db, requestId)
  if (!req || !req.intentJson || !req.sequencesJson) return { ok: false, reason: 'REQUEST_NOT_FOUND' }
  const intent = ValidatedAffinityIntentSchema.parse(JSON.parse(req.intentJson))
  const updated = { ...intent, replicates }
  upsertRequest(db, {
    id: requestId,
    intentJson: JSON.stringify(updated),
    sequencesJson: req.sequencesJson,
    requestState: req.requestState,
  })
  return { ok: true }
}
