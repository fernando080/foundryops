'use server'
// Presentation/composition root helper for the atomic EDIT -> REGENERATE ->
// INVALIDATE flow (release-polish Item 3). Config edit, payload
// regeneration, and approval invalidation are ONE server-side transaction
// (`editReplicatesUseCase`) so a request can never be observed in
// `READY_FOR_APPROVAL` with a stale payload and a still-valid approval
// between two separate calls.
import { getSharedDb } from '@/infrastructure/db/client'
import { editReplicatesUseCase } from '@/application/editConfig'

export async function editReplicatesAction(
  requestId: string,
  expectedVersion: number,
  newReplicates: number,
): Promise<{ ok: boolean; version?: number; payloadHash?: string; reason?: string }> {
  return editReplicatesUseCase(getSharedDb(), { requestId, expectedVersion, newReplicates, nowIso: new Date().toISOString() })
}
