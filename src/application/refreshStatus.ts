import type { FoundryClient } from './ports'
import { mapWireStatus } from '@/domain/status/map'
import { decideTransition } from '@/domain/webhook/transition'
import { getExperimentStatusRow, setExperimentStatus, appendEvent } from '@/infrastructure/repositories'
import type { Db } from '@/infrastructure/db/client'

export async function refreshStatus(db: Db, foundry: FoundryClient, experimentId: string): Promise<{ status: string | null; applied: boolean }> {
  const { statusWire } = await foundry.getExperimentStatus(experimentId)
  const mapped = mapWireStatus(statusWire)

  if (!mapped) {
    appendEvent(db, { kind: 'status', detail: `invalid_wire:${statusWire}`, at: 'na' })
    return { status: null, applied: false }
  }

  const current = getExperimentStatusRow(db, experimentId)
  const applied = decideTransition(current, mapped) === 'apply'
  if (applied) setExperimentStatus(db, experimentId, mapped)

  return { status: mapped, applied }
}
