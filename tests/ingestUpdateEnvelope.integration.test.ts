import { describe, it, expect, beforeEach } from 'vitest'
import { createHmac } from 'node:crypto'
import { getDb, migrate } from '@/infrastructure/db/client'
import { ingestUpdate } from '@/application/ingestUpdate'
import { getUpdates } from '@/infrastructure/repositories'
const SECRET = 'sec'
function signRaw(bodyObj: unknown, event: string, deliveryId: string) {
  const rawBody = JSON.stringify(bodyObj)
  const sig = 'sha256=' + createHmac('sha256', SECRET).update(rawBody, 'utf8').digest('hex')
  return { rawBody, headers: { 'X-Adaptyv-Event': event, 'X-Adaptyv-Delivery-Id': deliveryId, 'X-Adaptyv-Signature': sig } }
}
const validBody = (over: Record<string, unknown> = {}, dataOver: Record<string, unknown> = {}) => ({
  delivery_id: 'D1', event: 'experiment_update', timestamp: '2026-07-22T12:00:00Z', api_version: '2026-02',
  data: { type: 'experiment.update', experiment_id: 'exp-1', experiment_code: 'EXP-1', organization_id: 'org', update_id: 'u1', name: 'Quote sent', description: 'A quote was prepared.', update_type: 'quote', eta: null, created_at: '2026-07-22T12:00:00Z', ...dataOver }, ...over })
const ingest = (db: ReturnType<typeof getDb>, s: { rawBody: string; headers: Record<string, string> }) => ingestUpdate(db, { rawBody: s.rawBody, headers: s.headers, secret: SECRET })
describe('ingestUpdate — complete envelope validation', () => {
  let db: ReturnType<typeof getDb>
  beforeEach(() => { db = getDb(':memory:'); migrate(db) })
  it('accepts a valid envelope', () => { expect(ingest(db, signRaw(validBody(), 'experiment_update', 'D1')).processingStatus).toBe('accepted') })
  it('dedups a duplicate valid envelope (persisted once)', () => {
    const s = signRaw(validBody(), 'experiment_update', 'D1')
    expect(ingest(db, s).processingStatus).toBe('accepted'); expect(ingest(db, s).processingStatus).toBe('duplicate')
    expect(getUpdates(db, 'exp-1').length).toBe(1) })
  it('rejects a wrong event (schema), audit-only', () => {
    const r = ingest(db, signRaw(validBody({ event: 'other_event' }), 'other_event', 'D1'))
    expect(r.processingStatus).not.toBe('accepted'); expect(getUpdates(db, 'exp-1').length).toBe(0) })
  it('rejects a wrong data.type (schema), audit-only', () => {
    const r = ingest(db, signRaw(validBody({}, { type: 'experiment.created' }), 'experiment_update', 'D1'))
    expect(r.processingStatus).toBe('rejected_schema'); expect(getUpdates(db, 'exp-1').length).toBe(0) })
  it('rejects when any required identifier is missing', () => {
    for (const key of ['experiment_id', 'experiment_code', 'organization_id', 'update_id', 'update_type']) {
      const body = validBody(); delete (body.data as Record<string, unknown>)[key]
      const r = ingest(db, signRaw(body, 'experiment_update', 'D1'))
      expect(r.processingStatus).toBe('rejected_schema')
    }
    expect(getUpdates(db, 'exp-1').length).toBe(0) })
  it('rejects a malformed timestamp and api_version', () => {
    expect(ingest(db, signRaw(validBody({ timestamp: 'not-a-date' }), 'experiment_update', 'D1')).processingStatus).toBe('rejected_schema')
    expect(ingest(db, signRaw(validBody({ api_version: 'bad' }), 'experiment_update', 'D1')).processingStatus).toBe('rejected_schema') })
  it('rejects a header/body mismatch', () => {
    const r = ingest(db, signRaw(validBody(), 'experiment_update', 'D9')) // header delivery D9 != body D1
    expect(r.processingStatus).toBe('rejected_header_mismatch'); expect(getUpdates(db, 'exp-1').length).toBe(0) })
  it('keeps a signed-but-schema-invalid envelope audit-only (not in the timeline)', () => {
    const r = ingest(db, signRaw(validBody({}, { experiment_id: '' }), 'experiment_update', 'D1'))
    expect(r.processingStatus).toBe('rejected_schema'); expect(getUpdates(db, 'exp-1').length).toBe(0) })
})
