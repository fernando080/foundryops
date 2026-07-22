# FoundryOps MVP Implementation Plan (Revision R2.1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The only canonical companion is `docs/superpowers/specs/2026-07-22-foundryops-mvp-design.md`. Ignore `docs/planning/*` — those are non-authoritative human templates.

**Goal:** Build the FoundryOps vertical demo — paste a **BLI affinity characterization** request against EGFR + upload a FASTA, produce a validated budget-aware Foundry **Draft** behind a human approval gate, ingest signed `experiment_update` timeline messages while tracking experiment status separately, run deterministic results QC, and draft an evidence-backed customer update whose numbers are all renderer-inserted from evidence — runnable offline in mock mode.

**Architecture:** Layered TypeScript. Pure `domain/` holds validation, arithmetic, hashing, authorization, QC, evidence, and rendering. `application/` orchestrates use-cases and owns SQLite transactions and depends **only on ports** (`FoundryClient`, `LlmClient`, `DraftIdGenerator`) — never on `adapters/foundry/*`. `adapters/` wraps Foundry and the LLM. `infrastructure/` holds Drizzle/SQLite, crypto, config, logging. `src/app` + `src/components` are thin presentation.

**Tech Stack:** Next.js (App Router) · React · TypeScript strict · Zod · Drizzle ORM + better-sqlite3 · Vitest · Playwright · `@google/genai` (stretch only).

## Global Constraints

- Money is integer minor units (cents); never floats. Currency `'USD'`.
- Request wording is **"BLI affinity characterization"**. Input is **request text + FASTA only**.
- Replicates are **triplicate** everywhere (request text + all fixtures).
- LLM may only (a) propose `RawExtractedIntent` and (b) compose evidence-referencing draft segments; it never writes numbers into prose. Unknown stub requests return `NO_STUB_FIXTURE`, never a silent affinity/BLI intent. **No raw residues reach the LLM.**
- Default env: `LLM_PROVIDER=stub`, `FOUNDRY_MODE=mock`. Live ops non-constructable without a server token.
- Cost model: `totalMinor = 250000 + 120000 * acceptedCandidates`; demo budget `800000`.
- QC policy `demo-qc-policy@v1`: `rmseMaxPct=15`, `cvMax=0.20`, `kdMaxBinderM=1e-6`. **Data quality (`qcStatus`) is separate from binding outcome (`bindingClass`); no detectable binding is not a failed assay.**
- Canonicalizer version `canon@v1` (validated in the hasher). Webhook envelope `api_version = '2026-02'` — **separate** from the OpenAPI document version `0.0.2`.
- Official update webhook: event `experiment_update`; headers `X-Adaptyv-Event`, `X-Adaptyv-Delivery-Id`, `X-Adaptyv-Signature`; signature `sha256=<hex HMAC-SHA256 of raw body>`; body `{ delivery_id, event, timestamp, api_version, data:{ type, experiment_id, experiment_code, organization_id, update_id, name, description, update_type, eta, created_at } }`. **The webhook carries no status.** Status comes from `getExperimentStatus()` (lower_snake_case wire → domain mapping) before any transition. **No public webhook route** — local signed-fixture replay only. Cross-check `X-Adaptyv-Event`/`X-Adaptyv-Delivery-Id` against the signed body.
- `application/` must not import `adapters/foundry/*`; deterministic mock-id generation is injected via `DraftIdGenerator`. Live HTTP is stretch and never described as atomic with SQLite.
- Runtime DB: tests `:memory:` (one shared connection per test); `npm run demo` → `./data/foundryops.db`; Playwright → `./data/e2e.db` deleted before the run; server actions share one file connection.
- Dependencies: **do not pin Next.js 15.1.0**; resolve current supported stable at implementation time, install `--save-exact`, commit the lockfile, run `typecheck/test/build/npm audit` before continuing.
- Secrets server-side only; no `NEXT_PUBLIC_` secret; SQLite file outside any served dir; `gitleaks` with **no `|| true`**.
- TDD: behavior changes red → green. Commit after each green task. Each slice ends in a runnable state; never start a slice while the previous runnable check is red.

---

# SLICE 0 — Executable shell and canonical fixtures

*End state: app boots to an empty workspace; schema + fixture tests green; `typecheck/test/build/npm audit` green; pinned OpenAPI snapshot recorded.*

## Task 0.1: Scaffold with resolved-stable deps, env, network guard

**Files:** `package.json`, `tsconfig.json`, `next.config.mjs`, `vitest.config.ts`, `.gitignore`, `.env.example`, `scripts/check-client-bundle.mjs`, `src/infrastructure/config/{env.ts,network-guard.ts}`, `tests/setup.ts`.

- [ ] **Step 1: Resolve current stable versions** (do not pin 15.1.0). Run `npm view next version`, `npm view react version`, `npm view zod version`, `npm view drizzle-orm version`, `npm view better-sqlite3 version`, `npm view vitest version`, `npm view @playwright/test version`, `npm view drizzle-kit version`, `npm view typescript version`. Record the resolved versions.

- [ ] **Step 2:** Create `package.json` with **caret-free exact** deps by installing them (Step 3), not by hand-pinning. Start from:
```json
{ "name": "foundryops", "private": true, "type": "module",
  "scripts": {
    "dev": "next dev", "build": "next build", "start": "next start",
    "demo": "cross-env LLM_PROVIDER=stub FOUNDRY_MODE=mock FOUNDRYOPS_DB_PATH=./data/foundryops.db next dev",
    "test": "vitest run", "test:e2e": "playwright test", "typecheck": "tsc --noEmit",
    "audit": "npm audit --omit=dev", "secret:scan": "gitleaks detect --no-banner",
    "verify": "npm run typecheck && npm run test && npm run build && node scripts/check-client-bundle.mjs && npm run audit",
    "demo-ready": "npm run verify && npm run secret:scan && npm run test:e2e" } }
```
- [ ] **Step 3:** Install with exact versions and commit the lockfile:
`npm install --save-exact next@latest react@latest react-dom@latest zod@latest drizzle-orm@latest better-sqlite3@latest`
`npm install --save-exact --save-dev typescript@latest @types/node@latest @types/react@latest @types/better-sqlite3@latest vitest@latest drizzle-kit@latest @playwright/test@latest cross-env@latest`
Expected: exact versions written to `package.json` + `package-lock.json`.

- [ ] **Step 4:** `tsconfig.json` (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `paths {"@/*":["./src/*"]}`, `plugins [{name:"next"}]`), `next.config.mjs` (`export default { serverExternalPackages: ['better-sqlite3'] }`), `.gitignore` (`node_modules .next *.db *.db-* .env .env.local data test-artifacts playwright-report`), `.env.example` (`LLM_PROVIDER=stub`, `FOUNDRY_MODE=mock`, `FOUNDRYOPS_DB_PATH=./data/foundryops.db`, `FOUNDRY_WEBHOOK_SECRET=demo-secret`).

- [ ] **Step 5:** `vitest.config.ts` (alias `@`, `setupFiles: ['./tests/setup.ts']`, node env). `scripts/check-client-bundle.mjs` (greps `.next/static` for `GEMINI_API_KEY`/`FOUNDRY_TOKEN`/`AIza…`, exits non-zero on a hit).

- [ ] **Step 6: `src/infrastructure/config/env.ts`**
```ts
export type FoundryMode = 'mock' | 'sandbox' | 'live'
export type LlmProvider = 'stub' | 'gemini'
const read = (n: string, f?: string) => { const v = process.env[n]; return v === undefined || v === '' ? f : v }
export const env = {
  llmProvider: read('LLM_PROVIDER', 'stub') as LlmProvider,
  foundryMode: read('FOUNDRY_MODE', 'mock') as FoundryMode,
  geminiApiKey: read('GEMINI_API_KEY'),
  foundryToken: read('FOUNDRY_TOKEN'),
  webhookSecret: read('FOUNDRY_WEBHOOK_SECRET', 'demo-secret')!,
  dbPath: read('FOUNDRYOPS_DB_PATH', ':memory:')!,
}
export function assertLiveAllowed(): void { if (env.foundryMode === 'live' && !env.foundryToken) throw new Error('FOUNDRY_MODE=live requires FOUNDRY_TOKEN') }
```
- [ ] **Step 7:** `network-guard.ts` (throws on non-loopback `net.Socket.connect`; as R2), `tests/setup.ts` installs it.
- [ ] **Step 8:** `npm run typecheck` → 0; `npm audit` → note/resolve advisories. **Step 9: Commit** `chore: scaffold FoundryOps (resolved-stable deps, exact lockfile, env, network guard)`.

## Task 0.2: Domain schemas, constants, ports

**Files:** `src/domain/constants.ts`, `src/domain/schemas/index.ts`, `src/application/ports.ts`; Test `src/domain/schemas/schemas.test.ts`.

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from 'vitest'
import { RawExtractedIntentSchema, FoundryUpdateSchema, ResultRecordSchema, QCResultSchema } from './index'
import { demoQcPolicyV1, WIRE_STATUS_MAP, WEBHOOK_API_VERSION } from '../constants'
describe('schemas + constants', () => {
  it('RawExtractedIntent allows unsupported types + null concentrations', () => {
    expect(RawExtractedIntentSchema.parse({ experimentType: 'screening', method: 'elisa', targetQuery: null, requestedCount: null, concentrations: null, replicates: null, budget: null, fields: [], ambiguities: [] }).experimentType).toBe('screening') })
  it('FoundryUpdate has no status/title/content and a separate api_version', () => {
    const u = FoundryUpdateSchema.parse({ deliveryId: 'D1', event: 'experiment_update', timestamp: 't', apiVersion: '2026-02', signatureVerified: true,
      data: { type: 'experiment.update', experimentId: 'e', experimentCode: 'c', organizationId: 'o', updateId: 'u', name: 'n', description: 'd', updateType: 'status_note', eta: null, createdAt: 't' } })
    expect((u.data as any).status).toBeUndefined(); expect(WEBHOOK_API_VERSION).toBe('2026-02') })
  it('ResultRecord carries contract fields incl. confidence; QCResult separates qcStatus from bindingClass', () => {
    ResultRecordSchema.parse({ experimentId: 'e', candidateId: 'AC-1', replicateKdsM: [2e-9], konPerMs: 3e5, koffPerS: 6e-4, kdMeanM: 2e-9, rmseMaxSignalPct: 4, fitQualityReported: 'good', confidence: 'high', controlOutcome: 'pass', measurements: [] })
    const q = QCResultSchema.parse({ candidateId: 'AC-1', qcStatus: 'pass', bindingClass: 'confirmed_binder', affinity: { kdM: 2e-9, ciLowM: null, ciHighM: null }, replicateConsistency: { cv: 0.03, consistent: true }, fitQuality: { rmseMaxSignalPct: 4, reported: 'good', pass: true }, confidence: 'high', controlOutcome: 'pass', recommendation: 'follow_up', appliedThresholds: 'demo-qc-policy@v1', warnings: [] })
    expect(q.qcStatus).toBe('pass') })
  it('exposes policy + wire status map', () => { expect(demoQcPolicyV1.version).toBe('demo-qc-policy@v1'); expect(WIRE_STATUS_MAP.done).toBe('Done') })
})
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: `src/domain/constants.ts`**
```ts
export const SETUP_COST_MINOR = 250_000
export const PER_CANDIDATE_MINOR = 120_000
export const DEMO_BUDGET_MINOR = 800_000
export const CANONICALIZER_VERSION = 'canon@v1'
export const WEBHOOK_API_VERSION = '2026-02'
export const demoQcPolicyV1 = { version: 'demo-qc-policy@v1', fit: { rmseMaxPct: 15 }, replicate: { cvMax: 0.2 }, binding: { kdMaxBinderM: 1e-6 } } as const
export const EXPERIMENT_STATUS_RANK = { Draft: 1, WaitingForConfirmation: 2, QuoteSent: 3, WaitingForMaterials: 4, InQueue: 5, InProduction: 6, DataAnalysis: 7, InReview: 8, Done: 9 } as const
export const WIRE_STATUS_MAP = { draft: 'Draft', waiting_for_confirmation: 'WaitingForConfirmation', quote_sent: 'QuoteSent', waiting_for_materials: 'WaitingForMaterials', in_queue: 'InQueue', in_production: 'InProduction', data_analysis: 'DataAnalysis', in_review: 'InReview', done: 'Done', canceled: 'Canceled' } as const
```
- [ ] **Step 4: `src/domain/schemas/index.ts`** — as R2 with these deltas:
  - `RawExtractedIntentSchema`, `ValidatedAffinityIntentSchema`, `SequenceSchema`, `SequenceSetSchema`, `PreflightFindingSchema`, `TargetSchema`, `TargetResolutionSchema`, `CostEstimateSchema`, `DraftPayloadSchema` — unchanged from R2.
  - `ApprovalSchema` adds `consumedAt: z.string().nullable()`.
  - `ExperimentStatusSchema` = enum of the 10 domain statuses (unchanged).
  - `FoundryUpdateSchema` = `{ deliveryId, event: z.literal('experiment_update'), timestamp, apiVersion, signatureVerified, data: z.object({ type, experimentId, experimentCode, organizationId, updateId, name, description, updateType, eta: z.string().nullable(), createdAt }) }` — **no status/title/content**.
  - `ResultRecordSchema` adds `confidence: z.enum(['high','medium','low']).nullable()`; keeps `rmseMaxSignalPct`, `fitQualityReported`; (no R2/MAE).
  - `QCResultSchema` adds `qcStatus: z.enum(['pass','fail'])` and `confidence: z.enum(['high','medium','low']).nullable()`; keeps `bindingClass` enum `{confirmed_binder, apparent_binder_poor_fit, no_detectable_binding, inconclusive_replicate_inconsistent, non_binder}`.
  - `EvidenceRecordSchema`, `EvidenceBundleSchema`, `CustomerDraftSegmentSchema`, `CustomerDraftSchema` — unchanged from R2.
  - Export all inferred types incl. `FoundryUpdate`, `ExperimentStatus`.
- [ ] **Step 5: `src/application/ports.ts`**
```ts
import type { RawExtractedIntent, EvidenceBundle, CustomerDraft, Target, CostEstimate, DraftPayload, ResultRecord } from '@/domain/schemas'
export interface FoundryClient {
  searchTargets(q: { query: string }): Promise<Target[]>
  estimateCost(input: { acceptedCount: number; budgetMinor: number | null }): Promise<CostEstimate>
  createDraft(input: DraftPayload, opts: { operationKey: string }): Promise<{ experimentId: string; draftId: string }>
  getExperimentStatus(experimentId: string): Promise<{ statusWire: string }>
  getResults(experimentId: string): Promise<ResultRecord[]>
}
export interface DraftIdGenerator { idFor(operationKey: string): string }
export interface LlmClient {
  extractIntent(input: { requestText: string }): Promise<{ ok: true; raw: RawExtractedIntent } | { ok: false; error: string }>
  draftCustomerUpdate(input: { evidenceBundle: EvidenceBundle }): Promise<{ ok: true; draft: CustomerDraft } | { ok: false; error: string }>
}
```
- [ ] **Step 6:** Run → PASS. **Step 7: Commit** `feat(domain): R2.1 schemas (update envelope, status map, qcStatus, ports)`.

## Task 0.3: Canonical fixtures + pinned OpenAPI snapshot

**Files:** `src/infrastructure/crypto/hash.ts`, `fixtures/{request,targets,candidates,results,updates}.ts`, `src/adapters/foundry/contract/{openapi.snapshot.json,snapshot.meta.ts}`; Test `fixtures/fixtures.test.ts`.

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from 'vitest'
import { demoResultRecords } from './results'
import { signedUpdate, verifyForTest } from './updates'
describe('fixtures', () => {
  it('AC-1..AC-4 triplicate result records with populated series', () => {
    expect(demoResultRecords.map(r => r.candidateId)).toEqual(['AC-1','AC-2','AC-3','AC-4'])
    expect(demoResultRecords[0]!.replicateKdsM!.length).toBe(3)
    expect(demoResultRecords[0]!.measurements.length).toBe(18) })   // 6 conc x 3 reps
  it('signed experiment_update matches headers and verifies', () => {
    const { rawBody, headers, body } = signedUpdate({ experimentId: 'e', experimentCode: 'EXP-1', name: 'Quote sent', description: 'A quote was prepared', updateType: 'quote' }, 'sec', 'D1')
    expect(headers['X-Adaptyv-Event']).toBe('experiment_update'); expect(headers['X-Adaptyv-Delivery-Id']).toBe(body.delivery_id)
    expect(verifyForTest(rawBody, headers['X-Adaptyv-Signature'], 'sec')).toBe(true) })
})
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** `hash.ts` (`sha256Hex`). `fixtures/request.ts`:
```ts
export const DEMO_REQUEST_TEXT = 'Prepare a BLI affinity characterization against EGFR using the attached sequences, six-point concentration series in triplicate. Keep it below the customer budget of $8,000, flag anything suspicious, and do not submit without my approval.'
export const DEMO_REQUEST_NO_BUDGET = 'Prepare a BLI affinity characterization against EGFR using the attached sequences, six-point concentration series in triplicate.'
```
`fixtures/targets.ts` (two EGFR constructs, as R2). `fixtures/candidates.ts` (`demoFasta`, AC-1..AC-8; AC-5 `Z`, AC-6 duplicates AC-1; as R2).
- [ ] **Step 4: `fixtures/results.ts`** — **triplicate**, contract fields:
```ts
import type { ResultRecord, Measurement } from '@/domain/schemas'
const CONC = [1e-7, 3e-8, 1e-8, 3e-9, 1e-9, 4e-10]
const series = (candidateId: string, scale: number): Measurement[] =>
  CONC.flatMap(c => [0, 1, 2].map(rep => ({ candidateId, concentrationM: c, replicateIndex: rep, responseValue: Number((scale * (1 - Math.exp(-c / 1e-8))).toFixed(4)) })))
const rec = (candidateId: string, over: Partial<ResultRecord>): ResultRecord => ({ experimentId: 'exp-demo', candidateId,
  replicateKdsM: null, konPerMs: null, koffPerS: null, kdMeanM: null, rmseMaxSignalPct: null, fitQualityReported: null, confidence: null, controlOutcome: 'pass', measurements: series(candidateId, 1), ...over })
export const demoResultRecords: ResultRecord[] = [
  rec('AC-1', { replicateKdsM: [2.0e-9, 2.1e-9, 1.95e-9], kdMeanM: 2.02e-9, konPerMs: 3.1e5, koffPerS: 6.3e-4, rmseMaxSignalPct: 4.2, fitQualityReported: 'good', confidence: 'high' }),
  rec('AC-2', { replicateKdsM: [40e-9, 44e-9, 38e-9], kdMeanM: 40.7e-9, konPerMs: 1.2e5, koffPerS: 4.9e-3, rmseMaxSignalPct: 22.5, fitQualityReported: 'poor', confidence: 'low' }),
  rec('AC-3', { replicateKdsM: null, kdMeanM: null, rmseMaxSignalPct: null, fitQualityReported: 'poor', confidence: 'low' }),
  rec('AC-4', { replicateKdsM: [5e-9, 500e-9, 250e-9], kdMeanM: 251.7e-9, rmseMaxSignalPct: 30, fitQualityReported: 'medium', confidence: 'low' }),
]
```
- [ ] **Step 5: `fixtures/updates.ts`** — exact envelope + header cross-check helper:
```ts
import { createHmac, timingSafeEqual } from 'node:crypto'
export function signedUpdate(data: { experimentId: string; experimentCode: string; name: string; description: string; updateType: string; eta?: string | null }, secret: string, deliveryId: string) {
  const body = { delivery_id: deliveryId, event: 'experiment_update', timestamp: '2026-07-22T12:00:00Z', api_version: '2026-02',
    data: { type: 'experiment.update', experiment_id: data.experimentId, experiment_code: data.experimentCode, organization_id: 'org_demo', update_id: `upd_${deliveryId}`, name: data.name, description: data.description, update_type: data.updateType, eta: data.eta ?? null, created_at: '2026-07-22T12:00:00Z' } }
  const rawBody = JSON.stringify(body)
  const sig = 'sha256=' + createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  return { rawBody, body, headers: { 'X-Adaptyv-Event': 'experiment_update', 'X-Adaptyv-Delivery-Id': deliveryId, 'X-Adaptyv-Signature': sig } }
}
export function verifyForTest(rawBody: string, header: string, secret: string): boolean {
  const m = /^sha256=([0-9a-f]+)$/i.exec(header); if (!m) return false
  const exp = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const a = Buffer.from(exp), b = Buffer.from(m[1]!.toLowerCase()); return a.length === b.length && timingSafeEqual(a, b)
}
```
- [ ] **Step 6:** Download the pinned OpenAPI to `src/adapters/foundry/contract/openapi.snapshot.json`; `snapshot.meta.ts` (`SNAPSHOT_API_VERSION='0.0.2'`, `SNAPSHOT_SOURCE`, `SNAPSHOT_SHA256=<recorded>`). One-time network pin, not part of CI.
- [ ] **Step 7:** Run → PASS. **Step 8: Commit** `feat(fixtures): triplicate contract-faithful fixtures + official update envelope + pinned snapshot`.

**Slice 0 gate:** `npm run typecheck` · `npm run test` · `npm run build` · `npm audit` all green.

---

# SLICE 1 — Intake + preflight + target/budget remediation + UI

*End state: paste + FASTA → findings, target ambiguity resolved, over-budget remediated by deselecting AC-7/AC-8, AC-1..AC-4 selected, within budget.*

## Task 1.1: FASTA parsing (as R2)
Create `src/domain/sequence/fasta.ts` (`parseFasta`, `normalizeResidues`) with the R2 implementation and test (parse/normalize/hash/duplicate/lineRange). Commit `feat(domain): FASTA parser`.

## Task 1.2: Intent validation split + keyed deterministic adapter (unknown → NO_STUB_FIXTURE)

**Files:** `src/domain/intent/validate.ts`, `src/adapters/llm/{deterministic.ts,factory.ts}`, `fixtures/intent.ts`; Tests alongside.

- [ ] **Step 1: Failing tests**
```ts
// deterministic.test.ts
import { describe, it, expect } from 'vitest'
import { DeterministicLlmAdapter } from './deterministic'
import { DEMO_REQUEST_TEXT } from '../../../fixtures/request'
describe('DeterministicLlmAdapter.extractIntent', () => {
  it('returns the demo intent for the exact request (triplicate)', async () => { const r = await new DeterministicLlmAdapter().extractIntent({ requestText: DEMO_REQUEST_TEXT }); expect(r.ok).toBe(true); if (r.ok) { expect(r.raw.targetQuery).toBe('EGFR'); expect(r.raw.replicates).toBe(3) } })
  it('returns NO_STUB_FIXTURE for unknown text (never a silent affinity intent)', async () => { const r = await new DeterministicLlmAdapter().extractIntent({ requestText: 'hello' }); expect(r).toEqual({ ok: false, error: 'NO_STUB_FIXTURE' }) })
})
```
```ts
// validate.test.ts — unchanged from R2 (unsupported blocks; defaults applied; approvalRequired policy)
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** `validate.ts` (as R2 `validateIntent`, DEFAULT_CONC 6-point, default replicates **3**). `fixtures/intent.ts` — `demoRawIntent` with `replicates: 3`, `concentrations` 6-point, budget 800000, target ambiguity; `demoRawIntentNoBudget` = budget null.
- [ ] **Step 4: `src/adapters/llm/deterministic.ts`**
```ts
import type { LlmClient } from '@/application/ports'
import type { RawExtractedIntent } from '@/domain/schemas'
import { sha256Hex } from '@/infrastructure/crypto/hash'
import { DEMO_REQUEST_TEXT, DEMO_REQUEST_NO_BUDGET } from '../../../fixtures/request'
import { demoRawIntent, demoRawIntentNoBudget } from '../../../fixtures/intent'
const normalize = (t: string) => t.trim().replace(/\s+/g, ' ').toLowerCase()
const TABLE: Record<string, RawExtractedIntent> = { [sha256Hex(normalize(DEMO_REQUEST_TEXT))]: demoRawIntent, [sha256Hex(normalize(DEMO_REQUEST_NO_BUDGET))]: demoRawIntentNoBudget }
export class DeterministicLlmAdapter implements LlmClient {
  async extractIntent({ requestText }: { requestText: string }) {
    const hit = TABLE[sha256Hex(normalize(requestText))]
    return hit ? { ok: true as const, raw: hit } : { ok: false as const, error: 'NO_STUB_FIXTURE' }
  }
  async draftCustomerUpdate() { return { ok: false as const, error: 'not implemented until slice 4' } }
}
```
- [ ] **Step 5:** `factory.ts` — MVP knows only `stub` (gemini branch lands in the Stretch task with the module).
- [ ] **Step 6:** Run → PASS. **Step 7: Commit** `feat(domain): intent split + keyed stub (unknown → NO_STUB_FIXTURE)`.

## Task 1.3: Preflight engine (auto-excluded findings are non-blocking)

**Files:** `src/domain/preflight/engine.ts`; Test alongside.

- [ ] **Step 1: Failing test** — as R2 plus: `INVALID_RESIDUE` and `DUPLICATE_SEQUENCE` set `blocksProgression:false` (excluded, campaign continues); `EMPTY_INPUT` blocks.
```ts
it('auto-excluded malformed/duplicate findings do not block progression', () => {
  const { findings } = runPreflight({ sequences: parseFasta(demoFasta, 'f'), requestedCount: 8 })
  expect(findings.find(f => f.code === 'INVALID_RESIDUE')!.blocksProgression).toBe(false)
  expect(findings.find(f => f.code === 'DUPLICATE_SEQUENCE')!.blocksProgression).toBe(false)
})
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement as R2 but set `blocksProgression:false` on `INVALID_RESIDUE`, `DUPLICATE_SEQUENCE`, `DUPLICATE_ID` (all auto-exclude the sequence); keep `EMPTY_INPUT` `blocksProgression:true`; `COUNT_MISMATCH` warning non-blocking.
- [ ] **Step 4:** Run → PASS. **Step 5: Commit** `feat(domain): preflight (auto-excluded findings non-blocking)`.

## Task 1.4: Target resolution + budget (as R2, no Infinity)
Create `src/domain/target/resolve.ts` + `src/domain/cost/budget.ts` with the R2 code/tests (ambiguity blocks; `maxWithinBudget` nullable). Commit `feat(domain): target resolution + budget`.

## Task 1.5: MockFoundryClient + ids + factory

**Files:** `src/adapters/foundry/{mock.ts,ids.ts,factory.ts}`; Test `src/adapters/foundry/mock.test.ts`.

- [ ] **Step 1: Failing test** — as R2 (estimate 6→970000 over 800000; searchTargets 2) plus:
```ts
it('getExperimentStatus returns a lower_snake_case wire status', async () => { expect((await new MockFoundryClient().getExperimentStatus('e')).statusWire).toBe('done') })
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: `src/adapters/foundry/ids.ts`**
```ts
import type { DraftIdGenerator } from '@/application/ports'
import { sha256Hex } from '@/infrastructure/crypto/hash'
export class MockDraftIdGenerator implements DraftIdGenerator { idFor(operationKey: string): string { return `exp_${sha256Hex(operationKey).slice(0, 10)}` } }
```
- [ ] **Step 4: `src/adapters/foundry/mock.ts`** — as R2 `MockFoundryClient` (searchTargets, estimateCost, getResults → `demoResultRecords`) with `createDraft` returning `{ experimentId: new MockDraftIdGenerator().idFor(opts.operationKey), draftId: ... }` and a new:
```ts
async getExperimentStatus(_experimentId: string): Promise<{ statusWire: string }> { return { statusWire: 'done' } }
```
- [ ] **Step 5:** `factory.ts` (`buildFoundryClient()`; mock or throw for non-mock as R2). **Step 6:** Run → PASS. **Step 7: Commit** `feat(adapters): MockFoundryClient + MockDraftIdGenerator + getExperimentStatus`.

## Task 1.6: Intake application service (as R2) + persist request

**Files:** `src/application/{intake.ts,estimate.ts}`; Test `tests/intake.integration.test.ts`.
Implement `runIntake` (as R2). Add a helper the intake action will call to persist the request (intent + sequences) — the DB wiring lands in Slice 2's repositories, so here keep `runIntake` pure (returns `{ rawIntent, intentResult, sequenceSet, findings, resolution }`). Test as R2 (ambiguous target; accepted AC-1..AC-4,AC-7,AC-8). Commit `feat(application): intake orchestration`.

## Task 1.7: Intake + remediation UI + shell (real gates)

**Files:** `src/app/{layout.tsx,page.tsx,globals.css}`, `src/app/actions/intake.ts`, `src/components/{Shell,Stepper,EnvBadge,IntakeStage,PreflightPanel,TargetPicker,BudgetPanel}.tsx`, `src/infrastructure/logging/logger.ts`.
- [ ] Build the shell (env badge + padlock + stepper), intake stage (`request-input`, `fasta-input`, `run-intake`), preflight panel (`finding-${code}`), target picker (required radio, `target-picker`, `target-option-${id}`), budget panel (`over-budget`, `candidate-toggle-${id}`). `intakeAction(requestText, fastaText)` runs `runIntake` + estimates for the accepted count; on unknown request (`NO_STUB_FIXTURE`) show a friendly "unrecognized request" state. Deselecting AC-7/AC-8 re-estimates within budget; `Request approval` disabled until one target + budget OK + exactly AC-1..AC-4 remain. Commit `feat(presentation): shell + intake with real ambiguity/budget gates`.

**Slice 1 runnable check:** paste → remediated, target-selected, AC-1..AC-4 selected, within budget.

---

# SLICE 2 — Approval + idempotent mock draft + UI

*End state: approve the exact server-persisted payload → deterministic mock draft; edit invalidates; reissue works.*

## Task 2.1: Canonical payload hash (validate canonicalizerVersion)

**Files:** `src/domain/payload/canonical.ts`; Test alongside.
- [ ] **Step 1: Failing test** — R2 assertions plus:
```ts
it('rejects an unexpected canonicalizerVersion', () => { expect(() => canonicalizeDraftPayload({ ...base, canonicalizerVersion: 'canon@v2' })).toThrow(/canonicalizerVersion/) })
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement as R2 (compile-time exhaustive `FIELD_CLASS`, code-unit `cmp`, integer money) and add at the top of `canonicalizeDraftPayload`: `if (p.canonicalizerVersion !== CANONICALIZER_VERSION) throw new Error('unexpected canonicalizerVersion')` (import `CANONICALIZER_VERSION`).
- [ ] **Step 4:** Run → PASS. **Step 5: Commit** `feat(domain): canonical hash (+ canonicalizerVersion validation)`.

## Task 2.2: Approval rules (status=valid + costSnapshotMinor)

**Files:** `src/domain/approval/rules.ts`; Test alongside.
- [ ] **Step 1: Failing test**
```ts
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
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: `src/domain/approval/rules.ts`**
```ts
import type { Approval, DraftPayload } from '@/domain/schemas'
import { hashDraftPayload } from '@/domain/payload/canonical'
export function approvalStatusFor(a: Approval, p: DraftPayload, nowIso: string, requestId: string): 'valid' | 'expired' | 'invalidated' {
  if (a.status !== 'valid') return 'invalidated'
  if (a.requestId !== requestId) return 'invalidated'
  if (a.operation !== p.operation) return 'invalidated'
  if (a.environment !== p.environment) return 'invalidated'
  if (a.payloadVersion !== p.version) return 'invalidated'
  if (a.costSnapshotMinor !== p.costTotalMinor) return 'invalidated'
  if (a.payloadHash !== hashDraftPayload(p)) return 'invalidated'
  if (new Date(nowIso).getTime() > new Date(a.expiresAt).getTime()) return 'expired'
  return 'valid'
}
```
- [ ] **Step 4:** Run → PASS. **Step 5: Commit** `feat(domain): approval freshness (status=valid + costSnapshotMinor + version + requestId + op + env + expiry)`.

## Task 2.3: Repositories + shared connection (requests carry the payload; approvals carry every field)

**Files:** `src/infrastructure/db/{schema.ts,client.ts}`, `src/infrastructure/repositories/index.ts`; Test `tests/repositories.test.ts`.
- [ ] Tables: `requests(id PK, intent_json, sequences_json, payload_json, payload_hash, payload_version, request_state)`; `approvals(id PK, request_id, operation, environment, payload_hash, payload_version, cost_snapshot_minor, actor, issued_at, expires_at, status, consumed_at)`; `draft_operations(operation_key PK, experiment_id, request_id)`; `update_log(delivery_id PK, experiment_id, update_type, name, description, raw)`; `experiment_status(experiment_id PK, status)`; `event_log(id PK AUTOINCREMENT, kind, detail, at)`.
- [ ] `client.ts`: `getDb(path)` opens a connection (WAL); **`getSharedDb()` returns a process-singleton connection to `env.dbPath`** for server actions; `migrate(db)` runs `CREATE TABLE IF NOT EXISTS …`.
- [ ] `repositories/index.ts`: `upsertRequest`, `getRequest`, `setRequestPayload(db,id,{payloadJson,payloadHash,payloadVersion})`, `setRequestState`, `insertApproval(all fields)`, `loadApproval`, `consumeApproval(db,id,consumedAt)` = `UPDATE approvals SET status='consumed', consumed_at=? WHERE id=? AND status='valid'` returning `changes===1`, `insertDraftOperationOnce`, `getDraftOperation`, `insertUpdateOnce`, `getExperimentStatusRow`, `setExperimentStatus`, `appendEvent`.
- [ ] Test: dedup update; single-row consume (`consumeApproval` twice → true then false); `insertDraftOperationOnce` once. Commit `feat(infra): schema + repositories (request payload, full approvals, single-row consume, shared connection)`.

## Task 2.4: createDraft use-case (server-loaded payload, injected DraftIdGenerator)

**Files:** `src/application/createDraft.ts`, `src/application/approval.ts`; Test `tests/createDraft.integration.test.ts`.
- [ ] **Step 1: Failing test** — seed a request in `READY_FOR_APPROVAL` with `payload_json` + a valid approval; assert first `createDraftUseCase` ok with `exp_` id, second → `APPROVAL_NOT_CONSUMABLE`; a request not `READY_FOR_APPROVAL` → `REQUEST_NOT_READY`. Signature: `createDraftUseCase(db, idGen, { requestId, approvalId, nowIso })`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: `src/application/createDraft.ts`** — loads the payload **server-side from the request row**, injects `DraftIdGenerator`, no `adapters/foundry` import:
```ts
import type { DraftIdGenerator } from './ports'
import { DraftPayloadSchema } from '@/domain/schemas'
import { hashDraftPayload } from '@/domain/payload/canonical'
import { approvalStatusFor } from '@/domain/approval/rules'
import { getRequest, loadApproval, consumeApproval, insertDraftOperationOnce, getDraftOperation, setRequestState, appendEvent } from '@/infrastructure/repositories'
import type { getDb } from '@/infrastructure/db/client'
export function createDraftUseCase(db: ReturnType<typeof getDb>, idGen: DraftIdGenerator, input: { requestId: string; approvalId: string; nowIso: string }): { ok: boolean; experimentId?: string; reason?: string } {
  const rawDb = (db as any).session.client as import('better-sqlite3').Database
  return rawDb.transaction(() => {
    const req = getRequest(db, input.requestId)
    if (!req || req.requestState !== 'READY_FOR_APPROVAL' || !req.payloadJson) return { ok: false, reason: 'REQUEST_NOT_READY' }
    const payload = DraftPayloadSchema.parse(JSON.parse(req.payloadJson))
    const ap = loadApproval(db, input.approvalId)
    if (!ap) return { ok: false, reason: 'APPROVAL_NOT_FOUND' }
    const status = approvalStatusFor(ap, payload, input.nowIso, input.requestId)
    if (status !== 'valid') return { ok: false, reason: `APPROVAL_${status.toUpperCase()}` }
    if (!consumeApproval(db, input.approvalId, input.nowIso)) return { ok: false, reason: 'APPROVAL_NOT_CONSUMABLE' }
    const operationKey = `${input.requestId}::${payload.operation}::${hashDraftPayload(payload)}`
    const experimentId = idGen.idFor(operationKey)
    insertDraftOperationOnce(db, operationKey, { experimentId, requestId: input.requestId })
    const stored = getDraftOperation(db, operationKey)!.experimentId
    setRequestState(db, input.requestId, 'DRAFT_CREATED')
    appendEvent(db, { kind: 'draft_created', detail: stored, at: input.nowIso })
    return { ok: true, experimentId: stored }
  })()
}
```
`approval.ts`: `buildApproval(payload, { actor, issuedAt, ttlMinutes, requestId })` binding requestId/operation/environment/payloadHash/payloadVersion/costSnapshotMinor, `status:'valid'`, `consumedAt:null`.
- [ ] **Step 4:** Run → PASS. **Step 5: Commit** `feat(application): createDraft (server-loaded payload, injected id gen, single-consume txn)`.

## Task 2.5: Server-authoritative approval UI

**Files:** `src/app/actions/{prepare.ts,approval.ts}`, `src/adapters/foundry/factory.ts` (add `buildDraftIdGenerator()`), `src/components/{ApprovalStage,PayloadDiff,HashChip}.tsx`.
- [ ] `prepareRequestAction(requestId, { targetId, selectedCandidateIds })`: server-side derives the authoritative `DraftPayload` from the persisted intent/sequences + re-estimated cost, persists it via `setRequestPayload`, and sets `READY_FOR_APPROVAL` when valid.
- [ ] `requestApprovalAction(requestId)`: **accepts only requestId**; loads the persisted current payload; reruns readiness checks server-side; `buildApproval`; `insertApproval`.
- [ ] `createDraftAction(requestId, approvalId)`: **accepts only those two**; calls `createDraftUseCase(getSharedDb(), buildDraftIdGenerator(), { requestId, approvalId, nowIso })`. Never trusts a browser payload.
- [ ] UI: `ApprovalStage` shows the server payload + `HashChip` (`hash-chip`), `create-draft` (enabled) vs `confirm-submit` (disabled padlock). An edit (e.g. `edit-replicates`) calls `prepareRequestAction` again → new hash + `approval-invalidated` banner + `reissue-approval`. Commit `feat(presentation): server-authoritative approval UI (invalidate + reissue)`.

**Slice 2 runnable check:** approve the exact server payload → deterministic mock draft; edit invalidates; reissue works.

---

# SLICE 3 — Signed experiment_update timeline + separate status tracking + timeline/audit UI

*End state: replay valid/duplicate/invalid updates; dedupe once; invalid only in audit; status advances via getExperimentStatus.*

## Task 3.1: Signature verify + header/body cross-check + status mapping + transition

**Files:** `src/domain/webhook/{verify.ts,envelope.ts}`, `src/domain/status/map.ts`, `src/domain/webhook/transition.ts`; Test `src/domain/webhook/webhook.test.ts`, `src/domain/status/map.test.ts`.
- [ ] **Step 1: Failing tests**
```ts
// webhook.test.ts
import { describe, it, expect } from 'vitest'
import { verifyUpdateSignature } from './verify'
import { crossCheckHeaders } from './envelope'
import { decideTransition } from './transition'
import { signedUpdate } from '../../../fixtures/updates'
const u = signedUpdate({ experimentId: 'e', experimentCode: 'EXP-1', name: 'Quote sent', description: 'd', updateType: 'quote' }, 'sec', 'D1')
describe('signature + header cross-check', () => {
  it('accepts a correct signature over the raw body', () => expect(verifyUpdateSignature(u.rawBody, u.headers['X-Adaptyv-Signature'], 'sec')).toBe(true))
  it('rejects wrong/missing/misformatted signatures', () => { expect(verifyUpdateSignature(u.rawBody, 'sha256=bad', 'sec')).toBe(false); expect(verifyUpdateSignature(u.rawBody, null, 'sec')).toBe(false) })
  it('cross-checks header event + delivery id against the body', () => { expect(crossCheckHeaders(u.headers, u.body)).toBe(true); expect(crossCheckHeaders({ ...u.headers, 'X-Adaptyv-Delivery-Id': 'D9' }, u.body)).toBe(false) })
})
describe('decideTransition', () => { it('forward applies, duplicate/backward ignore, Canceled + terminal', () => {
  expect(decideTransition(null, 'Draft')).toBe('apply'); expect(decideTransition('InQueue', 'Done')).toBe('apply')
  expect(decideTransition('Done', 'Done')).toBe('ignore'); expect(decideTransition('InProduction', 'InQueue')).toBe('ignore')
  expect(decideTransition('InQueue', 'Canceled')).toBe('apply'); expect(decideTransition('Done', 'Canceled')).toBe('ignore') }) })
```
```ts
// status/map.test.ts
import { describe, it, expect } from 'vitest'; import { mapWireStatus } from './map'
describe('mapWireStatus', () => { it('maps valid wire enums and rejects unknown', () => { expect(mapWireStatus('waiting_for_confirmation')).toBe('WaitingForConfirmation'); expect(mapWireStatus('done')).toBe('Done'); expect(mapWireStatus('bogus')).toBeNull() }) })
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement:
```ts
// verify.ts — as R2 verifyUpdateSignature (sha256=<hex>, constant-time)
```
```ts
// envelope.ts
export function crossCheckHeaders(headers: Record<string, string>, body: { event?: string; delivery_id?: string }): boolean {
  return body.event === 'experiment_update' && headers['X-Adaptyv-Event'] === body.event && headers['X-Adaptyv-Delivery-Id'] === body.delivery_id
}
```
```ts
// status/map.ts
import { WIRE_STATUS_MAP } from '@/domain/constants'
import type { ExperimentStatus } from '@/domain/schemas'
export function mapWireStatus(wire: string): ExperimentStatus | null { return (WIRE_STATUS_MAP as Record<string, ExperimentStatus>)[wire] ?? null }
```
```ts
// transition.ts — as R2 decideTransition (official ranks + Canceled)
```
- [ ] **Step 4:** Run → PASS. **Step 5: Commit** `feat(domain): update signature verify + header cross-check + wire status mapping + transitions`.

## Task 3.2: ingestUpdate (timeline message) + refreshStatus (separate)

**Files:** `src/application/{ingestUpdate.ts,refreshStatus.ts}`; Test `tests/ingestUpdate.integration.test.ts`.
- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { getDb, migrate } from '@/infrastructure/db/client'
import { ingestUpdate } from '@/application/ingestUpdate'
import { refreshStatus } from '@/application/refreshStatus'
import { MockFoundryClient } from '@/adapters/foundry/mock'
import { signedUpdate } from '../fixtures/updates'
describe('update ingest + status', () => { let db: ReturnType<typeof getDb>
  beforeEach(() => { db = getDb(':memory:'); migrate(db) })
  it('stores an accepted update as a timeline message and dedups a duplicate', () => {
    const u = signedUpdate({ experimentId: 'e', experimentCode: 'X', name: 'n', description: 'd', updateType: 'quote' }, 'sec', 'D1')
    expect(ingestUpdate(db, { rawBody: u.rawBody, headers: u.headers, secret: 'sec' }).processingStatus).toBe('accepted')
    expect(ingestUpdate(db, { rawBody: u.rawBody, headers: u.headers, secret: 'sec' }).processingStatus).toBe('duplicate') })
  it('rejects an invalid signature and a header mismatch (audit only)', () => {
    const u = signedUpdate({ experimentId: 'e', experimentCode: 'X', name: 'n', description: 'd', updateType: 'quote' }, 'sec', 'D2')
    expect(ingestUpdate(db, { rawBody: u.rawBody, headers: { ...u.headers, 'X-Adaptyv-Signature': 'sha256=bad' }, secret: 'sec' }).processingStatus).toBe('rejected_signature')
    expect(ingestUpdate(db, { rawBody: u.rawBody, headers: { ...u.headers, 'X-Adaptyv-Delivery-Id': 'D9' }, secret: 'sec' }).processingStatus).toBe('rejected_header_mismatch') })
  it('refreshStatus maps the wire status and applies a forward transition', async () => {
    const r = await refreshStatus(db, new MockFoundryClient(), 'e'); expect(r.status).toBe('Done'); expect(r.applied).toBe(true) })
})
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: `src/application/ingestUpdate.ts`** — verify → cross-check → dedup → **store as timeline message** (no status/transition):
```ts
import { verifyUpdateSignature } from '@/domain/webhook/verify'
import { crossCheckHeaders } from '@/domain/webhook/envelope'
import { insertUpdateOnce, appendEvent } from '@/infrastructure/repositories'
import type { getDb } from '@/infrastructure/db/client'
export function ingestUpdate(db: ReturnType<typeof getDb>, input: { rawBody: string; headers: Record<string, string>; secret: string }): { processingStatus: string } {
  if (!verifyUpdateSignature(input.rawBody, input.headers['X-Adaptyv-Signature'] ?? null, input.secret)) { appendEvent(db, { kind: 'update', detail: 'rejected_signature', at: 'na' }); return { processingStatus: 'rejected_signature' } }
  let body: any; try { body = JSON.parse(input.rawBody) } catch { appendEvent(db, { kind: 'update', detail: 'dead_letter', at: 'na' }); return { processingStatus: 'dead_letter' } }
  if (!crossCheckHeaders(input.headers, body)) { appendEvent(db, { kind: 'update', detail: 'rejected_header_mismatch', at: 'na' }); return { processingStatus: 'rejected_header_mismatch' } }
  const fresh = insertUpdateOnce(db, body.delivery_id, { experimentId: body.data.experiment_id, updateType: body.data.update_type, name: body.data.name, description: body.data.description, raw: input.rawBody })
  if (!fresh) return { processingStatus: 'duplicate' }
  appendEvent(db, { kind: 'update', detail: 'accepted', at: 'na' })
  return { processingStatus: 'accepted' }
}
```
- [ ] **Step 4: `src/application/refreshStatus.ts`** — status from the client, mapped, transitioned:
```ts
import type { FoundryClient } from './ports'
import { mapWireStatus } from '@/domain/status/map'
import { decideTransition } from '@/domain/webhook/transition'
import { getExperimentStatusRow, setExperimentStatus, appendEvent } from '@/infrastructure/repositories'
import type { getDb } from '@/infrastructure/db/client'
export async function refreshStatus(db: ReturnType<typeof getDb>, foundry: FoundryClient, experimentId: string): Promise<{ status: string | null; applied: boolean }> {
  const { statusWire } = await foundry.getExperimentStatus(experimentId)
  const mapped = mapWireStatus(statusWire)
  if (!mapped) { appendEvent(db, { kind: 'status', detail: `invalid_wire:${statusWire}`, at: 'na' }); return { status: null, applied: false } }
  const current = getExperimentStatusRow(db, experimentId)
  const applied = decideTransition(current, mapped) === 'apply'
  if (applied) setExperimentStatus(db, experimentId, mapped)
  return { status: mapped, applied }
}
```
- [ ] **Step 5:** Run → PASS. **Step 6: Commit** `feat(application): ingestUpdate (timeline message) + refreshStatus (separate wire→domain)`.

## Task 3.3: Timeline + status + audit UI + local replay

**Files:** `src/app/actions/updates.ts`, `src/components/{TimelineStage,StatusChip,AuditDrawer}.tsx`, `fixtures/update-sequence.ts`.
- [ ] `fixtures/update-sequence.ts`: ordered signed fixtures — a valid update, the **same delivery again** (duplicate), and an **invalid-signature** delivery. `replayNextUpdateAction()` ingests the next; `refreshStatusAction()` calls `refreshStatus`. Timeline (`timeline`) shows accepted update messages; a duplicate shows `dedupe-badge` "applied once" (no new row); `StatusChip` shows the mapped status after refresh; `AuditDrawer` (`audit-drawer`) shows only rejected signatures/header mismatches. No public route. Commit `feat(presentation): update timeline + status chip + audit + local replay`.

**Slice 3 runnable check:** replay valid/duplicate/invalid; dedupe once; invalid only in audit; status advances via getExperimentStatus.

---

# SLICE 4 — Results QC + EvidenceBundle + customer draft + polished UI

*End state: review AC-1..AC-4; generate an evidence-backed draft where every number is renderer-inserted.*

## Task 4.1: Results QC (qcStatus vs bindingClass separated)

**Files:** `src/domain/results/qc.ts`; Test alongside.
- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from 'vitest'
import { classifyCandidate, coefficientOfVariation } from './qc'
import { demoResultRecords } from '../../../fixtures/results'
const byId = (id: string) => demoResultRecords.find(r => r.candidateId === id)!
describe('classifyCandidate (demo-qc-policy@v1)', () => {
  it('AC-1 confirmed_binder, qcStatus pass', () => { const r = classifyCandidate(byId('AC-1')); expect(r.bindingClass).toBe('confirmed_binder'); expect(r.qcStatus).toBe('pass'); expect(r.recommendation).toBe('follow_up') })
  it('AC-2 apparent_binder_poor_fit', () => expect(classifyCandidate(byId('AC-2')).bindingClass).toBe('apparent_binder_poor_fit'))
  it('AC-3 no_detectable_binding is a VALID negative (qcStatus pass)', () => { const r = classifyCandidate(byId('AC-3')); expect(r.bindingClass).toBe('no_detectable_binding'); expect(r.qcStatus).toBe('pass') })
  it('AC-4 inconclusive_replicate_inconsistent', () => expect(classifyCandidate(byId('AC-4')).bindingClass).toBe('inconclusive_replicate_inconsistent'))
  it('control failure fails data quality but is separate from outcome', () => { const r = classifyCandidate({ ...byId('AC-1'), controlOutcome: 'fail' }); expect(r.qcStatus).toBe('fail'); expect(r.warnings).toContain('CONTROL_FAILED') })
  it('negative KD → data-quality fail + no_detectable_binding', () => { const r = classifyCandidate({ ...byId('AC-1'), replicateKdsM: [-1e-9], kdMeanM: -1e-9 }); expect(r.qcStatus).toBe('fail'); expect(r.bindingClass).toBe('no_detectable_binding') })
  it('CV = sample stdev / mean', () => expect(coefficientOfVariation([5e-9, 500e-9, 250e-9])).toBeGreaterThan(0.2))
})
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: `src/domain/results/qc.ts`**
```ts
import type { ResultRecord, QCResult } from '@/domain/schemas'
import { demoQcPolicyV1 as P } from '@/domain/constants'
export function coefficientOfVariation(values: number[]): number { const n = values.length; if (n < 2) return 0
  const mean = values.reduce((a, b) => a + b, 0) / n; return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) / mean }
export function classifyCandidate(rec: ResultRecord): QCResult {
  const warnings: string[] = []
  const kds = rec.replicateKdsM ?? []
  const cv = kds.length ? coefficientOfVariation(kds) : null
  const meanKd = rec.kdMeanM
  const controlFail = rec.controlOutcome === 'fail'
  const kdInvalid = meanKd !== null && (!Number.isFinite(meanKd) || meanKd <= 0)
  if (controlFail) warnings.push('CONTROL_FAILED')
  if (kdInvalid) warnings.push('INVALID_KD')
  const qcStatus: 'pass' | 'fail' = controlFail || kdInvalid ? 'fail' : 'pass'
  const consistent = cv !== null && cv <= P.replicate.cvMax
  const fitPass = rec.rmseMaxSignalPct !== null && rec.rmseMaxSignalPct <= P.fit.rmseMaxPct && rec.fitQualityReported !== 'poor'
  const determinable = meanKd !== null && Number.isFinite(meanKd) && meanKd > 0
  const base = { candidateId: rec.candidateId, qcStatus, appliedThresholds: P.version, controlOutcome: rec.controlOutcome, confidence: rec.confidence,
    affinity: { kdM: determinable ? meanKd : null, ciLowM: null, ciHighM: null },
    replicateConsistency: { cv, consistent }, fitQuality: { rmseMaxSignalPct: rec.rmseMaxSignalPct, reported: rec.fitQualityReported, pass: fitPass } }
  let bindingClass: QCResult['bindingClass']
  if (!determinable) { bindingClass = 'no_detectable_binding'; if (meanKd === null) warnings.push('KD_NOT_DETERMINABLE') }
  else if (!consistent) { bindingClass = 'inconclusive_replicate_inconsistent'; warnings.push('REPLICATE_CV_EXCEEDED') }
  else if (!fitPass) { bindingClass = 'apparent_binder_poor_fit'; warnings.push('LOW_FIT') }
  else if (meanKd <= P.binding.kdMaxBinderM) bindingClass = 'confirmed_binder'
  else bindingClass = 'non_binder'
  const recommendation: QCResult['recommendation'] = qcStatus === 'fail' ? 'drop'
    : bindingClass === 'confirmed_binder' ? 'follow_up'
    : bindingClass === 'apparent_binder_poor_fit' || bindingClass === 'inconclusive_replicate_inconsistent' ? 'inconclusive' : 'drop'
  return { ...base, bindingClass, recommendation, warnings }
}
```
- [ ] **Step 4:** Run → PASS. **Step 5: Commit** `feat(domain): BLI QC (demo-qc-policy@v1) with data-quality vs outcome separation`.

## Task 4.2: Evidence bundle (numeric + categorical) — as R2
Create `src/domain/evidence/bundle.ts` (R2 `buildEvidenceBundle`/`resolveEvidence`, emitting `ev_<id>_{name,class,reco,kd,cv,rmse}`). Test as R2. Commit `feat(domain): evidence bundle`.

## Task 4.3: Draft compose/validate/render (prefix/suffix digits + claimType↔kind)

**Files:** `src/domain/comms/compose.ts`; extend `src/adapters/llm/deterministic.ts`; Test `src/domain/comms/compose.test.ts`.
- [ ] **Step 1: Failing test** — R2 assertions plus: a digit in `prefix`/`suffix` blocks; a `recommendation` claimType referencing a non-`approved_recommendation` record blocks.
```ts
it('blocks a digit in prefix/suffix', () => { const d = draft([{ kind: 'evidence', evidenceId: 'ev_AC-1_kd', claimType: 'confirmed', prefix: 'was 2', suffix: '' }]); expect(validateCustomerDraft(d, bundle).errors.some(e => e.code === 'TEXT_SEGMENT_HAS_NUMBER')).toBe(true) })
it('blocks a claimType/kind mismatch', () => { const d = draft([{ kind: 'evidence', evidenceId: 'ev_AC-1_kd', claimType: 'recommendation', prefix: '', suffix: '' }]); expect(validateCustomerDraft(d, bundle).errors.some(e => e.code === 'CLAIMTYPE_EVIDENCE_MISMATCH')).toBe(true) })
```
(Bundle in the test includes `ev_AC-1_kd` as a `qc_calculation` numeric and `ev_AC-1_reco` as `approved_recommendation` categorical.)
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: `src/domain/comms/compose.ts`**
```ts
import type { CustomerDraft, EvidenceBundle, EvidenceRecord } from '@/domain/schemas'
import { resolveEvidence } from '@/domain/evidence/bundle'
const DIGIT = /\d/
const claimTypeMatchesKind = (claimType: string, kind: EvidenceRecord['kind']) =>
  claimType === 'recommendation' ? kind === 'approved_recommendation' : kind !== 'approved_recommendation'
function formatEvidence(r: EvidenceRecord): string { return r.valueKind === 'categorical' ? (r.categoricalValue ?? r.displayLabel) : `${r.numericValue}${r.unit ? ' ' + r.unit : ''}` }
export function validateCustomerDraft(draft: CustomerDraft, bundle: EvidenceBundle): { ok: boolean; errors: { code: string; detail: string }[] } {
  const errors: { code: string; detail: string }[] = []
  for (const s of draft.segments) {
    if (s.kind === 'text') { if (DIGIT.test(s.text)) errors.push({ code: 'TEXT_SEGMENT_HAS_NUMBER', detail: s.text }); continue }
    if (DIGIT.test(s.prefix) || DIGIT.test(s.suffix)) errors.push({ code: 'TEXT_SEGMENT_HAS_NUMBER', detail: `${s.prefix}|${s.suffix}` })
    const ev = resolveEvidence(bundle, s.evidenceId)
    if (!ev) { errors.push({ code: 'EVIDENCE_NOT_FOUND', detail: s.evidenceId }); continue }
    if (!claimTypeMatchesKind(s.claimType, ev.kind)) errors.push({ code: 'CLAIMTYPE_EVIDENCE_MISMATCH', detail: `${s.claimType} vs ${ev.kind}` })
  }
  return { ok: errors.length === 0, errors }
}
export function renderCustomerDraft(draft: CustomerDraft, bundle: EvidenceBundle): string {
  const v = validateCustomerDraft(draft, bundle); if (!v.ok) throw new Error(`draft not renderable: ${v.errors.map(e => e.code).join(',')}`)
  return draft.segments.map(s => s.kind === 'text' ? s.text : s.prefix + formatEvidence(resolveEvidence(bundle, s.evidenceId)!) + s.suffix).join('')
}
```
- [ ] **Step 4:** extend `deterministic.ts` `draftCustomerUpdate` (as R2, evidence-only segments; recommendation segments reference `ev_<id>_reco`). Run → PASS. **Step 5: Commit** `feat(domain): draft compose/validate/render (prefix/suffix + claimType↔kind, fail-closed)`.

## Task 4.4: reviewResults + draftComms (as R2)
Create `src/application/{reviewResults.ts,draftComms.ts}` (R2 code; `draftCustomerUpdate` returns `{ ok, rendered, draft }` or `{ ok:false, errors }`). Integration test asserts AC-1..AC-4 classes `['confirmed_binder','apparent_binder_poor_fit','no_detectable_binding','inconclusive_replicate_inconsistent']` and a rendered draft containing `AC-1` + `2 nM`. Commit `feat(application): reviewResults + draftComms`.

## Task 4.5: Three-layer results + draft UI (data quality vs outcome)

**Files:** `src/app/actions/results.ts`, `src/components/{ResultsStage,CandidateCard,EvidenceChip,DraftStage}.tsx`.
- [ ] `CandidateCard` renders three bands: MEASURED (`layer-measured-${id}`, contract fields incl. confidence), DETERMINISTIC QC (`layer-qc-${id}`, **two distinct rows: Data quality (`qcStatus`) and Binding outcome (`bindingClass`)**, plus an explicit `Demo QC Policy v1` label), MODEL COMMENTARY (`layer-commentary-${id}`). Evidence chips (`evidence-chip`) open provenance popovers. `DraftStage` renders `resultsAction().draft.rendered` when ok, else a `draft-blocked` red block. Commit `feat(presentation): three-layer results (data quality vs outcome) + evidence-backed draft`.

**Slice 4 runnable check:** review AC-1..AC-4; generate an evidence-backed draft; all numbers renderer-inserted.

---

# SLICE 5 — Playwright + evals + README + Loom hardening

*End state: `demo-ready` gate green.*

## Task 5.1: Playwright full flow (corrected order) + separate fail-closed test + e2e DB isolation

**Files:** `playwright.config.ts`, `e2e/demo.spec.ts`, `e2e/fail-closed.spec.ts`, `e2e/global-setup.ts`, `fixtures/demo.fasta`.
- [ ] **Step 1:** `playwright.config.ts` sets `webServer.command = 'cross-env FOUNDRYOPS_DB_PATH=./data/e2e.db LLM_PROVIDER=stub FOUNDRY_MODE=mock next dev'`, `globalSetup: './e2e/global-setup.ts'` which **deletes `./data/e2e.db*` before the run**.
- [ ] **Step 2: `e2e/demo.spec.ts`** — corrected approval order + explicit replays:
```ts
import { test, expect } from '@playwright/test'
test('full FoundryOps demo flow', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('env-badge')).toHaveText(/MOCK/)
  await page.getByTestId('request-input').fill('Prepare a BLI affinity characterization against EGFR using the attached sequences, six-point concentration series in triplicate. Keep it below the customer budget of $8,000, flag anything suspicious, and do not submit without my approval.')
  await page.getByTestId('fasta-input').setInputFiles('fixtures/demo.fasta')
  await page.getByTestId('run-intake').click()
  await page.getByTestId('target-option-tgt_egfr_human_ecd').click()
  await expect(page.getByTestId('over-budget')).toBeVisible()
  await page.getByTestId('candidate-toggle-AC-7').click(); await page.getByTestId('candidate-toggle-AC-8').click()
  await expect(page.getByTestId('over-budget')).toBeHidden()
  // approval order: request -> capture hash -> edit replicates BEFORE draft -> invalidated -> reissue -> exactly one draft
  await page.getByTestId('request-approval').click()
  const hash1 = await page.getByTestId('hash-chip').innerText()
  await page.getByTestId('edit-replicates').fill('2')
  await expect(page.getByTestId('approval-invalidated')).toBeVisible()
  await page.getByTestId('reissue-approval').click()
  await expect(page.getByTestId('hash-chip')).not.toHaveText(hash1)
  await expect(page.getByTestId('confirm-submit')).toBeDisabled()
  await page.getByTestId('create-draft').click()
  await expect(page.getByTestId('draft-created')).toHaveCount(1)
  // timeline: valid, duplicate, invalid-signature
  await page.getByTestId('goto-timeline').click()
  await page.getByTestId('replay-valid').click()
  await expect(page.getByTestId('timeline')).toContainText('Quote sent')
  await page.getByTestId('replay-duplicate').click()
  await expect(page.getByTestId('dedupe-badge')).toContainText('applied once')
  await page.getByTestId('replay-invalid').click()
  await expect(page.getByTestId('timeline')).not.toContainText('invalid signature')
  await page.getByTestId('open-audit').click()
  await expect(page.getByTestId('audit-drawer')).toContainText(/invalid signature/i)
  await page.getByTestId('refresh-status').click()
  await expect(page.getByTestId('status-chip')).toContainText('Done')
  // results + draft
  await page.getByTestId('goto-results').click()
  for (const id of ['AC-1','AC-2','AC-3','AC-4']) await expect(page.getByTestId(`layer-qc-${id}`)).toBeVisible()
  await page.getByTestId('generate-draft').click()
  await expect(page.getByTestId('evidence-chip').first()).toBeVisible()
})
```
- [ ] **Step 3: `e2e/fail-closed.spec.ts`** — a **separate** test (does not corrupt the happy path) that drives a debug/dev route or a dedicated `?draft=badEvidence` mode showing `draft-blocked` for an invalid segment; assert `create/copy` disabled. (Alternatively an integration test in `tests/` if a UI hook is not warranted; keep it separate from the happy path.)
- [ ] **Step 4:** `npx playwright install chromium`; write `fixtures/demo.fasta`; `npm run test:e2e` → PASS (add missing `data-testid`s to components as needed). **Step 5: Commit** `test(e2e): full flow (corrected approval order, explicit replays) + separate fail-closed test + e2e DB isolation`.

## Task 5.2: Golden/adversarial eval registry (explicit cases)

**Files:** `tests/evals/{registry.ts,suite.test.ts}`.
- [ ] Explicit `EVAL_CASES` covering: `NO_STUB_FIXTURE` (unknown stub), unsupported type blocked, target ambiguity, over-budget math, hash stability + sensitivity (incl. canonicalizerVersion + payloadVersion), single-row consume, update signature + header cross-check, update dedup, QC AC-1..AC-4, **data-quality vs outcome** (control-fail → `qcStatus:'fail'`; AC-3 → `pass`+`no_detectable_binding`), fail-closed (text digit, prefix/suffix digit, missing evidence, claimType/kind mismatch). ≥12 cases, ≥10 adversarial; a meta-test asserts `count(adversarial) >= 10`. No `...` placeholders. Commit `test(evals): explicit adversarial registry (R2.1 cases)`.

## Task 5.3: Foundry contract schemas + mapper tests (SHOULD, after offline green)

**Files:** `src/adapters/foundry/contract/{schemas.ts,mappers.ts}`; Test alongside.
- [ ] Zod wire schemas + mappers for the used operations (targets list, cost-estimate, create-draft response, results) **and the lower_snake_case → domain status mapping** validated against `openapi.snapshot.json` example payloads. Executable HTTP stays STRETCH. Commit `feat(adapters): Foundry contract schemas + mappers (incl. wire status)`.

## Task 5.4: Secret hygiene, README, runbook, demo-ready gate

**Files:** `README.md`, `docs/DEMO_RUNBOOK.md`.
- [ ] Confirm `secret:scan` = `gitleaks detect --no-banner` (**no `|| true`**); `verify` includes `npm audit`. Write the runbook (the §11 scene script, the verbatim triplicate demo request, `fixtures/demo.fasta`, reset `rm -f data/foundryops.db`). Run `npm run verify` then `npm run test:e2e` → green. Commit `chore: secret-hygiene gate + README/runbook + demo-ready`.

**Slice 5 runnable check:** `npm run demo-ready` green from a clean checkout.

---

# STRETCH — Gemini adapter + executable live client

## Task S.1: GeminiLlmAdapter + factory branch + transcript parity (as R2, with the module created alongside the factory branch)
Create `src/adapters/llm/gemini.ts` (structured output + `try/catch` JSON), add the `gemini` branch to `factory.ts` **in the same task**, add offline transcript-parity test, `npm install --save-exact @google/genai@latest` (verify `gemini-3.6-flash` at implementation). Commit `feat(adapters): opt-in GeminiLlmAdapter + transcript parity`.

---

## Self-Review

**1. Spec coverage (R2.1 §21):**
- 1 canonical sources → both docs updated; CSV removed (request+FASTA only, positively stated); no synthetic webhook/public route; `docs/planning/*` marked non-authoritative (banner). ✓
- 2 official update envelope → Task 0.2 (schema, no status/title/content), 0.3 (fixtures, separate `api_version`), 3.1 (verify + header cross-check + status map), 3.2 (timeline message + refreshStatus). ✓
- 3 persistence/authority → Task 2.3 (request payload + full approvals + single-row consume), 2.4 (server-loaded payload, injected DraftIdGenerator, no adapter import), 2.5 (requestApprovalAction(requestId) / createDraftAction(requestId,approvalId)). ✓
- 4 runtime DB → Task 0.1 (demo path), 2.3 (getSharedDb), 5.1 (e2e.db deleted in global-setup); tests `:memory:`. ✓
- 5 approval demo/Playwright → Task 5.1 (corrected order: edit before draft, exactly one draft; explicit valid/duplicate/invalid replays + assertions) + separate fail-closed test. ✓
- 6 dependencies → Task 0.1 (resolve stable, `--save-exact`, lockfile, `npm audit` in verify). ✓
- 7 correctness → NO_STUB_FIXTURE (1.2); non-blocking exclusions (1.3); canonicalizerVersion (2.1); costSnapshotMinor + status=valid (2.2); prefix/suffix + claimType↔kind (4.3); triplicate + contract fields (0.3); qcStatus vs bindingClass (4.1). ✓

**2. Placeholder scan:** every code step shows code; eval registry enumerated; UI tasks list concrete `data-testid`s validated by Task 5.1. No `TBD`/`...`/"similar to".

**3. Type consistency:** ports (`FoundryClient`/`LlmClient`/`DraftIdGenerator`) stable across 0.2/1.5/2.4/3.2; `approvalStatusFor`/`hashDraftPayload`/`consumeApproval`/`insertUpdateOnce`/`mapWireStatus`/`decideTransition`/`classifyCandidate`/`validateCustomerDraft`/`renderCustomerDraft` names stable; cost math 250000/120000/800000 → 970000/730000/4 consistent; triplicate (3 replicate KDs, 18 measurements) consistent between 0.3/4.1.

---

*R2.1 plan; canonical companion `docs/superpowers/specs/2026-07-22-foundryops-mvp-design.md`. `docs/planning/*` are non-authoritative. ADRs 0001–0005 written to `docs/adr/` as decisions are first implemented.*
