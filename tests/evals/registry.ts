import assert from 'node:assert/strict'
import { getDb, migrate } from '@/infrastructure/db/client'
import { validateIntent } from '@/domain/intent/validate'
import { resolveTarget } from '@/domain/target/resolve'
import { applyBudget } from '@/domain/cost/budget'
import { hashDraftPayload } from '@/domain/payload/canonical'
import { decideTransition } from '@/domain/webhook/transition'
import { verifyUpdateSignature } from '@/domain/webhook/verify'
import { crossCheckHeaders } from '@/domain/webhook/envelope'
import { mapWireStatus } from '@/domain/status/map'
import { classifyCandidate } from '@/domain/results/qc'
import { validateCustomerDraft } from '@/domain/comms/compose'
import { insertApproval, consumeApproval } from '@/infrastructure/repositories'
import { DeterministicLlmAdapter } from '@/adapters/llm/deterministic'
import { demoTargets } from '../../fixtures/targets'
import { demoResultRecords } from '../../fixtures/results'
import { signedUpdate } from '../../fixtures/updates'
import type { DraftPayload, RawExtractedIntent, EvidenceBundle } from '@/domain/schemas'

export type EvalCase = { id: string; layer: string; adversarial: boolean; run: () => void | Promise<void> }

const P: DraftPayload = { method: 'bli', experimentType: 'affinity', targetId: 't', sequences: [{ id: 'AC-1', residues: 'MK' }], concentrations: [1e-9], replicates: 3, costTotalMinor: 730000, currency: 'USD', environment: 'mock', operation: 'create_draft', canonicalizerVersion: 'canon@v1', version: 1 }
const rawUnsupported: RawExtractedIntent = { experimentType: 'screening', method: 'elisa', targetQuery: null, requestedCount: null, concentrations: null, replicates: null, budget: null, fields: [], ambiguities: [] }
const byId = (id: string) => demoResultRecords.find((r) => r.candidateId === id)!
const emptyBundle: EvidenceBundle = { experimentId: 'e', records: [], summaryStats: {} }
const draft = (segs: any[]) => ({ segments: segs, generatedBy: { adapter: 's', model: 's', promptHash: 'x' }, status: 'draft' as const })

export const EVAL_CASES: EvalCase[] = [
  { id: 'INTK-01', layer: 'intake', adversarial: false, run: async () => { const r = await new DeterministicLlmAdapter().extractIntent({ requestText: 'unknown request text' }); assert.equal(r.ok, false); if (!r.ok) assert.equal(r.error, 'NO_STUB_FIXTURE') } },
  { id: 'INTK-02', layer: 'intake', adversarial: true, run: () => { assert.equal(validateIntent(rawUnsupported).ok, false) } },
  { id: 'TGT-01', layer: 'target', adversarial: true, run: () => assert.equal(resolveTarget('EGFR', demoTargets).status, 'ambiguous') },
  { id: 'TGT-02', layer: 'target', adversarial: true, run: () => assert.equal(resolveTarget(null, demoTargets).status, 'missing') },
  { id: 'COST-01', layer: 'cost', adversarial: true, run: () => { const b = applyBudget(970000, 800000); assert.equal(b.withinBudget, false); assert.equal(b.overageMinor, 170000); assert.equal(b.maxWithinBudget, 4) } },
  { id: 'HASH-01', layer: 'approval-hash', adversarial: false, run: () => assert.equal(hashDraftPayload({ ...P, sequences: [P.sequences[0]!], version: 9 }), hashDraftPayload(P)) },
  { id: 'HASH-02', layer: 'approval-hash', adversarial: true, run: () => { for (const m of [{ environment: 'live' as const }, { operation: 'confirm_experiment' as const }, { costTotalMinor: 730001 }]) assert.notEqual(hashDraftPayload({ ...P, ...m }), hashDraftPayload(P)) } },
  { id: 'HASH-03', layer: 'approval-hash', adversarial: true, run: () => { assert.throws(() => hashDraftPayload({ ...P, canonicalizerVersion: 'canon@v2' })); assert.throws(() => hashDraftPayload({ ...P, costTotalMinor: 1.5 })) } },
  { id: 'APPR-01', layer: 'approval-consume', adversarial: true, run: () => { const db = getDb(':memory:'); migrate(db); insertApproval(db, { id: 'ap', requestId: 'r', operation: 'create_draft', environment: 'mock', payloadHash: 'h', payloadVersion: 1, costSnapshotMinor: 1, actor: 'o', issuedAt: 'i', expiresAt: 'e', status: 'valid' }); assert.equal(consumeApproval(db, 'ap', 'now'), true); assert.equal(consumeApproval(db, 'ap', 'now'), false) } },
  { id: 'WH-01', layer: 'webhook', adversarial: true, run: () => { assert.equal(decideTransition('Done', 'Done'), 'ignore'); assert.equal(decideTransition('InQueue', 'Done'), 'apply'); assert.equal(decideTransition('InProduction', 'InQueue'), 'ignore') } },
  { id: 'WH-02', layer: 'webhook', adversarial: true, run: () => { const u = signedUpdate({ experimentId: 'e', experimentCode: 'X', name: 'n', description: 'd', updateType: 'q' }, 'sec', 'D1'); assert.equal(verifyUpdateSignature(u.rawBody, 'sha256=bad', 'sec'), false); assert.equal(verifyUpdateSignature(u.rawBody, u.headers['X-Adaptyv-Signature'], 'sec'), true) } },
  { id: 'WH-03', layer: 'webhook', adversarial: true, run: () => { const u = signedUpdate({ experimentId: 'e', experimentCode: 'X', name: 'n', description: 'd', updateType: 'q' }, 'sec', 'D1'); assert.equal(crossCheckHeaders({ ...u.headers, 'X-Adaptyv-Delivery-Id': 'D9' }, u.body), false); assert.equal(mapWireStatus('bogus'), null) } },
  { id: 'QC-01', layer: 'qc', adversarial: false, run: () => assert.equal(classifyCandidate(byId('AC-1')).bindingClass, 'confirmed_binder') },
  { id: 'QC-02', layer: 'qc', adversarial: true, run: () => assert.equal(classifyCandidate(byId('AC-2')).bindingClass, 'apparent_binder_poor_fit') },
  { id: 'QC-03', layer: 'qc', adversarial: true, run: () => { const r = classifyCandidate(byId('AC-3')); assert.equal(r.bindingClass, 'no_detectable_binding'); assert.equal(r.dataQuality, 'pass') } },
  { id: 'QC-04', layer: 'qc', adversarial: true, run: () => assert.equal(classifyCandidate(byId('AC-4')).bindingClass, 'inconclusive_replicate_inconsistent') },
  { id: 'QC-05', layer: 'qc-data-quality', adversarial: true, run: () => assert.equal(classifyCandidate({ ...byId('AC-1'), controlOutcome: 'fail' }).dataQuality, 'fail') },
  { id: 'QC-06', layer: 'qc-data-quality', adversarial: true, run: () => assert.equal(classifyCandidate(byId('AC-2')).dataQuality, 'warning') },
  { id: 'QC-07', layer: 'qc-data-quality', adversarial: true, run: () => assert.equal(classifyCandidate(byId('AC-3')).replicateConsistency.status, 'not_applicable') },
  { id: 'EVID-01', layer: 'evidence-faithfulness', adversarial: true, run: () => assert.equal(validateCustomerDraft(draft([{ kind: 'text', text: 'KD 2.0 nM' }]) as any, emptyBundle).ok, false) },
  { id: 'EVID-02', layer: 'evidence-faithfulness', adversarial: true, run: () => assert.equal(validateCustomerDraft(draft([{ kind: 'evidence', evidenceId: 'ev_missing', claimType: 'confirmed', prefix: '', suffix: '' }]) as any, emptyBundle).ok, false) },
]
