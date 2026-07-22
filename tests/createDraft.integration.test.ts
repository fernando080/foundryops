import { describe, it, expect, beforeEach } from 'vitest'
import { getDb, migrate } from '@/infrastructure/db/client'
import { upsertRequest, setRequestPayload, insertApproval, consumeApproval } from '@/infrastructure/repositories'
import { createDraftUseCase } from '@/application/createDraft'
import { buildApproval } from '@/application/approval'
import { hashDraftPayload } from '@/domain/payload/canonical'
import { MockDraftIdGenerator } from '@/adapters/foundry/ids'
import type { DraftPayload } from '@/domain/schemas'
const payload: DraftPayload = { method: 'bli', experimentType: 'affinity', targetId: 'tgt_egfr_human_ecd',
  sequences: [{ id: 'AC-1', residues: 'MKTAYIAKQR' }], concentrations: [1e-9], replicates: 3, costTotalMinor: 730000,
  currency: 'USD', environment: 'mock', operation: 'create_draft', canonicalizerVersion: 'canon@v1', version: 1 }
const idGen = new MockDraftIdGenerator()
describe('createDraftUseCase', () => { let db: ReturnType<typeof getDb>
  beforeEach(() => { db = getDb(':memory:'); migrate(db) })
  const seed = (state: string) => { upsertRequest(db, { id: 'req-1', requestState: state })
    setRequestPayload(db, 'req-1', { payloadJson: JSON.stringify(payload), payloadHash: hashDraftPayload(payload), payloadVersion: payload.version })
    insertApproval(db, buildApproval(payload, { actor: 'op', issuedAt: '2026-07-22T10:00:00Z', ttlMinutes: 15, requestId: 'req-1' })) }
  it('requires READY_FOR_APPROVAL', () => { seed('ESTIMATED')
    const r = createDraftUseCase(db, idGen, { requestId: 'req-1', approvalId: 'ap_req-1_1', nowIso: '2026-07-22T10:05:00Z' })
    expect(r.ok).toBe(false); expect(r.reason).toBe('REQUEST_NOT_READY') })
  it('creates a deterministic draft once from the server-persisted payload', () => { seed('READY_FOR_APPROVAL')
    const a = createDraftUseCase(db, idGen, { requestId: 'req-1', approvalId: 'ap_req-1_1', nowIso: '2026-07-22T10:05:00Z' })
    expect(a.ok).toBe(true); expect(a.experimentId).toMatch(/^exp_/)
    const b = createDraftUseCase(db, idGen, { requestId: 'req-1', approvalId: 'ap_req-1_1', nowIso: '2026-07-22T10:05:00Z' })
    expect(b.ok).toBe(false); expect(b.reason).toBe('REQUEST_NOT_READY') })
  it('rejects a consumed approval on a still-ready request', () => { seed('READY_FOR_APPROVAL')
    consumeApproval(db, 'ap_req-1_1', 'x')
    const r = createDraftUseCase(db, idGen, { requestId: 'req-1', approvalId: 'ap_req-1_1', nowIso: '2026-07-22T10:05:00Z' })
    expect(r.ok).toBe(false); expect(r.reason).toBe('APPROVAL_INVALIDATED') })
})
