import { describe, it, expect } from 'vitest'
import { approvalStatusFor } from './rules'
import { hashDraftPayload } from '@/domain/payload/canonical'
import type { Approval, DraftPayload } from '@/domain/schemas'
const p: DraftPayload = { method: 'bli', experimentType: 'affinity', targetId: 't', sequences: [{ id: 'AC-1', residues: 'MK' }], concentrations: [1e-9], replicates: 3, costTotalMinor: 730000, currency: 'USD', environment: 'mock', operation: 'create_draft', canonicalizerVersion: 'canon@v1', version: 2 }
const a: Approval = { id: 'ap', requestId: 'req-1', operation: 'create_draft', environment: 'mock', payloadHash: hashDraftPayload(p), payloadVersion: 2, costSnapshotMinor: 730000, actor: 'op', issuedAt: '2026-07-22T10:00:00Z', expiresAt: '2026-07-22T10:15:00Z', status: 'valid', consumedAt: null }
describe('approvalStatusFor', () => {
  it('valid when all bindings match and status is valid', () => expect(approvalStatusFor(a, p, '2026-07-22T10:05:00Z', 'req-1')).toBe('valid'))
  it('invalidated when status is not valid', () => expect(approvalStatusFor({ ...a, status: 'consumed' }, p, '2026-07-22T10:05:00Z', 'req-1')).toBe('invalidated'))
  it('invalidated on costSnapshotMinor mismatch', () => expect(approvalStatusFor({ ...a, costSnapshotMinor: 730001 }, p, '2026-07-22T10:05:00Z', 'req-1')).toBe('invalidated'))
  it('invalidated on payloadVersion/requestId mismatch', () => { expect(approvalStatusFor(a, { ...p, version: 3 }, '2026-07-22T10:05:00Z', 'req-1')).toBe('invalidated'); expect(approvalStatusFor(a, p, '2026-07-22T10:05:00Z', 'req-2')).toBe('invalidated') })
  it('expired after expiry', () => expect(approvalStatusFor(a, p, '2026-07-22T10:20:00Z', 'req-1')).toBe('expired'))
})
