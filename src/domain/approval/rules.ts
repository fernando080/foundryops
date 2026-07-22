import type { Approval, DraftPayload } from '@/domain/schemas'
import { hashDraftPayload } from '@/domain/payload/canonical'
export function approvalStatusFor(a: Approval, p: DraftPayload, nowIso: string, requestId: string): 'valid' | 'expired' | 'invalidated' {
  if (a.status !== 'valid') return 'invalidated'
  if (a.requestId !== requestId) return 'invalidated'
  if (a.operation !== p.operation) return 'invalidated'
  if (a.environment !== p.environment) return 'invalidated'
  if (a.payloadVersion !== p.version) return 'invalidated'
  if (a.costSnapshotMinor !== p.costTotalMinor) return 'invalidated'
  if (a.payloadHash !== hashDraftPayload(p)) return 'invalidated'
  if (new Date(nowIso).getTime() > new Date(a.expiresAt).getTime()) return 'expired'
  return 'valid'
}
