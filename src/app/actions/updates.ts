'use server'
import { getSharedDb } from '@/infrastructure/db/client'
import { ingestUpdate } from '@/application/ingestUpdate'
import { refreshStatus } from '@/application/refreshStatus'
import { buildFoundryClient } from '@/adapters/foundry/factory'
import { getUpdates } from '@/infrastructure/repositories'
import { signedUpdate } from '../../../fixtures/updates'
import { env } from '@/infrastructure/config/env'
const DELIVERY = 'D1'
function quote(experimentId: string, deliveryId: string) {
  return signedUpdate({ experimentId, experimentCode: 'EXP-DEMO', name: 'Quote sent', description: 'A quote was prepared for review.', updateType: 'quote' }, env.webhookSecret, deliveryId)
}
export async function replayValidUpdateAction(experimentId: string) {
  const u = quote(experimentId, DELIVERY)
  const res = ingestUpdate(getSharedDb(), { rawBody: u.rawBody, headers: u.headers, secret: env.webhookSecret })
  return { ...res, updates: getUpdates(getSharedDb(), experimentId) }
}
export async function replayDuplicateUpdateAction(experimentId: string) {
  const u = quote(experimentId, DELIVERY)
  const res = ingestUpdate(getSharedDb(), { rawBody: u.rawBody, headers: u.headers, secret: env.webhookSecret })
  return { ...res, updates: getUpdates(getSharedDb(), experimentId) }
}
export async function replayInvalidUpdateAction(experimentId: string) {
  const u = quote(experimentId, 'D2')
  return ingestUpdate(getSharedDb(), { rawBody: u.rawBody, headers: { ...u.headers, 'X-Adaptyv-Signature': 'sha256=deadbeef' }, secret: env.webhookSecret })
}
export async function refreshStatusAction(experimentId: string) {
  return refreshStatus(getSharedDb(), buildFoundryClient(), experimentId)
}
export async function getTimelineAction(experimentId: string) {
  return { updates: getUpdates(getSharedDb(), experimentId) }
}
