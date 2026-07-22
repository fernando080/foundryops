import { describe, it, expect, beforeEach } from 'vitest'
import { getDb, migrate } from '@/infrastructure/db/client'
import { upsertRequest, setRequestPayload, setRequestState, insertApproval, getRequest, getApprovalStatus } from '@/infrastructure/repositories'
import { editReplicatesUseCase } from '@/application/editConfig'
import { createDraftUseCase } from '@/application/createDraft'
import { buildApproval } from '@/application/approval'
import { hashDraftPayload } from '@/domain/payload/canonical'
import { MockDraftIdGenerator } from '@/adapters/foundry/ids'
import type { DraftPayload, ValidatedAffinityIntent } from '@/domain/schemas'
const payload: DraftPayload = { method: 'bli', experimentType: 'affinity', targetId: 'tgt_egfr_human_ecd', sequences: [{ id: 'AC-1', residues: 'MKTAYIAKQR' }], concentrations: [1e-9], replicates: 3, costTotalMinor: 730000, currency: 'USD', environment: 'mock', operation: 'create_draft', canonicalizerVersion: 'canon@v1', version: 1 }
const intent: ValidatedAffinityIntent = { experimentType: 'affinity', method: 'bli', targetQuery: 'EGFR', requestedCount: 8, concentrations: [1e-9], replicates: 3, budget: { amountMinor: 800000, currency: 'USD' }, approvalRequired: true, assayDefaultsApplied: false, fields: [], ambiguities: [] }
describe('editReplicatesUseCase (atomic)', () => {
  let db: ReturnType<typeof getDb>
  const seedReady = () => {
    upsertRequest(db, { id: 'req-1', intentJson: JSON.stringify(intent), sequencesJson: JSON.stringify({ sequences: [{ id: 'AC-1', residues: 'MKTAYIAKQR', rawHeader: '', chains: [], length: 10, normHash: 'h', sourceLoc: { file: 'f', lineStart: 1, lineEnd: 2 } }], acceptedIds: ['AC-1'], rejectedIds: [] }), requestState: 'READY_FOR_APPROVAL' })
    setRequestPayload(db, 'req-1', { payloadJson: JSON.stringify(payload), payloadHash: hashDraftPayload(payload), payloadVersion: 1 })
    insertApproval(db, buildApproval(payload, { actor: 'op', issuedAt: '2026-07-22T10:00:00Z', ttlMinutes: 15, requestId: 'req-1' })) }
  beforeEach(() => { db = getDb(':memory:'); migrate(db); seedReady() })
  it('rejects a stale expected version without changing anything', () => {
    const r = editReplicatesUseCase(db, { requestId: 'req-1', expectedVersion: 99, newReplicates: 5, nowIso: 'now' })
    expect(r.ok).toBe(false); expect(r.reason).toBe('STALE_VERSION')
    expect(getRequest(db, 'req-1')!.payloadVersion).toBe(1); expect(getApprovalStatus(db, 'ap_req-1_1')).toBe('valid'); expect(getRequest(db, 'req-1')!.requestState).toBe('READY_FOR_APPROVAL') })
  it('after edit, the old approval is unusable and state is not READY_FOR_APPROVAL', () => {
    const r = editReplicatesUseCase(db, { requestId: 'req-1', expectedVersion: 1, newReplicates: 5, nowIso: 'now' })
    expect(r.ok).toBe(true); expect(r.version).toBe(2)
    expect(getRequest(db, 'req-1')!.requestState).not.toBe('READY_FOR_APPROVAL')
    expect(getApprovalStatus(db, 'ap_req-1_1')).toBe('invalidated')
    const draft = createDraftUseCase(db, new MockDraftIdGenerator(), { requestId: 'req-1', approvalId: 'ap_req-1_1', nowIso: 'now' })
    expect(draft.ok).toBe(false) })
  it('rolls back all writes if the transaction fails after writes', () => {
    const r = editReplicatesUseCase(db, { requestId: 'req-1', expectedVersion: 1, newReplicates: 5, nowIso: 'now' }, { afterWrites: () => { throw new Error('injected fault') } })
    expect(r.ok).toBe(false); expect(r.reason).toBe('ROLLED_BACK')
    expect(getRequest(db, 'req-1')!.payloadVersion).toBe(1); expect(getApprovalStatus(db, 'ap_req-1_1')).toBe('valid'); expect(getRequest(db, 'req-1')!.requestState).toBe('READY_FOR_APPROVAL') })
  it('no READY_FOR_APPROVAL state remains after a successful edit', () => {
    editReplicatesUseCase(db, { requestId: 'req-1', expectedVersion: 1, newReplicates: 2, nowIso: 'now' })
    expect(getRequest(db, 'req-1')!.requestState).toBe('REMEDIATED'); expect(getRequest(db, 'req-1')!.payloadVersion).toBe(2) })
})
