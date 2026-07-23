import { verifyUpdateSignature } from '@/domain/webhook/verify'
import { crossCheckHeaders } from '@/domain/webhook/envelope'
import { FoundryUpdateWireSchema } from '@/domain/webhook/wire'
import { insertUpdateOnce, appendEvent } from '@/infrastructure/repositories'
import type { Db } from '@/infrastructure/db/client'
export function ingestUpdate(db: Db, input: { rawBody: string; headers: Record<string, string>; secret: string }): { processingStatus: string } {
  const audit = (detail: string) => appendEvent(db, { kind: 'update', detail, at: 'na' })
  if (!verifyUpdateSignature(input.rawBody, input.headers['X-Adaptyv-Signature'] ?? null, input.secret)) { audit('rejected_signature'); return { processingStatus: 'rejected_signature' } }
  let parsed: unknown
  try { parsed = JSON.parse(input.rawBody) } catch { audit('dead_letter'); return { processingStatus: 'dead_letter' } }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) { audit('rejected_schema'); return { processingStatus: 'rejected_schema' } }
  if (!crossCheckHeaders(input.headers, parsed)) { audit('rejected_header_mismatch'); return { processingStatus: 'rejected_header_mismatch' } }
  const result = FoundryUpdateWireSchema.safeParse(parsed)
  if (!result.success) { audit('rejected_schema'); return { processingStatus: 'rejected_schema' } }
  const wire = result.data
  const fresh = insertUpdateOnce(db, wire.delivery_id, { experimentId: wire.data.experiment_id, updateType: wire.data.update_type, name: wire.data.name, description: wire.data.description, raw: input.rawBody })
  if (!fresh) return { processingStatus: 'duplicate' }
  audit('accepted')
  return { processingStatus: 'accepted' }
}
