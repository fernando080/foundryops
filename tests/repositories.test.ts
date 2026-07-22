import { describe, it, expect, beforeEach } from 'vitest'
import { getDb, migrate } from '@/infrastructure/db/client'
import { insertUpdateOnce, consumeApproval, insertApproval, insertDraftOperationOnce } from '@/infrastructure/repositories'
describe('repositories', () => { let db: ReturnType<typeof getDb>
  beforeEach(() => { db = getDb(':memory:'); migrate(db) })
  it('dedups an update delivery', () => { const r = { experimentId: 'e', updateType: 'quote', name: 'n', description: 'd', raw: '{}' }
    expect(insertUpdateOnce(db, 'D1', r)).toBe(true); expect(insertUpdateOnce(db, 'D1', r)).toBe(false) })
  it('consumes an approval once (WHERE status=valid)', () => {
    insertApproval(db, { id: 'ap', requestId: 'req-1', operation: 'create_draft', environment: 'mock', payloadHash: 'h', payloadVersion: 1, costSnapshotMinor: 1, actor: 'op', issuedAt: 'i', expiresAt: 'e', status: 'valid' })
    expect(consumeApproval(db, 'ap', 'now')).toBe(true); expect(consumeApproval(db, 'ap', 'now')).toBe(false) })
  it('inserts a draft operation once per operationKey', () => {
    expect(insertDraftOperationOnce(db, 'k', { experimentId: 'exp_1', requestId: 'req-1' })).toBe(true)
    expect(insertDraftOperationOnce(db, 'k', { experimentId: 'exp_1', requestId: 'req-1' })).toBe(false) })
})
