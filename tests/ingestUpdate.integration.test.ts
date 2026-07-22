import { describe, it, expect, beforeEach } from 'vitest'
import { getDb, migrate } from '@/infrastructure/db/client'
import { ingestUpdate } from '@/application/ingestUpdate'
import { refreshStatus } from '@/application/refreshStatus'
import { MockFoundryClient } from '@/adapters/foundry/mock'
import { signedUpdate } from '../fixtures/updates'

describe('update ingest + status', () => {
  let db: ReturnType<typeof getDb>

  beforeEach(() => {
    db = getDb(':memory:')
    migrate(db)
  })

  it('stores an accepted update as a timeline message and dedups a duplicate', () => {
    const u = signedUpdate({ experimentId: 'e', experimentCode: 'X', name: 'n', description: 'd', updateType: 'quote' }, 'sec', 'D1')
    expect(ingestUpdate(db, { rawBody: u.rawBody, headers: u.headers, secret: 'sec' }).processingStatus).toBe('accepted')
    expect(ingestUpdate(db, { rawBody: u.rawBody, headers: u.headers, secret: 'sec' }).processingStatus).toBe('duplicate')
  })

  it('rejects an invalid signature and a header mismatch (audit only)', () => {
    const u = signedUpdate({ experimentId: 'e', experimentCode: 'X', name: 'n', description: 'd', updateType: 'quote' }, 'sec', 'D2')
    expect(ingestUpdate(db, { rawBody: u.rawBody, headers: { ...u.headers, 'X-Adaptyv-Signature': 'sha256=bad' }, secret: 'sec' }).processingStatus).toBe('rejected_signature')
    expect(ingestUpdate(db, { rawBody: u.rawBody, headers: { ...u.headers, 'X-Adaptyv-Delivery-Id': 'D9' }, secret: 'sec' }).processingStatus).toBe('rejected_header_mismatch')
  })

  it('refreshStatus maps the wire status and applies a forward transition', async () => {
    const r = await refreshStatus(db, new MockFoundryClient(), 'e')
    expect(r.status).toBe('Done')
    expect(r.applied).toBe(true)
  })
})
