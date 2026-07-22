import { verifyUpdateSignature } from '@/domain/webhook/verify'
import { crossCheckHeaders } from '@/domain/webhook/envelope'
import { insertUpdateOnce, appendEvent } from '@/infrastructure/repositories'
import type { Db } from '@/infrastructure/db/client'

export function ingestUpdate(db: Db, input: { rawBody: string; headers: Record<string, string>; secret: string }): { processingStatus: string } {
  if (!verifyUpdateSignature(input.rawBody, input.headers['X-Adaptyv-Signature'] ?? null, input.secret)) {
    appendEvent(db, { kind: 'update', detail: 'rejected_signature', at: 'na' })
    return { processingStatus: 'rejected_signature' }
  }

  let body: any
  try {
    body = JSON.parse(input.rawBody)
  } catch {
    appendEvent(db, { kind: 'update', detail: 'dead_letter', at: 'na' })
    return { processingStatus: 'dead_letter' }
  }

  if (!crossCheckHeaders(input.headers, body)) {
    appendEvent(db, { kind: 'update', detail: 'rejected_header_mismatch', at: 'na' })
    return { processingStatus: 'rejected_header_mismatch' }
  }

  const fresh = insertUpdateOnce(db, body.delivery_id, { experimentId: body.data.experiment_id, updateType: body.data.update_type, name: body.data.name, description: body.data.description, raw: input.rawBody })
  if (!fresh) return { processingStatus: 'duplicate' }

  appendEvent(db, { kind: 'update', detail: 'accepted', at: 'na' })
  return { processingStatus: 'accepted' }
}
