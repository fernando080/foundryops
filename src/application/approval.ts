import type { DraftPayload } from '@/domain/schemas'
import { hashDraftPayload } from '@/domain/payload/canonical'
export function buildApproval(payload: DraftPayload, opts: { actor: string; issuedAt: string; ttlMinutes: number; requestId: string }) {
  const issued = new Date(opts.issuedAt).getTime()
  return { id: `ap_${opts.requestId}_${payload.version}`, requestId: opts.requestId, operation: payload.operation, environment: payload.environment,
    payloadHash: hashDraftPayload(payload), payloadVersion: payload.version, costSnapshotMinor: payload.costTotalMinor,
    actor: opts.actor, issuedAt: opts.issuedAt, expiresAt: new Date(issued + opts.ttlMinutes * 60000).toISOString(), status: 'valid' as const }
}
