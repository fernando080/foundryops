import { DraftPayloadSchema, ValidatedAffinityIntentSchema, type DraftPayload } from '@/domain/schemas'
import { hashDraftPayload } from '@/domain/payload/canonical'
import { getRequest, setRequestIntent, setRequestPayload, invalidateApprovals, setRequestState, appendEvent } from '@/infrastructure/repositories'
import type { Db } from '@/infrastructure/db/client'
type EditResult = { ok: boolean; version?: number; payloadHash?: string; reason?: string }
export function editReplicatesUseCase(db: Db, input: { requestId: string; expectedVersion: number; newReplicates: number; nowIso: string }, hooks?: { afterWrites?: () => void }): EditResult {
  try {
    return db.transaction((): EditResult => {
      const req = getRequest(db, input.requestId)
      if (!req || !req.payloadJson || req.payloadVersion === null) return { ok: false, reason: 'REQUEST_NOT_FOUND' }
      if (req.payloadVersion !== input.expectedVersion) return { ok: false, reason: 'STALE_VERSION' }
      if (!Number.isInteger(input.newReplicates) || input.newReplicates < 1 || input.newReplicates > 10) return { ok: false, reason: 'INVALID_REPLICATES' }
      if (req.intentJson) { const intent = ValidatedAffinityIntentSchema.parse(JSON.parse(req.intentJson)); intent.replicates = input.newReplicates; setRequestIntent(db, input.requestId, JSON.stringify(intent)) }
      const payload = DraftPayloadSchema.parse(JSON.parse(req.payloadJson))
      const version = req.payloadVersion + 1
      const newPayload: DraftPayload = { ...payload, replicates: input.newReplicates, version }
      const payloadHash = hashDraftPayload(newPayload)
      setRequestPayload(db, input.requestId, { payloadJson: JSON.stringify(newPayload), payloadHash, payloadVersion: version })
      invalidateApprovals(db, input.requestId)
      setRequestState(db, input.requestId, 'REMEDIATED')
      appendEvent(db, { kind: 'config_edit', detail: `replicates=${input.newReplicates};v=${version}`, at: input.nowIso })
      hooks?.afterWrites?.()
      return { ok: true, version, payloadHash }
    })()
  } catch { return { ok: false, reason: 'ROLLED_BACK' } }
}
