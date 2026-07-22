# FoundryOps MVP Implementation Plan (Revision R2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the FoundryOps vertical demo — paste a **BLI affinity characterization** request against EGFR + upload a FASTA, produce a validated budget-aware Foundry **Draft** behind a human approval gate, replay official signed `experiment_update` messages, run deterministic results QC, and draft an evidence-backed customer update whose numbers are all renderer-inserted from evidence — runnable offline in mock mode.

**Architecture:** Layered TypeScript. Pure `domain/` (no framework, no IO) holds all validation, arithmetic, hashing, authorization, QC, evidence assembly, and draft rendering. `application/` orchestrates use-cases and owns SQLite transactions. `adapters/` wraps Foundry and the LLM behind interfaces. `infrastructure/` holds Drizzle/SQLite, crypto, config, logging. `src/app` + `src/components` are the thin presentation layer.

**Tech Stack:** Next.js 15 (App Router) · React 19 · TypeScript strict · Zod · Drizzle ORM + better-sqlite3 · Vitest · Playwright · `@google/genai` (stretch, Gemini adapter only).

## Global Constraints

- Money is integer minor units (cents); never floats. Currency is `'USD'`.
- Request wording is **"BLI affinity characterization"**, never "screening".
- **Input is request text + FASTA only. No CSV.**
- LLM may only (a) propose `RawExtractedIntent` and (b) compose `CustomerDraft` segments that reference evidence. It never writes numbers into prose, validates sequences, computes metrics, resolves approval, decides transitions, or invents values. **No raw residues reach the LLM.**
- Default env: `LLM_PROVIDER=stub`, `FOUNDRY_MODE=mock`. Live Foundry ops non-constructable without a server token.
- Cost model: `totalMinor = 250000 + 120000 * acceptedCandidates`; demo budget `800000`.
- QC policy is `demo-qc-policy@v1` (labelled a demo policy, not Adaptyv production thresholds): `rmseMaxPct = 15`, `cvMax = 0.20`, `kdMaxBinderM = 1e-6`.
- Canonicalizer version: `canon@v1`, included in the hash input.
- Official Foundry lifecycle (domain casing): `Draft, WaitingForConfirmation, QuoteSent, WaitingForMaterials, InQueue, InProduction, DataAnalysis, InReview, Done, Canceled`. Wire casing confirmed from the pinned OpenAPI snapshot via a mapper.
- Official update webhook: event `experiment_update`; headers `X-Adaptyv-Event`, `X-Adaptyv-Delivery-Id`, `X-Adaptyv-Signature`; signature `sha256=<hex HMAC-SHA256 of raw body>`; body `{ delivery_id, event, timestamp, api_version, data }`. **No public webhook route — local signed-fixture replay only.**
- Secrets server-side only; no `NEXT_PUBLIC_` secret; SQLite file outside any served dir.
- TDD: behavior changes are red → green. Commit after each green task. Each slice ends in a runnable product state.
- Repo root: `D:\proyectos\foundryops-claude-bootstrap`. App code lives in `src/`.

---

## File Structure

```
src/domain/{schemas,constants, sequence/fasta, intent/validate, preflight/engine, target/resolve,
  cost/budget, payload/canonical, approval/rules, webhook/{verify,transition}, results/qc,
  evidence/bundle, comms/compose}
src/application/{ports, intake, estimate, approval, createDraft, ingestUpdate, reviewResults, draftComms}
src/adapters/{foundry/{mock,contract,http,factory}, llm/{deterministic,gemini,factory}}
src/infrastructure/{db/{schema,client}, repositories, crypto/{hash,hmac}, config/{env,network-guard}, logging/logger}
src/app/{layout,page,actions/*}  src/components/*
fixtures/*  tests/*  e2e/*
```

---

# SLICE 0 — Executable shell and canonical fixtures

*End state: app boots to an empty workspace; schema + fixture tests green; pinned OpenAPI snapshot recorded.*

## Task 0.1: Scaffold, tooling, env, network guard

**Files:** Create `package.json`, `tsconfig.json`, `next.config.mjs`, `vitest.config.ts`, `.gitignore`, `.env.example`, `src/infrastructure/config/{env.ts,network-guard.ts}`, `tests/setup.ts`.

- [ ] **Step 1: `package.json`**

```json
{
  "name": "foundryops", "private": true, "type": "module",
  "scripts": {
    "dev": "next dev", "build": "next build", "start": "next start",
    "demo": "cross-env LLM_PROVIDER=stub FOUNDRY_MODE=mock next dev",
    "test": "vitest run", "test:e2e": "playwright test", "typecheck": "tsc --noEmit",
    "secret:scan": "gitleaks detect --no-banner",
    "verify": "npm run typecheck && npm run test && npm run build && node scripts/check-client-bundle.mjs",
    "demo-ready": "npm run verify && npm run secret:scan && npm run test:e2e"
  },
  "dependencies": { "next": "15.1.0", "react": "19.0.0", "react-dom": "19.0.0", "zod": "3.24.1", "drizzle-orm": "0.38.3", "better-sqlite3": "11.7.0" },
  "devDependencies": { "typescript": "5.7.2", "@types/node": "22.10.2", "@types/react": "19.0.2", "@types/better-sqlite3": "7.6.12", "vitest": "2.1.8", "drizzle-kit": "0.30.1", "@playwright/test": "1.49.1", "cross-env": "7.0.3" }
}
```

- [ ] **Step 2:** Run `npm install`. Expected: lockfile written. (Verify current versions at install time per RESEARCH_NOTES; install nearest stable if a pin is unavailable and record it.)

- [ ] **Step 3: `tsconfig.json`** (strict)

```json
{ "compilerOptions": { "target": "ES2022", "lib": ["ES2022","DOM","DOM.Iterable"], "module": "ESNext",
  "moduleResolution": "Bundler", "strict": true, "noUncheckedIndexedAccess": true, "exactOptionalPropertyTypes": true,
  "noImplicitOverride": true, "jsx": "preserve", "esModuleInterop": true, "skipLibCheck": true, "resolveJsonModule": true,
  "baseUrl": ".", "paths": { "@/*": ["./src/*"] }, "plugins": [{ "name": "next" }] },
  "include": ["src","tests","e2e","next-env.d.ts",".next/types/**/*.ts"], "exclude": ["node_modules"] }
```

- [ ] **Step 4:** `next.config.mjs` (`export default { serverExternalPackages: ['better-sqlite3'] }`); `.gitignore` (`node_modules .next *.db *.db-* .env .env.local test-artifacts playwright-report data`); `.env.example` (`LLM_PROVIDER=stub`, `FOUNDRY_MODE=mock`, `FOUNDRYOPS_DB_PATH=./data/foundryops.db`, `FOUNDRY_WEBHOOK_SECRET=demo-secret`).

- [ ] **Step 5: `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { environment: 'node', setupFiles: ['./tests/setup.ts'], include: ['src/**/*.test.ts','tests/**/*.test.ts'] },
})
```

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
export function assertLiveAllowed(): void {
  if (env.foundryMode === 'live' && !env.foundryToken) throw new Error('FOUNDRY_MODE=live requires a server-side FOUNDRY_TOKEN')
}
```

- [ ] **Step 7:** `src/infrastructure/config/network-guard.ts` (throws on any non-loopback `net.Socket.connect`) and `tests/setup.ts` (`import { installNetworkGuard } from '@/infrastructure/config/network-guard'; installNetworkGuard()`).

```ts
// network-guard.ts
import net from 'node:net'
export function installNetworkGuard(): void {
  const original = net.Socket.prototype.connect
  ;(net.Socket.prototype as any).connect = function (...args: any[]) {
    const opts = args[0]; const host = typeof opts === 'object' ? opts.host : args[1]
    const ok = host === undefined || host === '127.0.0.1' || host === 'localhost' || host === '::1'
    if (!ok) throw new Error(`Network guard: blocked outbound connection to ${host}`)
    return original.apply(this, args as any)
  }
}
```

- [ ] **Step 8:** Run `npm run typecheck`. Expected: exits 0.
- [ ] **Step 9: Commit** `chore: scaffold FoundryOps TS app (Next.js, Vitest, env, network guard)`.

## Task 0.2: Domain schemas and constants

**Files:** Create `src/domain/constants.ts`, `src/domain/schemas/index.ts`; Test `src/domain/schemas/schemas.test.ts`.

**Interfaces produced:** constants `SETUP_COST_MINOR, PER_CANDIDATE_MINOR, DEMO_BUDGET_MINOR, CANONICALIZER_VERSION, demoQcPolicyV1, EXPERIMENT_STATUS_RANK`; types (Zod-inferred) `RawExtractedIntent, ValidatedAffinityIntent, ExtractedField, Ambiguity, Sequence, SequenceSet, PreflightFinding, Target, TargetResolution, CostEstimate, DraftPayload, Approval, FoundryUpdate, ExperimentStatus, Measurement, ResultRecord, QCResult, EvidenceRecord, EvidenceBundle, CustomerDraftSegment, CustomerDraft`.

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/schemas/schemas.test.ts
import { describe, it, expect } from 'vitest'
import { RawExtractedIntentSchema, ValidatedAffinityIntentSchema, DraftPayloadSchema, CustomerDraftSchema } from './index'
import { demoQcPolicyV1, EXPERIMENT_STATUS_RANK } from '../constants'

describe('domain schemas', () => {
  it('RawExtractedIntent allows unsupported types and null concentrations', () => {
    const raw = RawExtractedIntentSchema.parse({ experimentType: 'screening', method: 'elisa', targetQuery: null,
      requestedCount: null, concentrations: null, replicates: null, budget: null, fields: [], ambiguities: [] })
    expect(raw.experimentType).toBe('screening')
  })
  it('ValidatedAffinityIntent pins affinity/bli and carries policy approvalRequired', () => {
    const v = ValidatedAffinityIntentSchema.parse({ experimentType: 'affinity', method: 'bli', targetQuery: 'EGFR',
      requestedCount: 8, concentrations: [1e-9], replicates: 2, budget: null, approvalRequired: true,
      assayDefaultsApplied: false, fields: [], ambiguities: [] })
    expect(v.approvalRequired).toBe(true)
  })
  it('DraftPayload rejects non-integer money', () => {
    expect(() => DraftPayloadSchema.parse({ method: 'bli', experimentType: 'affinity', targetId: 't', sequences: [],
      concentrations: [], replicates: 2, costTotalMinor: 1.5, currency: 'USD', environment: 'mock',
      operation: 'create_draft', canonicalizerVersion: 'canon@v1', version: 1 })).toThrow()
  })
  it('CustomerDraft segments are text or evidence', () => {
    CustomerDraftSchema.parse({ segments: [{ kind: 'text', text: ' is a ' },
      { kind: 'evidence', evidenceId: 'ev_x', claimType: 'confirmed', prefix: '', suffix: '.' }],
      generatedBy: { adapter: 's', model: 's', promptHash: 'x' }, status: 'draft' })
  })
  it('exposes demo QC policy + status ranks', () => {
    expect(demoQcPolicyV1.version).toBe('demo-qc-policy@v1')
    expect(EXPERIMENT_STATUS_RANK.Done).toBe(9)
  })
})
```

- [ ] **Step 2:** Run `npx vitest run src/domain/schemas/schemas.test.ts`. Expected: FAIL — modules missing.

- [ ] **Step 3: `src/domain/constants.ts`**

```ts
export const SETUP_COST_MINOR = 250_000
export const PER_CANDIDATE_MINOR = 120_000
export const DEMO_BUDGET_MINOR = 800_000
export const CANONICALIZER_VERSION = 'canon@v1'

export const demoQcPolicyV1 = {
  version: 'demo-qc-policy@v1',
  fit: { rmseMaxPct: 15 },
  replicate: { cvMax: 0.2 },
  binding: { kdMaxBinderM: 1e-6 },
} as const

export const EXPERIMENT_STATUS_RANK = {
  Draft: 1, WaitingForConfirmation: 2, QuoteSent: 3, WaitingForMaterials: 4, InQueue: 5,
  InProduction: 6, DataAnalysis: 7, InReview: 8, Done: 9,
} as const
```

- [ ] **Step 4: `src/domain/schemas/index.ts`**

```ts
import { z } from 'zod'
const intMinor = z.number().int()
export const MoneySchema = z.object({ amountMinor: intMinor, currency: z.string().length(3) })
export const ExtractedFieldSchema = z.object({ name: z.string(),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]), confidence: z.number().min(0).max(1),
  sourceSpan: z.object({ start: z.number().int(), end: z.number().int() }).nullable() })
export const AmbiguitySchema = z.object({ field: z.string(), reason: z.string(), options: z.array(z.string()).optional() })

export const RawExtractedIntentSchema = z.object({
  experimentType: z.string(), method: z.string(), targetQuery: z.string().nullable(),
  requestedCount: z.number().int().nullable(), concentrations: z.array(z.number()).nullable(),
  replicates: z.number().int().nullable(), budget: MoneySchema.nullable(),
  fields: z.array(ExtractedFieldSchema), ambiguities: z.array(AmbiguitySchema) })

export const ValidatedAffinityIntentSchema = z.object({
  experimentType: z.literal('affinity'), method: z.literal('bli'), targetQuery: z.string().nullable(),
  requestedCount: z.number().int().nullable(), concentrations: z.array(z.number()), replicates: z.number().int(),
  budget: MoneySchema.nullable(), approvalRequired: z.literal(true), assayDefaultsApplied: z.boolean(),
  fields: z.array(ExtractedFieldSchema), ambiguities: z.array(AmbiguitySchema) })

export const SequenceSchema = z.object({ id: z.string(), rawHeader: z.string(), residues: z.string(),
  chains: z.array(z.string()), length: z.number().int(), normHash: z.string(),
  sourceLoc: z.object({ file: z.string(), lineStart: z.number().int(), lineEnd: z.number().int() }) })
export const SequenceSetSchema = z.object({ sequences: z.array(SequenceSchema), acceptedIds: z.array(z.string()), rejectedIds: z.array(z.string()) })

export const PreflightFindingSchema = z.object({ code: z.string(), severity: z.enum(['error','warning','info']),
  message: z.string(), evidenceLocation: z.object({ sequenceId: z.string().nullable(), position: z.number().int().nullable() }),
  remediation: z.string(), blocksProgression: z.boolean(), duplicateOf: z.string().optional() })

export const TargetSchema = z.object({ foundryTargetId: z.string(), name: z.string(), aliases: z.array(z.string()), organism: z.string(), uniprotId: z.string() })
export const TargetResolutionSchema = z.object({ query: z.string(), chosen: TargetSchema.nullable(),
  alternatives: z.array(TargetSchema), status: z.enum(['resolved','ambiguous','missing']) })

export const CostEstimateSchema = z.object({ foundryQuoteRef: z.string(),
  lineItems: z.array(z.object({ label: z.string(), amountMinor: intMinor })),
  totalMinor: intMinor, currency: z.string().length(3), withinBudget: z.boolean(),
  overageMinor: intMinor, maxWithinBudget: z.number().int().nullable() })

export const DraftPayloadSchema = z.object({ method: z.literal('bli'), experimentType: z.literal('affinity'),
  targetId: z.string(), sequences: z.array(z.object({ id: z.string(), residues: z.string() })),
  concentrations: z.array(z.number()), replicates: z.number().int(), costTotalMinor: intMinor,
  currency: z.string().length(3), environment: z.enum(['mock','sandbox','live']),
  operation: z.enum(['create_draft','confirm_experiment']), canonicalizerVersion: z.string(), version: z.number().int(),
  costEstimateRef: z.string().optional(), requestId: z.string().optional(), canonicalHash: z.string().optional(), createdAt: z.string().optional() })

export const ApprovalSchema = z.object({ id: z.string(), operation: z.enum(['create_draft','confirm_experiment']),
  payloadHash: z.string(), payloadVersion: z.number().int(), requestId: z.string(), actor: z.string(),
  issuedAt: z.string(), expiresAt: z.string(), environment: z.enum(['mock','sandbox','live']),
  costSnapshotMinor: intMinor, status: z.enum(['valid','consumed','expired','invalidated']) })

export const ExperimentStatusSchema = z.enum(['Draft','WaitingForConfirmation','QuoteSent','WaitingForMaterials','InQueue','InProduction','DataAnalysis','InReview','Done','Canceled'])
export const FoundryUpdateSchema = z.object({ deliveryId: z.string(), event: z.literal('experiment_update'),
  timestamp: z.string(), apiVersion: z.string(), signatureVerified: z.boolean(),
  data: z.object({ experimentId: z.string(), updateType: z.string(), status: ExperimentStatusSchema, title: z.string(), content: z.string() }) })

export const MeasurementSchema = z.object({ candidateId: z.string(), concentrationM: z.number(), replicateIndex: z.number().int(), responseValue: z.number() })
export const ResultRecordSchema = z.object({ experimentId: z.string(), candidateId: z.string(),
  replicateKdsM: z.array(z.number()).nullable(), konPerMs: z.number().nullable(), koffPerS: z.number().nullable(),
  kdMeanM: z.number().nullable(), rmseMaxSignalPct: z.number().nullable(),
  fitQualityReported: z.enum(['good','medium','poor']).nullable(), controlOutcome: z.enum(['pass','fail','na']),
  measurements: z.array(MeasurementSchema) })

export const QCResultSchema = z.object({ candidateId: z.string(), qcStatus: z.enum(['pass','fail']),
  bindingClass: z.enum(['confirmed_binder','apparent_binder_poor_fit','no_detectable_binding','inconclusive_replicate_inconsistent','non_binder']),
  affinity: z.object({ kdM: z.number().nullable(), ciLowM: z.number().nullable(), ciHighM: z.number().nullable() }),
  replicateConsistency: z.object({ cv: z.number().nullable(), consistent: z.boolean() }),
  fitQuality: z.object({ rmseMaxSignalPct: z.number().nullable(), reported: z.enum(['good','medium','poor']).nullable(), pass: z.boolean() }),
  controlOutcome: z.enum(['pass','fail','na']), recommendation: z.enum(['follow_up','inconclusive','drop']),
  appliedThresholds: z.string(), warnings: z.array(z.string()) })

export const EvidenceRecordSchema = z.object({ id: z.string(),
  kind: z.enum(['measurement','qc_calculation','control','threshold','classification','approved_recommendation']),
  valueKind: z.enum(['numeric','categorical']), numericValue: z.number().nullable(), unit: z.string().nullable(),
  categoricalValue: z.string().nullable(), displayLabel: z.string(), sourceRef: z.string(), provenanceChain: z.array(z.string()) })
export const EvidenceBundleSchema = z.object({ experimentId: z.string(), records: z.array(EvidenceRecordSchema), summaryStats: z.record(z.string(), z.number()) })

export const CustomerDraftSegmentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), text: z.string() }),
  z.object({ kind: z.literal('evidence'), evidenceId: z.string(), claimType: z.enum(['confirmed','recommendation','inconclusive']), prefix: z.string(), suffix: z.string() }) ])
export const CustomerDraftSchema = z.object({ segments: z.array(CustomerDraftSegmentSchema),
  generatedBy: z.object({ adapter: z.string(), model: z.string(), promptHash: z.string() }), status: z.literal('draft') })

export type RawExtractedIntent = z.infer<typeof RawExtractedIntentSchema>
export type ValidatedAffinityIntent = z.infer<typeof ValidatedAffinityIntentSchema>
export type ExtractedField = z.infer<typeof ExtractedFieldSchema>
export type Ambiguity = z.infer<typeof AmbiguitySchema>
export type Sequence = z.infer<typeof SequenceSchema>
export type SequenceSet = z.infer<typeof SequenceSetSchema>
export type PreflightFinding = z.infer<typeof PreflightFindingSchema>
export type Target = z.infer<typeof TargetSchema>
export type TargetResolution = z.infer<typeof TargetResolutionSchema>
export type CostEstimate = z.infer<typeof CostEstimateSchema>
export type DraftPayload = z.infer<typeof DraftPayloadSchema>
export type Approval = z.infer<typeof ApprovalSchema>
export type ExperimentStatus = z.infer<typeof ExperimentStatusSchema>
export type FoundryUpdate = z.infer<typeof FoundryUpdateSchema>
export type Measurement = z.infer<typeof MeasurementSchema>
export type ResultRecord = z.infer<typeof ResultRecordSchema>
export type QCResult = z.infer<typeof QCResultSchema>
export type EvidenceRecord = z.infer<typeof EvidenceRecordSchema>
export type EvidenceBundle = z.infer<typeof EvidenceBundleSchema>
export type CustomerDraftSegment = z.infer<typeof CustomerDraftSegmentSchema>
export type CustomerDraft = z.infer<typeof CustomerDraftSchema>
```

- [ ] **Step 5:** Run `npx vitest run src/domain/schemas/schemas.test.ts`. Expected: PASS (5).
- [ ] **Step 6: Commit** `feat(domain): R2 Zod contracts (Raw/Validated intent, segments, documented BLI fields)`.

## Task 0.3: Canonical fixtures and pinned OpenAPI snapshot

**Files:** Create `src/infrastructure/crypto/hash.ts`, `fixtures/request.ts`, `fixtures/targets.ts`, `fixtures/candidates.ts`, `fixtures/results.ts`, `fixtures/updates.ts`, `src/adapters/foundry/contract/openapi.snapshot.json`, `src/adapters/foundry/contract/snapshot.meta.ts`; Test `fixtures/fixtures.test.ts`.

**Interfaces produced:** `sha256Hex`; `DEMO_REQUEST_TEXT`, `DEMO_REQUEST_NO_BUDGET`; `demoFasta`; `demoTargets` (2 EGFR constructs); `demoResultRecords` (AC-1..AC-4, multi-concentration); `signedUpdate(data, secret, deliveryId)` → `{ rawBody, headers }`; `SNAPSHOT_API_VERSION = '0.0.2'`, `SNAPSHOT_SHA256`.

- [ ] **Step 1: Write the failing test**

```ts
// fixtures/fixtures.test.ts
import { describe, it, expect } from 'vitest'
import { demoResultRecords } from './results'
import { signedUpdate } from './updates'
import { verifyUpdateSignatureForTest } from './updates'

describe('fixtures', () => {
  it('exposes AC-1..AC-4 result records with populated concentration series', () => {
    expect(demoResultRecords.map(r => r.candidateId)).toEqual(['AC-1','AC-2','AC-3','AC-4'])
    expect(demoResultRecords[0]!.measurements.length).toBeGreaterThanOrEqual(6)
  })
  it('produces a verifiable signed experiment_update', () => {
    const { rawBody, headers } = signedUpdate({ experimentId: 'exp-1', updateType: 'status', status: 'Done', title: 't', content: 'c' }, 'sec', 'D1')
    expect(headers['X-Adaptyv-Event']).toBe('experiment_update')
    expect(verifyUpdateSignatureForTest(rawBody, headers['X-Adaptyv-Signature'], 'sec')).toBe(true)
  })
})
```

- [ ] **Step 2:** Run `npx vitest run fixtures/fixtures.test.ts`. Expected: FAIL.

- [ ] **Step 3:** Create `src/infrastructure/crypto/hash.ts` (`export const sha256Hex = (s: string) => createHash('sha256').update(s,'utf8').digest('hex')`).

- [ ] **Step 4:** Create fixtures.

`fixtures/request.ts`:
```ts
export const DEMO_REQUEST_TEXT = 'Prepare a BLI affinity characterization against EGFR using the attached sequences, six-point concentration series in duplicate. Keep it below the customer budget of $8,000, flag anything suspicious, and do not submit without my approval.'
export const DEMO_REQUEST_NO_BUDGET = 'Prepare a BLI affinity characterization against EGFR using the attached sequences.'
```

`fixtures/targets.ts`:
```ts
import type { Target } from '@/domain/schemas'
export const demoTargets: Target[] = [
  { foundryTargetId: 'tgt_egfr_human_ecd', name: 'EGFR (human ECD)', aliases: ['EGFR'], organism: 'Homo sapiens', uniprotId: 'P00533' },
  { foundryTargetId: 'tgt_egfr_ecd_fc', name: 'EGFR ectodomain-Fc', aliases: ['EGFR'], organism: 'Homo sapiens', uniprotId: 'P00533' },
]
```

`fixtures/candidates.ts` (AC-6 duplicates AC-1; AC-5 malformed `Z`):
```ts
export const demoFasta = [
  '>AC-1 strong binder','MKTAYIAKQR','>AC-2 poor fit','MKQWERTYIPL','>AC-3 no binding','MKLLNQDATAA',
  '>AC-4 contradictory','MKSTVWYACDE','>AC-5 malformed','MKTAYIAKZZ','>AC-6 duplicate of AC-1','MKTAYIAKQR',
  '>AC-7 filler','MKGGHHIILLK','>AC-8 weak binder','MKPPRRSSTTV',
].join('\n') + '\n'
```

`fixtures/results.ts` (documented BLI fields; only AC-1..AC-4; six concentrations × duplicate):
```ts
import type { ResultRecord, Measurement } from '@/domain/schemas'
const CONC = [1e-7, 3e-8, 1e-8, 3e-9, 1e-9, 4e-10]
const series = (candidateId: string, scale: number): Measurement[] =>
  CONC.flatMap((c, i) => [0, 1].map(rep => ({ candidateId, concentrationM: c, replicateIndex: rep, responseValue: Number((scale * (1 - Math.exp(-c / 1e-8))).toFixed(4)) + i * 0 })))
const rec = (candidateId: string, over: Partial<ResultRecord>): ResultRecord => ({ experimentId: 'exp-demo', candidateId,
  replicateKdsM: null, konPerMs: null, koffPerS: null, kdMeanM: null, rmseMaxSignalPct: null,
  fitQualityReported: null, controlOutcome: 'pass', measurements: series(candidateId, 1), ...over })
export const demoResultRecords: ResultRecord[] = [
  rec('AC-1', { replicateKdsM: [2.0e-9, 2.1e-9, 1.95e-9], kdMeanM: 2.02e-9, konPerMs: 3.1e5, koffPerS: 6.3e-4, rmseMaxSignalPct: 4.2, fitQualityReported: 'good' }),
  rec('AC-2', { replicateKdsM: [40e-9, 44e-9, 38e-9], kdMeanM: 40.7e-9, konPerMs: 1.2e5, koffPerS: 4.9e-3, rmseMaxSignalPct: 22.5, fitQualityReported: 'poor' }),
  rec('AC-3', { replicateKdsM: null, kdMeanM: null, rmseMaxSignalPct: null, fitQualityReported: 'poor' }),
  rec('AC-4', { replicateKdsM: [5e-9, 500e-9], kdMeanM: 252.5e-9, rmseMaxSignalPct: 30, fitQualityReported: 'medium' }),
]
```

`fixtures/updates.ts`:
```ts
import { createHmac, timingSafeEqual } from 'node:crypto'
export function signedUpdate(data: { experimentId: string; updateType: string; status: string; title: string; content: string }, secret: string, deliveryId: string) {
  const body = { delivery_id: deliveryId, event: 'experiment_update', timestamp: '2026-07-22T12:00:00Z', api_version: '0.0.2', data }
  const rawBody = JSON.stringify(body)
  const sig = 'sha256=' + createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  return { rawBody, headers: { 'X-Adaptyv-Event': 'experiment_update', 'X-Adaptyv-Delivery-Id': deliveryId, 'X-Adaptyv-Signature': sig } }
}
export function verifyUpdateSignatureForTest(rawBody: string, header: string, secret: string): boolean {
  const m = /^sha256=([0-9a-f]+)$/i.exec(header); if (!m) return false
  const exp = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const a = Buffer.from(exp), b = Buffer.from(m[1]!.toLowerCase()); return a.length === b.length && timingSafeEqual(a, b)
}
```

- [ ] **Step 5:** Create `src/adapters/foundry/contract/openapi.snapshot.json` by downloading the pinned schema, and `snapshot.meta.ts`:
```ts
export const SNAPSHOT_API_VERSION = '0.0.2'
export const SNAPSHOT_SOURCE = 'https://foundry-api-public.adaptyvbio.com/api/v1/openapi.json'
export const SNAPSHOT_SHA256 = '<sha256 of the downloaded file, recorded at pin time>'
```
Record the file's real sha256 into `SNAPSHOT_SHA256` (compute with `node -e "console.log(require('crypto').createHash('sha256').update(require('fs').readFileSync('src/adapters/foundry/contract/openapi.snapshot.json')).digest('hex'))"`). This is the only step that touches the network; it is a one-time pin, not part of CI.

- [ ] **Step 6:** Run `npx vitest run fixtures/fixtures.test.ts`. Expected: PASS (2).
- [ ] **Step 7: Commit** `feat(fixtures): canonical request/FASTA/targets/results/signed-update fixtures + pinned OpenAPI snapshot`.

**Slice 0 runnable check:** `npm run typecheck` passes; `npx vitest run` green. (The empty Next.js workspace shell lands in Task 1.7.)

---

# SLICE 1 — Intake + preflight + target/budget remediation + UI

*End state: paste request + upload FASTA → preflight findings, target ambiguity resolved, over-budget remediated by deselecting AC-7/AC-8, AC-1..AC-4 selected, within budget.*

## Task 1.1: FASTA parsing, normalization, hashing

**Files:** Create `src/domain/sequence/fasta.ts`; Test `src/domain/sequence/fasta.test.ts`.
**Produces:** `parseFasta(text, fileName): Sequence[]`, `normalizeResidues(raw): string`.

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from 'vitest'
import { parseFasta } from './fasta'
const FASTA = '>AC-1 x\nMKT AYIAK\n>AC-6 y\nMKTAYIAK\n'
describe('parseFasta', () => {
  it('parses, normalizes, hashes, and matches duplicates', () => {
    const s = parseFasta(FASTA, 'f')
    expect(s[0]!.residues).toBe('MKTAYIAK'); expect(s[0]!.length).toBe(8)
    expect(s[0]!.normHash).toBe(s[1]!.normHash)
    expect(s[0]!.sourceLoc).toEqual({ file: 'f', lineStart: 1, lineEnd: 2 })
  })
})
```
- [ ] **Step 2:** Run `npx vitest run src/domain/sequence/fasta.test.ts` → FAIL.
- [ ] **Step 3: `src/domain/sequence/fasta.ts`**
```ts
import type { Sequence } from '@/domain/schemas'
import { sha256Hex } from '@/infrastructure/crypto/hash'
export const normalizeResidues = (raw: string) => raw.replace(/\s+/g, '').toUpperCase()
export function parseFasta(text: string, fileName: string): Sequence[] {
  const lines = text.split(/\r?\n/); const out: Sequence[] = []
  let cur: { header: string; id: string; body: string[]; start: number } | null = null
  const flush = (end: number) => { if (!cur) return; const residues = normalizeResidues(cur.body.join(''))
    out.push({ id: cur.id, rawHeader: cur.header, residues, chains: residues.split(':'),
      length: residues.replace(/:/g, '').length, normHash: sha256Hex(residues),
      sourceLoc: { file: fileName, lineStart: cur.start, lineEnd: end } }) }
  lines.forEach((line, i) => { const n = i + 1
    if (line.startsWith('>')) { if (cur) flush(n - 1); const header = line.slice(1).trim()
      cur = { header, id: header.split(/\s+/)[0] ?? `seq-${n}`, body: [], start: n } }
    else if (cur && line.trim() !== '') cur.body.push(line) })
  if (cur) flush(lines.length); return out
}
```
- [ ] **Step 4:** Run test → PASS.
- [ ] **Step 5: Commit** `feat(domain): FASTA parser + residue hashing`.

## Task 1.2: Intent validation split + keyed deterministic adapter

**Files:** Create `src/domain/intent/validate.ts`, `src/application/ports.ts`, `src/adapters/llm/deterministic.ts`, `src/adapters/llm/factory.ts`, `fixtures/intent.ts`; Test `src/domain/intent/validate.test.ts`, `src/adapters/llm/deterministic.test.ts`.

**Produces:** `validateIntent(raw): { ok: true; intent: ValidatedAffinityIntent } | { ok: false; finding: PreflightFinding }`; `LlmClient` port; `DeterministicLlmAdapter`; `buildLlmClient()`; fixtures `demoRawIntent`, `demoRawIntentNoBudget`.

- [ ] **Step 1: Failing tests**
```ts
// src/domain/intent/validate.test.ts
import { describe, it, expect } from 'vitest'
import { validateIntent } from './validate'
import type { RawExtractedIntent } from '@/domain/schemas'
const raw = (o: Partial<RawExtractedIntent>): RawExtractedIntent => ({ experimentType: 'affinity', method: 'bli',
  targetQuery: 'EGFR', requestedCount: 8, concentrations: [1e-9], replicates: 2, budget: null, fields: [], ambiguities: [], ...o })
describe('validateIntent', () => {
  it('blocks unsupported experiment types deterministically', () => {
    const r = validateIntent(raw({ experimentType: 'screening', method: 'elisa' }))
    expect(r.ok).toBe(false); if (!r.ok) expect(r.finding.code).toBe('UNSUPPORTED_EXPERIMENT_TYPE')
  })
  it('applies assay defaults when concentrations/replicates are null and sets policy approvalRequired', () => {
    const r = validateIntent(raw({ concentrations: null, replicates: null }))
    expect(r.ok).toBe(true); if (r.ok) { expect(r.intent.assayDefaultsApplied).toBe(true); expect(r.intent.approvalRequired).toBe(true); expect(r.intent.replicates).toBe(2) }
  })
})
```
```ts
// src/adapters/llm/deterministic.test.ts
import { describe, it, expect } from 'vitest'
import { DeterministicLlmAdapter } from './deterministic'
import { DEMO_REQUEST_TEXT } from '../../../fixtures/request'
describe('DeterministicLlmAdapter.extractIntent', () => {
  it('returns the demo intent for the exact request', async () => {
    const r = await new DeterministicLlmAdapter().extractIntent({ requestText: DEMO_REQUEST_TEXT })
    expect(r.ok).toBe(true); if (r.ok) expect(r.raw.targetQuery).toBe('EGFR')
  })
  it('does not fabricate an intent for arbitrary text (budget stays null, flagged unrecognized)', async () => {
    const r = await new DeterministicLlmAdapter().extractIntent({ requestText: 'hello world' })
    expect(r.ok).toBe(true); if (r.ok) { expect(r.raw.budget).toBeNull(); expect(r.raw.ambiguities.some(a => a.reason === 'unrecognized_request')).toBe(true) }
  })
})
```
- [ ] **Step 2:** Run both → FAIL.
- [ ] **Step 3: `src/domain/intent/validate.ts`**
```ts
import type { RawExtractedIntent, ValidatedAffinityIntent, PreflightFinding } from '@/domain/schemas'
const DEFAULT_CONC = [1e-7, 3e-8, 1e-8, 3e-9, 1e-9, 4e-10]
export function validateIntent(raw: RawExtractedIntent): { ok: true; intent: ValidatedAffinityIntent } | { ok: false; finding: PreflightFinding } {
  if (raw.experimentType !== 'affinity' || raw.method !== 'bli') {
    return { ok: false, finding: { code: 'UNSUPPORTED_EXPERIMENT_TYPE', severity: 'error',
      message: `Only affinity/BLI is supported in this MVP; got ${raw.experimentType}/${raw.method}.`,
      evidenceLocation: { sequenceId: null, position: null }, remediation: 'Resubmit as a BLI affinity characterization.', blocksProgression: true } }
  }
  const assayDefaultsApplied = raw.concentrations === null || raw.replicates === null
  return { ok: true, intent: { experimentType: 'affinity', method: 'bli', targetQuery: raw.targetQuery,
    requestedCount: raw.requestedCount, concentrations: raw.concentrations ?? DEFAULT_CONC, replicates: raw.replicates ?? 2,
    budget: raw.budget, approvalRequired: true, assayDefaultsApplied, fields: raw.fields, ambiguities: raw.ambiguities } }
}
```
- [ ] **Step 4: `src/application/ports.ts`** (FoundryClient + LlmClient + repository interfaces). LlmClient:
```ts
import type { RawExtractedIntent, EvidenceBundle, CustomerDraft, Target, CostEstimate, DraftPayload, ResultRecord } from '@/domain/schemas'
export interface FoundryClient {
  searchTargets(q: { query: string }): Promise<Target[]>
  estimateCost(input: { acceptedCount: number; budgetMinor: number | null }): Promise<CostEstimate>
  createDraft(input: DraftPayload, opts: { operationKey: string }): Promise<{ experimentId: string; draftId: string }>
  getResults(experimentId: string): Promise<ResultRecord[]>
}
export interface LlmClient {
  extractIntent(input: { requestText: string }): Promise<{ ok: true; raw: RawExtractedIntent } | { ok: false; error: string }>
  draftCustomerUpdate(input: { evidenceBundle: EvidenceBundle }): Promise<{ ok: true; draft: CustomerDraft } | { ok: false; error: string }>
}
```
- [ ] **Step 5: `fixtures/intent.ts`**
```ts
import type { RawExtractedIntent } from '@/domain/schemas'
import { DEMO_BUDGET_MINOR } from '@/domain/constants'
export const demoRawIntent: RawExtractedIntent = { experimentType: 'affinity', method: 'bli', targetQuery: 'EGFR',
  requestedCount: 8, concentrations: [1e-7, 3e-8, 1e-8, 3e-9, 1e-9, 4e-10], replicates: 2,
  budget: { amountMinor: DEMO_BUDGET_MINOR, currency: 'USD' },
  fields: [ { name: 'target', value: 'EGFR', confidence: 0.72, sourceSpan: { start: 40, end: 44 } },
    { name: 'method', value: 'bli', confidence: 0.96, sourceSpan: { start: 12, end: 15 } },
    { name: 'budget', value: 8000, confidence: 0.9, sourceSpan: { start: 120, end: 126 } } ],
  ambiguities: [ { field: 'target', reason: 'EGFR resolves to more than one construct', options: ['tgt_egfr_human_ecd', 'tgt_egfr_ecd_fc'] } ] }
export const demoRawIntentNoBudget: RawExtractedIntent = { ...demoRawIntent, budget: null, fields: demoRawIntent.fields.filter(f => f.name !== 'budget') }
```
- [ ] **Step 6: `src/adapters/llm/deterministic.ts`** (extractIntent keyed; draftCustomerUpdate added in Task 4.3)
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
    if (hit) return { ok: true as const, raw: hit }
    return { ok: true as const, raw: { experimentType: 'affinity', method: 'bli', targetQuery: null, requestedCount: null,
      concentrations: null, replicates: null, budget: null, fields: [], ambiguities: [{ field: 'request', reason: 'unrecognized_request' }] } satisfies RawExtractedIntent }
  }
  // draftCustomerUpdate implemented in Task 4.3
  async draftCustomerUpdate() { return { ok: false as const, error: 'not implemented until slice 4' } }
}
```
- [ ] **Step 7: `src/adapters/llm/factory.ts`** — MVP knows only `stub`. (The `gemini` branch + module land together in the Stretch task so no missing import is referenced.)
```ts
import type { LlmClient } from '@/application/ports'
import { DeterministicLlmAdapter } from './deterministic'
export async function buildLlmClient(): Promise<LlmClient> { return new DeterministicLlmAdapter() }
```
- [ ] **Step 8:** Run both tests → PASS.
- [ ] **Step 9: Commit** `feat(domain): intent validation split + request-keyed deterministic LLM adapter`.

## Task 1.3: Preflight engine

**Files:** Create `src/domain/preflight/engine.ts`; Test `src/domain/preflight/engine.test.ts`.
**Produces:** `runPreflight({ sequences, requestedCount }): { findings; sequenceSet }`.

- [ ] **Step 1: Failing test** (invalid residue, duplicate collapsed once, count mismatch) — identical assertions to R1 Task 3 (`INVALID_RESIDUE` at `AC-5` pos 8; `DUPLICATE_SEQUENCE.duplicateOf === 'AC-1'`; accepted `['AC-1','AC-2','AC-3','AC-4','AC-7','AC-8']` after full demo FASTA).
```ts
import { describe, it, expect } from 'vitest'
import { runPreflight } from './engine'
import { parseFasta } from '@/domain/sequence/fasta'
import { demoFasta } from '../../../fixtures/candidates'
describe('runPreflight', () => {
  it('rejects malformed + duplicate and accepts AC-1..AC-4,AC-7,AC-8', () => {
    const { findings, sequenceSet } = runPreflight({ sequences: parseFasta(demoFasta, 'f'), requestedCount: 8 })
    expect(findings.find(f => f.code === 'INVALID_RESIDUE')?.evidenceLocation.sequenceId).toBe('AC-5')
    expect(findings.find(f => f.code === 'DUPLICATE_SEQUENCE')?.duplicateOf).toBe('AC-1')
    expect(sequenceSet.acceptedIds).toEqual(['AC-1','AC-2','AC-3','AC-4','AC-7','AC-8'])
  })
})
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: `src/domain/preflight/engine.ts`** — same engine as R1 Task 3 (codes `EMPTY_INPUT`, `DUPLICATE_ID`, `INVALID_RESIDUE`, `DUPLICATE_SEQUENCE`, `COUNT_MISMATCH`; excluded ids not in `acceptedIds`). Copy that implementation verbatim.
```ts
import type { Sequence, SequenceSet, PreflightFinding } from '@/domain/schemas'
const VALID_AA = new Set('ACDEFGHIKLMNPQRSTVWY'.split(''))
export function runPreflight(input: { sequences: Sequence[]; requestedCount: number | null }): { findings: PreflightFinding[]; sequenceSet: SequenceSet } {
  const { sequences, requestedCount } = input; const findings: PreflightFinding[] = []
  const accepted: string[] = [], rejected: string[] = []; const seenHash = new Map<string, string>(); const seenId = new Set<string>()
  if (sequences.length === 0) { findings.push({ code: 'EMPTY_INPUT', severity: 'error', message: 'No sequences were uploaded.',
    evidenceLocation: { sequenceId: null, position: null }, remediation: 'Upload a FASTA with at least one sequence.', blocksProgression: true })
    return { findings, sequenceSet: { sequences, acceptedIds: [], rejectedIds: [] } } }
  for (const seq of sequences) { let bad = false
    if (seenId.has(seq.id)) { findings.push({ code: 'DUPLICATE_ID', severity: 'error', message: `Duplicate sequence id ${seq.id}.`,
      evidenceLocation: { sequenceId: seq.id, position: null }, remediation: 'Give each sequence a unique id.', blocksProgression: true }); bad = true }
    seenId.add(seq.id)
    const bare = seq.residues.replace(/:/g, ''); const i = [...bare].findIndex(c => !VALID_AA.has(c))
    if (i >= 0) { findings.push({ code: 'INVALID_RESIDUE', severity: 'error', message: `Sequence ${seq.id} has invalid residue '${bare[i]}' at position ${i + 1}.`,
      evidenceLocation: { sequenceId: seq.id, position: i + 1 }, remediation: 'Only the 20 standard amino acids are accepted.', blocksProgression: true }); bad = true }
    const prior = seenHash.get(seq.normHash)
    if (prior !== undefined) { findings.push({ code: 'DUPLICATE_SEQUENCE', severity: 'error', message: `Sequence ${seq.id} is identical to ${prior}.`,
      evidenceLocation: { sequenceId: seq.id, position: null }, remediation: 'Remove the duplicate; it is counted once.', blocksProgression: true, duplicateOf: prior }); bad = true }
    else seenHash.set(seq.normHash, seq.id)
    ;(bad ? rejected : accepted).push(seq.id) }
  if (requestedCount !== null && requestedCount !== sequences.length) findings.push({ code: 'COUNT_MISMATCH', severity: 'warning',
    message: `Requested ${requestedCount} but ${sequences.length} uploaded.`, evidenceLocation: { sequenceId: null, position: null }, remediation: 'Confirm the intended count.', blocksProgression: false })
  return { findings, sequenceSet: { sequences, acceptedIds: accepted, rejectedIds: rejected } }
}
```
- [ ] **Step 4:** Run → PASS. **Step 5: Commit** `feat(domain): preflight engine`.

## Task 1.4: Target resolution + budget (no Infinity)

**Files:** Create `src/domain/target/resolve.ts`, `src/domain/cost/budget.ts`; Tests alongside.
**Produces:** `resolveTarget(query, candidates): TargetResolution`; `applyBudget(totalMinor, budgetMinor): { withinBudget; overageMinor; maxWithinBudget: number | null }`.

- [ ] **Step 1: Failing tests** (ambiguity blocks; budget over → maxWithinBudget 4; **null budget → maxWithinBudget null, not Infinity**)
```ts
// budget.test.ts
import { describe, it, expect } from 'vitest'; import { applyBudget } from './budget'
describe('applyBudget', () => {
  it('over budget for 6 candidates and computes max 4', () => { const r = applyBudget(970000, 800000)
    expect(r.withinBudget).toBe(false); expect(r.overageMinor).toBe(170000); expect(r.maxWithinBudget).toBe(4) })
  it('returns null (never Infinity) when there is no budget', () => { expect(applyBudget(970000, null).maxWithinBudget).toBeNull() })
})
```
```ts
// resolve.test.ts
import { describe, it, expect } from 'vitest'; import { resolveTarget } from './resolve'; import { demoTargets } from '../../../fixtures/targets'
describe('resolveTarget', () => {
  it('is ambiguous for EGFR across two constructs and blocks', () => { const r = resolveTarget('EGFR', demoTargets); expect(r.status).toBe('ambiguous'); expect(r.chosen).toBeNull() })
  it('is missing for null/empty', () => { expect(resolveTarget(null, demoTargets).status).toBe('missing') })
})
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: implementations**
```ts
// src/domain/cost/budget.ts
import { SETUP_COST_MINOR, PER_CANDIDATE_MINOR } from '@/domain/constants'
export function applyBudget(totalMinor: number, budgetMinor: number | null): { withinBudget: boolean; overageMinor: number; maxWithinBudget: number | null } {
  if (budgetMinor === null) return { withinBudget: true, overageMinor: 0, maxWithinBudget: null }
  return { withinBudget: totalMinor <= budgetMinor, overageMinor: Math.max(0, totalMinor - budgetMinor),
    maxWithinBudget: Math.max(0, Math.floor((budgetMinor - SETUP_COST_MINOR) / PER_CANDIDATE_MINOR)) }
}
```
```ts
// src/domain/target/resolve.ts
import type { Target, TargetResolution } from '@/domain/schemas'
export function resolveTarget(query: string | null, candidates: Target[]): TargetResolution {
  if (query === null || query.trim() === '' || candidates.length === 0) return { query: query ?? '', chosen: null, alternatives: candidates, status: 'missing' }
  const q = query.trim().toLowerCase()
  const m = candidates.filter(t => t.name.toLowerCase().includes(q) || t.aliases.some(a => a.toLowerCase() === q))
  if (m.length === 1) return { query, chosen: m[0]!, alternatives: m, status: 'resolved' }
  if (m.length > 1) return { query, chosen: null, alternatives: m, status: 'ambiguous' }
  return { query, chosen: null, alternatives: candidates, status: 'missing' }
}
```
- [ ] **Step 4:** Run → PASS. **Step 5: Commit** `feat(domain): target resolution + budget (nullable max, no Infinity)`.

## Task 1.5: MockFoundryClient + factory

**Files:** Create `src/adapters/foundry/mock.ts`, `src/adapters/foundry/factory.ts`; Test `src/adapters/foundry/mock.test.ts`.
**Produces:** `MockFoundryClient` (searchTargets, estimateCost, createDraft pure/deterministic, getResults → `demoResultRecords`); `mockExperimentId(operationKey)`; `buildFoundryClient()`.

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from 'vitest'; import { MockFoundryClient } from './mock'
describe('MockFoundryClient', () => {
  it('estimates 6-candidate cost over an 800000 budget', async () => { const e = await new MockFoundryClient().estimateCost({ acceptedCount: 6, budgetMinor: 800000 })
    expect(e.totalMinor).toBe(970000); expect(e.withinBudget).toBe(false); expect(e.maxWithinBudget).toBe(4) })
  it('resolves EGFR to two targets', async () => { expect((await new MockFoundryClient().searchTargets({ query: 'EGFR' })).length).toBe(2) })
  it('createDraft id is a deterministic function of operationKey', async () => { const c = new MockFoundryClient()
    const a = await c.createDraft({} as any, { operationKey: 'k' }); const b = await c.createDraft({} as any, { operationKey: 'k' }); expect(a.experimentId).toBe(b.experimentId) })
})
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: `src/adapters/foundry/mock.ts`**
```ts
import type { FoundryClient } from '@/application/ports'
import type { Target, CostEstimate, DraftPayload, ResultRecord } from '@/domain/schemas'
import { SETUP_COST_MINOR, PER_CANDIDATE_MINOR } from '@/domain/constants'
import { applyBudget } from '@/domain/cost/budget'
import { sha256Hex } from '@/infrastructure/crypto/hash'
import { demoTargets } from '../../../fixtures/targets'
import { demoResultRecords } from '../../../fixtures/results'
export const mockExperimentId = (operationKey: string) => `exp_${sha256Hex(operationKey).slice(0, 10)}`
export class MockFoundryClient implements FoundryClient {
  async searchTargets({ query }: { query: string }): Promise<Target[]> { const q = query.trim().toLowerCase()
    return demoTargets.filter(t => t.aliases.some(a => a.toLowerCase() === q) || t.name.toLowerCase().includes(q)) }
  async estimateCost({ acceptedCount, budgetMinor }: { acceptedCount: number; budgetMinor: number | null }): Promise<CostEstimate> {
    const totalMinor = SETUP_COST_MINOR + PER_CANDIDATE_MINOR * acceptedCount; const b = applyBudget(totalMinor, budgetMinor)
    return { foundryQuoteRef: `quote_${acceptedCount}`, currency: 'USD', totalMinor, ...b,
      lineItems: [{ label: 'Assay setup', amountMinor: SETUP_COST_MINOR }, { label: `Per-candidate (${acceptedCount})`, amountMinor: PER_CANDIDATE_MINOR * acceptedCount }] } }
  async createDraft(_p: DraftPayload, opts: { operationKey: string }) { const id = mockExperimentId(opts.operationKey); return { experimentId: id, draftId: id.replace('exp_', 'draft_') } }
  async getResults(_id: string): Promise<ResultRecord[]> { return demoResultRecords }
}
```
- [ ] **Step 4: `src/adapters/foundry/factory.ts`**
```ts
import type { FoundryClient } from '@/application/ports'
import { MockFoundryClient } from './mock'
import { env, assertLiveAllowed } from '@/infrastructure/config/env'
export function buildFoundryClient(): FoundryClient {
  if (env.foundryMode === 'mock') return new MockFoundryClient()
  assertLiveAllowed(); throw new Error('FoundryHttpClient is stretch-only; set FOUNDRY_MODE=mock for the demo')
}
```
- [ ] **Step 5:** Run → PASS. **Step 6: Commit** `feat(adapters): MockFoundryClient + factory`.

## Task 1.6: Intake application service

**Files:** Create `src/application/intake.ts`, `src/application/estimate.ts`; Test `tests/intake.integration.test.ts`.
**Produces:** `runIntake(llm, foundry, requestText, fastaText): Promise<{ rawIntent; intentResult; sequenceSet; findings; resolution }>`; `estimate(foundry, acceptedCount, budgetMinor)`.

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from 'vitest'
import { runIntake } from '@/application/intake'
import { MockFoundryClient } from '@/adapters/foundry/mock'
import { DeterministicLlmAdapter } from '@/adapters/llm/deterministic'
import { DEMO_REQUEST_TEXT } from '../fixtures/request'
import { demoFasta } from '../fixtures/candidates'
describe('runIntake', () => {
  it('extracts, validates, preflights, and reports ambiguous target', async () => {
    const r = await runIntake(new DeterministicLlmAdapter(), new MockFoundryClient(), DEMO_REQUEST_TEXT, demoFasta)
    expect(r.intentResult.ok).toBe(true)
    expect(r.resolution.status).toBe('ambiguous')
    expect(r.sequenceSet.acceptedIds).toEqual(['AC-1','AC-2','AC-3','AC-4','AC-7','AC-8'])
  })
})
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: implementations**
```ts
// src/application/intake.ts
import type { FoundryClient, LlmClient } from './ports'
import { validateIntent } from '@/domain/intent/validate'
import { parseFasta } from '@/domain/sequence/fasta'
import { runPreflight } from '@/domain/preflight/engine'
import { resolveTarget } from '@/domain/target/resolve'
export async function runIntake(llm: LlmClient, foundry: FoundryClient, requestText: string, fastaText: string) {
  const extracted = await llm.extractIntent({ requestText })
  if (!extracted.ok) throw new Error(`extraction failed: ${extracted.error}`)
  const intentResult = validateIntent(extracted.raw)
  const sequences = parseFasta(fastaText, 'upload.fasta')
  const requestedCount = intentResult.ok ? intentResult.intent.requestedCount : null
  const { findings, sequenceSet } = runPreflight({ sequences, requestedCount })
  const query = intentResult.ok ? intentResult.intent.targetQuery : null
  const targets = query ? await foundry.searchTargets({ query }) : []
  const resolution = resolveTarget(query, targets)
  return { rawIntent: extracted.raw, intentResult, sequenceSet, findings, resolution }
}
```
```ts
// src/application/estimate.ts
import type { FoundryClient } from './ports'
export const estimate = (foundry: FoundryClient, acceptedCount: number, budgetMinor: number | null) => foundry.estimateCost({ acceptedCount, budgetMinor })
```
- [ ] **Step 4:** Run → PASS. **Step 5: Commit** `feat(application): intake orchestration`.

## Task 1.7: Intake + remediation UI (real gates) and workspace shell

**Files:** Create `src/app/{layout.tsx,page.tsx,globals.css}`, `src/app/actions/intake.ts`, `src/components/{Shell,Stepper,EnvBadge,IntakeStage,PreflightPanel,TargetPicker,BudgetPanel}.tsx`, `src/infrastructure/logging/logger.ts`.
**Produces:** the workspace shell + intake stage; server action `intakeAction(requestText, fastaText)` returning `{ intentResult, findings, sequenceSet, resolution, cost }` (cost estimated for the accepted count). This is presentation; validated by the Slice-5 Playwright suite.

- [ ] **Step 1:** `logger.ts` (allowlist fields as R1 Task 14 Step 1).
- [ ] **Step 2: `src/app/actions/intake.ts`**
```ts
'use server'
import { buildFoundryClient } from '@/adapters/foundry/factory'
import { buildLlmClient } from '@/adapters/llm/factory'
import { runIntake, estimate } from '@/application/intake'
export async function intakeAction(requestText: string, fastaText: string) {
  const foundry = buildFoundryClient(); const llm = await buildLlmClient()
  const r = await runIntake(llm, foundry, requestText, fastaText)
  const budgetMinor = r.intentResult.ok ? r.intentResult.intent.budget?.amountMinor ?? null : null
  const cost = await estimate(foundry, r.sequenceSet.acceptedIds.length, budgetMinor)
  return { ...r, cost }
}
```
(`estimate` is re-exported from `intake.ts` or imported from `@/application/estimate` — pick one and keep it consistent.)
- [ ] **Step 3:** Build `Shell` (top bar: `EnvBadge` reading `env.foundryMode`, "Live mutations disabled" padlock; left `Stepper`; main slot; bottom action bar; Audit button), `IntakeStage` (request textarea `data-testid="request-input"`, FASTA file input `data-testid="fasta-input"`, `data-testid="run-intake"`), `PreflightPanel` (findings with `data-testid={`finding-${code}`}`), `TargetPicker` (renders `resolution.alternatives` as a **required radio**; `data-testid="target-picker"`; `Continue` disabled while `status==='ambiguous'` and unselected), `BudgetPanel` (`data-testid="over-budget"` when `!cost.withinBudget`; a **candidate checklist** where deselecting AC-7 + AC-8 re-estimates to within budget; `Request approval` disabled until a single target is chosen, budget is satisfied, and exactly AC-1..AC-4 remain selected).
- [ ] **Step 4:** Wire `page.tsx` to hold selected target + selected candidate ids; re-call an estimate action on selection change. Style the three-layer palette variables in `globals.css`.
- [ ] **Step 5:** Manually verify: `npm run demo` → paste the demo request, upload `fixtures/demo.fasta` (written in Task 5.1 or copy `demoFasta`), see two findings, the ambiguous target picker, the over-budget block, and that deselecting AC-7/AC-8 clears it. **Step 6: Commit** `feat(presentation): workspace shell + intake with real ambiguity/budget gates`.

**Slice 1 runnable check:** the app runs from paste → remediated, target-selected, AC-1..AC-4 selected, within budget.

---

# SLICE 2 — Approval + idempotent mock draft + UI

*End state: approve the exact payload → deterministic mock draft persisted in SQLite; editing invalidates; reissue works.*

## Task 2.1: Canonical payload hash (compile-time exhaustive, code-unit ordering)

**Files:** Create `src/domain/payload/canonical.ts`; Test `src/domain/payload/canonical.test.ts`.
**Produces:** `canonicalizeDraftPayload(p): string`, `hashDraftPayload(p): string`.

- [ ] **Step 1: Failing test** — stability under sequence reorder + volatile changes; sensitivity to targetId/cost/currency/environment/operation/sequence-set/residue; throws on non-integer money and unknown field. (Same assertions as R1 Task 5.)
```ts
import { describe, it, expect } from 'vitest'
import { hashDraftPayload, canonicalizeDraftPayload } from './canonical'
import type { DraftPayload } from '@/domain/schemas'
const base: DraftPayload = { method: 'bli', experimentType: 'affinity', targetId: 'tgt_egfr_human_ecd',
  sequences: [{ id: 'AC-1', residues: 'MKTAYIAKQR' }, { id: 'AC-2', residues: 'MKQWERTYIPL' }],
  concentrations: [1e-7, 1e-9], replicates: 2, costTotalMinor: 730000, currency: 'USD', environment: 'mock',
  operation: 'create_draft', canonicalizerVersion: 'canon@v1', version: 1 }
describe('canonical hash', () => {
  it('stable under reorder + volatile change', () => { expect(hashDraftPayload({ ...base, sequences: [base.sequences[1]!, base.sequences[0]!], version: 99, requestId: 'r' })).toBe(hashDraftPayload(base)) })
  it('sensitive to every invalidator', () => { const h = hashDraftPayload(base)
    for (const m of [{ targetId: 'x' }, { costTotalMinor: 730001 }, { currency: 'EUR' }, { environment: 'live' as const }, { operation: 'confirm_experiment' as const }, { sequences: [base.sequences[0]!] }]) expect(hashDraftPayload({ ...base, ...m })).not.toBe(h) })
  it('rejects float money and unknown fields', () => { expect(() => canonicalizeDraftPayload({ ...base, costTotalMinor: 1.5 })).toThrow(/integer/); expect(() => canonicalizeDraftPayload({ ...(base as any), surprise: 1 })).toThrow(/Unclassified/) })
})
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: `src/domain/payload/canonical.ts`** — compile-time exhaustive classification + code-unit comparator.
```ts
import type { DraftPayload } from '@/domain/schemas'
import { sha256Hex } from '@/infrastructure/crypto/hash'
const FIELD_CLASS = { method: 'semantic', experimentType: 'semantic', targetId: 'semantic', sequences: 'semantic',
  concentrations: 'semantic', replicates: 'semantic', costTotalMinor: 'semantic', currency: 'semantic',
  environment: 'semantic', operation: 'semantic', canonicalizerVersion: 'semantic',
  version: 'volatile', costEstimateRef: 'volatile', requestId: 'volatile', canonicalHash: 'volatile', createdAt: 'volatile',
} satisfies Record<keyof DraftPayload, 'semantic' | 'volatile'>
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)   // code-unit, locale-independent
const nfc = (s: string) => s.normalize('NFC')
export function canonicalizeDraftPayload(p: DraftPayload): string {
  for (const k of Object.keys(p)) if (!(k in FIELD_CLASS)) throw new Error(`Unclassified payload field: ${k}`)
  if (!Number.isInteger(p.costTotalMinor)) throw new Error('costTotalMinor must be an integer (minor units)')
  const sequences = [...p.sequences].map(s => ({ id: nfc(s.id), residues: nfc(s.residues) })).sort((a, b) => cmp(a.id, b.id))
  const concentrations = [...p.concentrations].sort((a, b) => a - b)
  const ordered: [string, unknown][] = [ ['method', p.method], ['experimentType', p.experimentType], ['targetId', nfc(p.targetId)],
    ['sequences', sequences], ['concentrations', concentrations], ['replicates', p.replicates], ['costTotalMinor', p.costTotalMinor],
    ['currency', nfc(p.currency)], ['environment', p.environment], ['operation', p.operation], ['canonicalizerVersion', p.canonicalizerVersion] ]
  return JSON.stringify(ordered)
}
export const hashDraftPayload = (p: DraftPayload) => sha256Hex(canonicalizeDraftPayload(p))
```
- [ ] **Step 4:** Run → PASS. **Step 5: Commit** `feat(domain): canonical payload hash (exhaustive classification, code-unit ordering)`.

## Task 2.2: Approval rules (compare hash + version + requestId + operation + env + expiry)

**Files:** Create `src/domain/approval/rules.ts`; Test alongside.
**Produces:** `approvalStatusFor(approval, currentPayload, nowIso, requestId): 'valid' | 'expired' | 'invalidated'`.

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from 'vitest'
import { approvalStatusFor } from './rules'
import { hashDraftPayload } from '@/domain/payload/canonical'
import type { Approval, DraftPayload } from '@/domain/schemas'
const p: DraftPayload = { method: 'bli', experimentType: 'affinity', targetId: 't', sequences: [{ id: 'AC-1', residues: 'MK' }],
  concentrations: [1e-9], replicates: 2, costTotalMinor: 730000, currency: 'USD', environment: 'mock', operation: 'create_draft', canonicalizerVersion: 'canon@v1', version: 3 }
const a: Approval = { id: 'ap', operation: 'create_draft', payloadHash: hashDraftPayload(p), payloadVersion: 3, requestId: 'req-1',
  actor: 'op', issuedAt: '2026-07-22T10:00:00Z', expiresAt: '2026-07-22T10:15:00Z', environment: 'mock', costSnapshotMinor: 730000, status: 'valid' }
describe('approvalStatusFor', () => {
  it('valid for exact payload/version/request before expiry', () => { expect(approvalStatusFor(a, p, '2026-07-22T10:05:00Z', 'req-1')).toBe('valid') })
  it('invalidated on payloadVersion change', () => { expect(approvalStatusFor(a, { ...p, version: 4 }, '2026-07-22T10:05:00Z', 'req-1')).toBe('invalidated') })
  it('invalidated on requestId mismatch', () => { expect(approvalStatusFor(a, p, '2026-07-22T10:05:00Z', 'req-2')).toBe('invalidated') })
  it('expired after expiry', () => { expect(approvalStatusFor(a, p, '2026-07-22T10:20:00Z', 'req-1')).toBe('expired') })
})
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: `src/domain/approval/rules.ts`**
```ts
import type { Approval, DraftPayload } from '@/domain/schemas'
import { hashDraftPayload } from '@/domain/payload/canonical'
export function approvalStatusFor(a: Approval, p: DraftPayload, nowIso: string, requestId: string): 'valid' | 'expired' | 'invalidated' {
  if (a.requestId !== requestId) return 'invalidated'
  if (a.operation !== p.operation) return 'invalidated'
  if (a.environment !== p.environment) return 'invalidated'
  if (a.payloadVersion !== p.version) return 'invalidated'
  if (a.payloadHash !== hashDraftPayload(p)) return 'invalidated'
  if (new Date(nowIso).getTime() > new Date(a.expiresAt).getTime()) return 'expired'
  return 'valid'
}
```
- [ ] **Step 4:** Run → PASS. **Step 5: Commit** `feat(domain): approval freshness bound to hash+version+requestId+op+env+expiry`.

## Task 2.3: Repositories (requests, approvals, draft_operations, update_log, event_log)

**Files:** Create `src/infrastructure/db/{schema.ts,client.ts}`, `src/infrastructure/repositories/index.ts`, `drizzle.config.ts`; Test `tests/repositories.test.ts`.
**Produces:** `getDb(path)`, `migrate(db)`; `seedRequest`, `setRequestState`, `getRequestState`, `seedApproval`, `consumeApproval`, `insertDraftOperationOnce`, `getDraftOperation`, `insertUpdateOnce`, `appendEvent`.

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { getDb, migrate } from '@/infrastructure/db/client'
import { insertUpdateOnce, consumeApproval, seedApproval, insertDraftOperationOnce } from '@/infrastructure/repositories'
describe('repositories', () => { let db: ReturnType<typeof getDb>
  beforeEach(() => { db = getDb(':memory:'); migrate(db) })
  it('dedups an update delivery', () => { const r = { experimentId: 'e', status: 'Done', raw: '{}' }
    expect(insertUpdateOnce(db, 'D1', r)).toBe(true); expect(insertUpdateOnce(db, 'D1', r)).toBe(false) })
  it('consumes an approval once', () => { seedApproval(db, { id: 'ap', payloadHash: 'h', status: 'valid' })
    expect(consumeApproval(db, 'ap')).toBe(true); expect(consumeApproval(db, 'ap')).toBe(false) })
  it('inserts a draft operation once per operationKey', () => {
    expect(insertDraftOperationOnce(db, 'k', { experimentId: 'exp_1', requestId: 'req-1' })).toBe(true)
    expect(insertDraftOperationOnce(db, 'k', { experimentId: 'exp_1', requestId: 'req-1' })).toBe(false) })
})
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** `schema.ts` (Drizzle tables) + `client.ts` (`getDb`, `migrate` executes `CREATE TABLE IF NOT EXISTS` for `requests(id PK, state)`, `approvals(id PK, payload_hash, status, consumed DEFAULT 0)`, `draft_operations(operation_key PK, experiment_id, request_id)`, `update_log(delivery_id PK, experiment_id, status, raw)`, `event_log(id PK AUTOINCREMENT, kind, detail, at)`; `PRAGMA journal_mode=WAL`).
- [ ] **Step 4: `src/infrastructure/repositories/index.ts`** — raw better-sqlite3 statements:
```ts
import type { getDb } from '@/infrastructure/db/client'
type Db = ReturnType<typeof getDb>
const raw = (db: Db) => (db as any).session.client as import('better-sqlite3').Database
export const seedRequest = (db: Db, id: string, state: string) => raw(db).prepare('INSERT OR REPLACE INTO requests (id,state) VALUES (?,?)').run(id, state)
export const setRequestState = (db: Db, id: string, state: string) => raw(db).prepare('UPDATE requests SET state=? WHERE id=?').run(state, id)
export const getRequestState = (db: Db, id: string) => (raw(db).prepare('SELECT state FROM requests WHERE id=?').get(id) as { state: string } | undefined)?.state
export const seedApproval = (db: Db, a: { id: string; payloadHash: string; status: string }) => raw(db).prepare('INSERT INTO approvals (id,payload_hash,status,consumed) VALUES (?,?,?,0)').run(a.id, a.payloadHash, a.status)
export const consumeApproval = (db: Db, id: string) => raw(db).prepare("UPDATE approvals SET consumed=1,status='consumed' WHERE id=? AND consumed=0").run(id).changes === 1
export const insertDraftOperationOnce = (db: Db, key: string, r: { experimentId: string; requestId: string }) => raw(db).prepare('INSERT OR IGNORE INTO draft_operations (operation_key,experiment_id,request_id) VALUES (?,?,?)').run(key, r.experimentId, r.requestId).changes === 1
export const getDraftOperation = (db: Db, key: string) => raw(db).prepare('SELECT experiment_id as experimentId FROM draft_operations WHERE operation_key=?').get(key) as { experimentId: string } | undefined
export const insertUpdateOnce = (db: Db, deliveryId: string, r: { experimentId: string; status: string; raw: string }) => raw(db).prepare('INSERT OR IGNORE INTO update_log (delivery_id,experiment_id,status,raw) VALUES (?,?,?,?)').run(deliveryId, r.experimentId, r.status, r.raw).changes === 1
export const appendEvent = (db: Db, e: { kind: string; detail: string; at: string }) => raw(db).prepare('INSERT INTO event_log (kind,detail,at) VALUES (?,?,?)').run(e.kind, e.detail, e.at)
```
`drizzle.config.ts` as R1.
- [ ] **Step 5:** Run → PASS. **Step 6: Commit** `feat(infra): SQLite schema + request/approval/draft/update repositories`.

## Task 2.4: createDraft use-case (READY_FOR_APPROVAL gate, transactional consume, deterministic id) + buildApproval

**Files:** Create `src/application/createDraft.ts`, `src/application/approval.ts`; Test `tests/createDraft.integration.test.ts`.
**Produces:** `createDraftUseCase(db, { payload, approvalId, requestId, nowIso }): { ok; experimentId?; reason? }`; `buildApproval(payload, { actor, issuedAt, ttlMinutes, requestId }): Approval`.

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { getDb, migrate } from '@/infrastructure/db/client'
import { seedRequest, seedApproval } from '@/infrastructure/repositories'
import { createDraftUseCase } from '@/application/createDraft'
import { hashDraftPayload } from '@/domain/payload/canonical'
import type { DraftPayload } from '@/domain/schemas'
const payload: DraftPayload = { method: 'bli', experimentType: 'affinity', targetId: 'tgt_egfr_human_ecd',
  sequences: [{ id: 'AC-1', residues: 'MKTAYIAKQR' }], concentrations: [1e-9], replicates: 2, costTotalMinor: 730000,
  currency: 'USD', environment: 'mock', operation: 'create_draft', canonicalizerVersion: 'canon@v1', version: 1 }
describe('createDraftUseCase', () => { let db: ReturnType<typeof getDb>
  beforeEach(() => { db = getDb(':memory:'); migrate(db) })
  const seed = () => { seedRequest(db, 'req-1', 'READY_FOR_APPROVAL')
    seedApprovalFull() ; function seedApprovalFull() { const raw = (db as any).session.client
      raw.prepare('INSERT INTO approvals (id,payload_hash,status,consumed,payload_version,request_id,operation,environment) VALUES (?,?,?,0,?,?,?,?)')
        .run('ap-1', hashDraftPayload(payload), 'valid', payload.version, 'req-1', 'create_draft', 'mock') } }
  it('requires READY_FOR_APPROVAL', () => { seedApprovalRow(); const r = createDraftUseCase(db, { payload, approvalId: 'ap-1', requestId: 'req-1', nowIso: '2026-07-22T10:00:00Z' })
    expect(r.ok).toBe(false); expect(r.reason).toBe('REQUEST_NOT_READY')
    function seedApprovalRow() { const raw = (db as any).session.client; raw.prepare('INSERT INTO approvals (id,payload_hash,status,consumed,payload_version,request_id,operation,environment) VALUES (?,?,?,0,?,?,?,?)').run('ap-1', hashDraftPayload(payload), 'valid', payload.version, 'req-1', 'create_draft', 'mock') } })
  it('creates a deterministic draft once and refuses a second consume', () => { seed()
    const a = createDraftUseCase(db, { payload, approvalId: 'ap-1', requestId: 'req-1', nowIso: '2026-07-22T10:00:00Z' })
    expect(a.ok).toBe(true); expect(a.experimentId).toMatch(/^exp_/)
    const b = createDraftUseCase(db, { payload, approvalId: 'ap-1', requestId: 'req-1', nowIso: '2026-07-22T10:00:00Z' })
    expect(b.ok).toBe(false); expect(b.reason).toBe('APPROVAL_NOT_CONSUMABLE') })
})
```
(Extend the `approvals` schema in Task 2.3 with `payload_version`, `request_id`, `operation`, `environment` columns; adjust `seedApproval` and add a `loadApproval(db,id)` helper that maps the row to an `Approval`.)
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: `src/application/createDraft.ts`** — synchronous, one better-sqlite3 transaction; deterministic id from `operationKey`; **no remote call** in mock. Honest note: does not claim remote-HTTP atomicity.
```ts
import type { DraftPayload } from '@/domain/schemas'
import { hashDraftPayload } from '@/domain/payload/canonical'
import { approvalStatusFor } from '@/domain/approval/rules'
import { mockExperimentId } from '@/adapters/foundry/mock'
import { getRequestState, consumeApproval, insertDraftOperationOnce, getDraftOperation, setRequestState, appendEvent } from '@/infrastructure/repositories'
import type { getDb } from '@/infrastructure/db/client'
function loadApproval(db: ReturnType<typeof getDb>, id: string) {
  const row = (db as any).session.client.prepare('SELECT * FROM approvals WHERE id=?').get(id) as any
  if (!row) return null
  return { id: row.id, operation: row.operation, payloadHash: row.payload_hash, payloadVersion: row.payload_version,
    requestId: row.request_id, actor: 'operator', issuedAt: '', expiresAt: row.expires_at ?? '2999-01-01T00:00:00Z',
    environment: row.environment, costSnapshotMinor: 0, status: row.status, consumed: row.consumed } as const
}
export function createDraftUseCase(db: ReturnType<typeof getDb>, input: { payload: DraftPayload; approvalId: string; requestId: string; nowIso: string }): { ok: boolean; experimentId?: string; reason?: string } {
  const rawDb = (db as any).session.client as import('better-sqlite3').Database
  const tx = rawDb.transaction(() => {
    if (getRequestState(db, input.requestId) !== 'READY_FOR_APPROVAL') return { ok: false, reason: 'REQUEST_NOT_READY' }
    const ap = loadApproval(db, input.approvalId)
    if (!ap) return { ok: false, reason: 'APPROVAL_NOT_FOUND' }
    const status = approvalStatusFor(ap as any, input.payload, input.nowIso, input.requestId)
    if (status !== 'valid') return { ok: false, reason: `APPROVAL_${status.toUpperCase()}` }
    if (!consumeApproval(db, input.approvalId)) return { ok: false, reason: 'APPROVAL_NOT_CONSUMABLE' }
    const operationKey = `${input.requestId}::${input.payload.operation}::${hashDraftPayload(input.payload)}`
    const experimentId = mockExperimentId(operationKey)
    insertDraftOperationOnce(db, operationKey, { experimentId, requestId: input.requestId })
    const stored = getDraftOperation(db, operationKey)!.experimentId
    setRequestState(db, input.requestId, 'DRAFT_CREATED')
    appendEvent(db, { kind: 'draft_created', detail: stored, at: input.nowIso })
    return { ok: true, experimentId: stored }
  })
  return tx() as { ok: boolean; experimentId?: string; reason?: string }
}
```
`src/application/approval.ts`: `buildApproval` computing `payloadHash`, `expiresAt = issuedAt + ttl`, binding requestId/operation/environment/payloadVersion.
- [ ] **Step 4:** Run → PASS. **Step 5: Commit** `feat(application): READY_FOR_APPROVAL gate + transactional single-consume mock draft`.

## Task 2.5: Approval UI (distinct capabilities, edit invalidates, reissue)

**Files:** Create `src/app/actions/approval.ts`, `src/components/{ApprovalStage,PayloadDiff,HashChip}.tsx`.
**Produces:** server actions `requestApprovalAction(...)` (sets request `READY_FOR_APPROVAL`, issues an approval) and `createDraftAction(...)` (calls `createDraftUseCase`); the approval stage UI.

- [ ] **Step 1:** `ApprovalStage` shows the exact payload + `HashChip` (`data-testid="hash-chip"`), `Create draft — no lab action, no charge` (`data-testid="create-draft"`, enabled) vs `Confirm & submit to lab` (`data-testid="confirm-submit"`, disabled padlock). On any payload edit: render `PayloadDiff`, change the hash chip, show `data-testid="approval-invalidated"` and require re-issue (`data-testid="reissue-approval"`).
- [ ] **Step 2:** Wire actions to `requestApprovalAction`/`createDraftAction`. Persist a `requestId` in page state.
- [ ] **Step 3:** Manual check: approve → create draft (deterministic id shown); edit a field → invalidated banner + new hash; reissue → create again. **Step 4: Commit** `feat(presentation): approval boundary UI (distinct capabilities, invalidate + reissue)`.

**Slice 2 runnable check:** approve the exact payload → deterministic mock draft; edit invalidates; reissue works.

---

# SLICE 3 — Official signed experiment_update replay + timeline/audit

*End state: replay signed `experiment_update` messages, dedupe once, invalid signature only in audit.*

## Task 3.1: Signature verify + official-lifecycle transition

**Files:** Create `src/domain/webhook/verify.ts`, `src/domain/webhook/transition.ts`; Test `src/domain/webhook/webhook.test.ts`.
**Produces:** `verifyUpdateSignature(rawBody, signatureHeader, secret): boolean`; `decideTransition(current, incoming): 'apply' | 'ignore'`.

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from 'vitest'
import { verifyUpdateSignature } from './verify'
import { decideTransition } from './transition'
import { signedUpdate } from '../../../fixtures/updates'
const { rawBody, headers } = signedUpdate({ experimentId: 'e', updateType: 's', status: 'Done', title: 't', content: 'c' }, 'sec', 'D1')
describe('verifyUpdateSignature', () => {
  it('accepts sha256=<hmac> over raw body', () => expect(verifyUpdateSignature(rawBody, headers['X-Adaptyv-Signature'], 'sec')).toBe(true))
  it('rejects wrong/missing/misformatted signatures', () => {
    expect(verifyUpdateSignature(rawBody, 'sha256=dead', 'sec')).toBe(false)
    expect(verifyUpdateSignature(rawBody, null, 'sec')).toBe(false)
    expect(verifyUpdateSignature(rawBody, headers['X-Adaptyv-Signature'].replace('sha256=', ''), 'sec')).toBe(false) })
})
describe('decideTransition (official lifecycle)', () => {
  it('applies forward, ignores duplicate/backward, honors Canceled + terminal', () => {
    expect(decideTransition(null, 'Draft')).toBe('apply')
    expect(decideTransition('InQueue', 'Done')).toBe('apply')
    expect(decideTransition('Done', 'Done')).toBe('ignore')
    expect(decideTransition('InProduction', 'InQueue')).toBe('ignore')
    expect(decideTransition('InQueue', 'Canceled')).toBe('apply')
    expect(decideTransition('Done', 'Canceled')).toBe('ignore') })
})
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: implementations**
```ts
// src/domain/webhook/verify.ts
import { createHmac, timingSafeEqual } from 'node:crypto'
export function verifyUpdateSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) return false
  const m = /^sha256=([0-9a-f]+)$/i.exec(signatureHeader.trim()); if (!m) return false
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const a = Buffer.from(expected), b = Buffer.from(m[1]!.toLowerCase())
  return a.length === b.length && timingSafeEqual(a, b)
}
```
```ts
// src/domain/webhook/transition.ts
import { EXPERIMENT_STATUS_RANK } from '@/domain/constants'
export function decideTransition(current: string | null, incoming: string): 'apply' | 'ignore' {
  if (incoming === 'Canceled') return current === 'Canceled' || current === 'Done' ? 'ignore' : 'apply'
  const ir = (EXPERIMENT_STATUS_RANK as Record<string, number>)[incoming]; if (!ir) return 'ignore'
  if (current === 'Done' || current === 'Canceled') return 'ignore'
  const cr = current ? (EXPERIMENT_STATUS_RANK as Record<string, number>)[current] ?? 0 : 0
  return ir > cr ? 'apply' : 'ignore'
}
```
- [ ] **Step 4:** Run → PASS. **Step 5: Commit** `feat(domain): official experiment_update signature verify + lifecycle transitions`.

## Task 3.2: ingestUpdate application service

**Files:** Create `src/application/ingestUpdate.ts`; Test `tests/ingestUpdate.integration.test.ts`.
**Produces:** `ingestUpdate(db, { rawBody, signatureHeader, secret, currentStatus }): { processingStatus }` — verify → JSON parse (dead_letter on failure) → dedup by `delivery_id` → transition → append-only log; rejected signatures logged for audit, never applied.

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { getDb, migrate } from '@/infrastructure/db/client'
import { ingestUpdate } from '@/application/ingestUpdate'
import { signedUpdate } from '../fixtures/updates'
describe('ingestUpdate', () => { let db: ReturnType<typeof getDb>
  beforeEach(() => { db = getDb(':memory:'); migrate(db) })
  it('applies once and dedups a duplicate delivery', () => {
    const u = signedUpdate({ experimentId: 'e', updateType: 's', status: 'Done', title: 't', content: 'c' }, 'sec', 'D1')
    expect(ingestUpdate(db, { rawBody: u.rawBody, signatureHeader: u.headers['X-Adaptyv-Signature'], secret: 'sec', currentStatus: 'InQueue' }).processingStatus).toBe('accepted')
    expect(ingestUpdate(db, { rawBody: u.rawBody, signatureHeader: u.headers['X-Adaptyv-Signature'], secret: 'sec', currentStatus: 'Done' }).processingStatus).toBe('duplicate') })
  it('rejects an invalid signature (audit only)', () => {
    const u = signedUpdate({ experimentId: 'e', updateType: 's', status: 'Done', title: 't', content: 'c' }, 'sec', 'D2')
    expect(ingestUpdate(db, { rawBody: u.rawBody, signatureHeader: 'sha256=bad', secret: 'sec', currentStatus: 'InQueue' }).processingStatus).toBe('rejected_signature') })
})
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: `src/application/ingestUpdate.ts`**
```ts
import { verifyUpdateSignature } from '@/domain/webhook/verify'
import { decideTransition } from '@/domain/webhook/transition'
import { insertUpdateOnce, appendEvent } from '@/infrastructure/repositories'
import type { getDb } from '@/infrastructure/db/client'
export function ingestUpdate(db: ReturnType<typeof getDb>, input: { rawBody: string; signatureHeader: string | null; secret: string; currentStatus: string | null }): { processingStatus: string } {
  if (!verifyUpdateSignature(input.rawBody, input.signatureHeader, input.secret)) { appendEvent(db, { kind: 'update', detail: 'rejected_signature', at: 'na' }); return { processingStatus: 'rejected_signature' } }
  let env: any; try { env = JSON.parse(input.rawBody) } catch { appendEvent(db, { kind: 'update', detail: 'dead_letter', at: 'na' }); return { processingStatus: 'dead_letter' } }
  const deliveryId = env.delivery_id as string; const status = env?.data?.status as string; const experimentId = env?.data?.experiment_id as string
  const fresh = insertUpdateOnce(db, deliveryId, { experimentId, status, raw: input.rawBody })
  if (!fresh) return { processingStatus: 'duplicate' }
  const processingStatus = decideTransition(input.currentStatus, status) === 'apply' ? 'accepted' : 'rejected_transition'
  appendEvent(db, { kind: 'update', detail: processingStatus, at: 'na' })
  return { processingStatus }
}
```
- [ ] **Step 4:** Run → PASS. **Step 5: Commit** `feat(application): signed experiment_update ingest (dedup + transition + audit)`.

## Task 3.3: Timeline + audit UI + local replay action

**Files:** Create `src/app/actions/updates.ts`, `src/components/{TimelineStage,AuditDrawer}.tsx`, `fixtures/update-sequence.ts` (an ordered list of signed fixtures incl. a duplicate delivery and one bad-signature fixture).
**Produces:** server action `replayNextUpdateAction()` reading the next signed fixture and calling `ingestUpdate`; timeline UI (`data-testid="timeline"`, applied entries; a `×N deliveries · applied once` dedupe badge) and audit drawer (`data-testid="audit-drawer"`, invalid-signature entries only). **No public webhook route.**

- [ ] **Step 1:** Build the ordered fixture sequence (Draft→…→Done, then a duplicate `Done` delivery, plus one invalid-signature delivery). Wire `replayNextUpdateAction` to advance and ingest.
- [ ] **Step 2:** Timeline renders applied updates; a duplicate shows the dedupe badge, not a new row. Audit drawer shows only `rejected_signature`.
- [ ] **Step 3:** Manual check: replay to Done; replay the duplicate (badge, no increment); open audit to see the rejected signature. **Step 4: Commit** `feat(presentation): update timeline + audit drawer + local signed replay`.

**Slice 3 runnable check:** replay signed updates, dedupe once, invalid signature only in audit.

---

# SLICE 4 — Results QC + EvidenceBundle + customer draft + polished UI

*End state: review AC-1..AC-4; generate an evidence-backed draft where every number is renderer-inserted.*

## Task 4.1: Results QC classifier (Demo QC Policy v1)

**Files:** Create `src/domain/results/qc.ts`; Test `src/domain/results/qc.test.ts`.
**Produces:** `classifyCandidate(rec): QCResult`; `coefficientOfVariation(values): number`.

- [ ] **Step 1: Failing test** — AC-1 confirmed_binder; AC-2 apparent_binder_poor_fit (LOW_FIT); AC-3 no_detectable_binding; AC-4 inconclusive_replicate_inconsistent; control-fail and negative KD → qcStatus fail.
```ts
import { describe, it, expect } from 'vitest'
import { classifyCandidate, coefficientOfVariation } from './qc'
import { demoResultRecords } from '../../../fixtures/results'
import type { ResultRecord } from '@/domain/schemas'
const byId = (id: string) => demoResultRecords.find(r => r.candidateId === id)!
describe('classifyCandidate (demo-qc-policy@v1)', () => {
  it('AC-1 confirmed_binder', () => { const r = classifyCandidate(byId('AC-1')); expect(r.bindingClass).toBe('confirmed_binder'); expect(r.recommendation).toBe('follow_up'); expect(r.qcStatus).toBe('pass') })
  it('AC-2 apparent_binder_poor_fit', () => { const r = classifyCandidate(byId('AC-2')); expect(r.bindingClass).toBe('apparent_binder_poor_fit'); expect(r.warnings).toContain('LOW_FIT') })
  it('AC-3 no_detectable_binding (KD not determinable)', () => { const r = classifyCandidate(byId('AC-3')); expect(r.bindingClass).toBe('no_detectable_binding'); expect(r.affinity.kdM).toBeNull() })
  it('AC-4 inconclusive_replicate_inconsistent', () => { const r = classifyCandidate(byId('AC-4')); expect(r.bindingClass).toBe('inconclusive_replicate_inconsistent'); expect(r.warnings).toContain('REPLICATE_CV_EXCEEDED') })
  it('control failure and non-finite/negative KD fail QC', () => {
    const bad: ResultRecord = { ...byId('AC-1'), controlOutcome: 'fail' }
    expect(classifyCandidate(bad).qcStatus).toBe('fail')
    const neg: ResultRecord = { ...byId('AC-1'), replicateKdsM: [-1e-9], kdMeanM: -1e-9 }
    expect(classifyCandidate(neg).bindingClass).toBe('no_detectable_binding') })
  it('CV = sample stdev / mean', () => expect(coefficientOfVariation([5e-9, 500e-9])).toBeCloseTo(1.386, 2))
})
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: `src/domain/results/qc.ts`**
```ts
import type { ResultRecord, QCResult } from '@/domain/schemas'
import { demoQcPolicyV1 as P } from '@/domain/constants'
export function coefficientOfVariation(values: number[]): number {
  const n = values.length; if (n < 2) return 0
  const mean = values.reduce((a, b) => a + b, 0) / n
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) / mean
}
export function classifyCandidate(rec: ResultRecord): QCResult {
  const warnings: string[] = []
  const kds = rec.replicateKdsM ?? []
  const cv = kds.length ? coefficientOfVariation(kds) : null
  const meanKd = rec.kdMeanM
  const rmse = rec.rmseMaxSignalPct
  const base = { candidateId: rec.candidateId, appliedThresholds: P.version, controlOutcome: rec.controlOutcome,
    affinity: { kdM: meanKd, ciLowM: null, ciHighM: null },
    replicateConsistency: { cv, consistent: cv !== null && cv <= P.replicate.cvMax },
    fitQuality: { rmseMaxSignalPct: rmse, reported: rec.fitQualityReported, pass: rmse !== null && rmse <= P.fit.rmseMaxPct && rec.fitQualityReported !== 'poor' } }
  const controlFail = rec.controlOutcome === 'fail'
  const notDeterminable = meanKd === null || !Number.isFinite(meanKd) || meanKd <= 0
  if (controlFail || notDeterminable) {
    if (controlFail) warnings.push('CONTROL_FAILED')
    if (notDeterminable) warnings.push('KD_NOT_DETERMINABLE')
    return { ...base, qcStatus: 'fail', bindingClass: 'no_detectable_binding', recommendation: 'drop', warnings, affinity: { kdM: null, ciLowM: null, ciHighM: null } }
  }
  if (!base.replicateConsistency.consistent) { warnings.push('REPLICATE_CV_EXCEEDED')
    return { ...base, qcStatus: 'pass', bindingClass: 'inconclusive_replicate_inconsistent', recommendation: 'inconclusive', warnings } }
  if (!base.fitQuality.pass) { warnings.push('LOW_FIT')
    return { ...base, qcStatus: 'pass', bindingClass: 'apparent_binder_poor_fit', recommendation: 'inconclusive', warnings } }
  if (meanKd <= P.binding.kdMaxBinderM) return { ...base, qcStatus: 'pass', bindingClass: 'confirmed_binder', recommendation: 'follow_up', warnings }
  return { ...base, qcStatus: 'pass', bindingClass: 'non_binder', recommendation: 'drop', warnings }
}
```
- [ ] **Step 4:** Run → PASS. **Step 5: Commit** `feat(domain): BLI results QC (demo-qc-policy@v1, control/non-finite fail)`.

## Task 4.2: Evidence bundle (numeric + categorical)

**Files:** Create `src/domain/evidence/bundle.ts`; Test alongside.
**Produces:** `buildEvidenceBundle(experimentId, pairs): EvidenceBundle`; `resolveEvidence(bundle, id): EvidenceRecord | undefined`. Emits per candidate: `ev_<id>_name` (categorical), `ev_<id>_class` (categorical), `ev_<id>_reco` (categorical), `ev_<id>_kd` (numeric nM), `ev_<id>_cv` (numeric ratio), `ev_<id>_rmse` (numeric pct).

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from 'vitest'
import { buildEvidenceBundle, resolveEvidence } from './bundle'
import { classifyCandidate } from '@/domain/results/qc'
import { demoResultRecords } from '../../../fixtures/results'
const rec = demoResultRecords[0]!
describe('buildEvidenceBundle', () => {
  it('emits numeric and categorical records', () => {
    const b = buildEvidenceBundle('exp-1', [{ record: rec, qc: classifyCandidate(rec) }])
    expect(resolveEvidence(b, 'ev_AC-1_kd')).toMatchObject({ valueKind: 'numeric', unit: 'nM' })
    expect(resolveEvidence(b, 'ev_AC-1_kd')!.numericValue).toBeCloseTo(2.0, 1)
    expect(resolveEvidence(b, 'ev_AC-1_class')).toMatchObject({ valueKind: 'categorical', categoricalValue: 'confirmed binder' })
    expect(resolveEvidence(b, 'ev_AC-1_reco')!.categoricalValue).toBe('recommended for follow-up')
  })
})
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: `src/domain/evidence/bundle.ts`**
```ts
import type { ResultRecord, QCResult, EvidenceRecord, EvidenceBundle } from '@/domain/schemas'
const CLASS_LABEL: Record<string, string> = { confirmed_binder: 'confirmed binder', apparent_binder_poor_fit: 'apparent binder with a poor fit',
  no_detectable_binding: 'not a detectable binder', inconclusive_replicate_inconsistent: 'inconclusive due to inconsistent replicates', non_binder: 'a non-binder' }
const RECO_LABEL: Record<string, string> = { follow_up: 'recommended for follow-up', inconclusive: 'flagged as inconclusive', drop: 'not recommended for follow-up' }
export function buildEvidenceBundle(experimentId: string, pairs: { record: ResultRecord; qc: QCResult }[]): EvidenceBundle {
  const records: EvidenceRecord[] = []
  const cat = (id: string, kind: EvidenceRecord['kind'], v: string, label: string, ref: string): EvidenceRecord => ({ id, kind, valueKind: 'categorical', numericValue: null, unit: null, categoricalValue: v, displayLabel: label, sourceRef: ref, provenanceChain: [ref] })
  const num = (id: string, kind: EvidenceRecord['kind'], v: number, unit: string, label: string, ref: string): EvidenceRecord => ({ id, kind, valueKind: 'numeric', numericValue: v, unit, categoricalValue: null, displayLabel: label, sourceRef: ref, provenanceChain: [ref] })
  for (const { record, qc } of pairs) { const cid = record.candidateId
    records.push(cat(`ev_${cid}_name`, 'classification', cid, `${cid} name`, `${cid}:id`))
    records.push(cat(`ev_${cid}_class`, 'classification', CLASS_LABEL[qc.bindingClass] ?? qc.bindingClass, `${cid} class`, `${cid}:qc`))
    records.push(cat(`ev_${cid}_reco`, 'approved_recommendation', RECO_LABEL[qc.recommendation] ?? qc.recommendation, `${cid} recommendation`, `${cid}:qc`))
    if (qc.affinity.kdM !== null) records.push(num(`ev_${cid}_kd`, 'qc_calculation', Number((qc.affinity.kdM * 1e9).toFixed(1)), 'nM', `${cid} mean KD`, `${cid}:kd_mean`))
    if (qc.replicateConsistency.cv !== null) records.push(num(`ev_${cid}_cv`, 'qc_calculation', Number(qc.replicateConsistency.cv.toFixed(3)), 'ratio', `${cid} replicate CV`, `${cid}:cv`))
    if (record.rmseMaxSignalPct !== null) records.push(num(`ev_${cid}_rmse`, 'measurement', record.rmseMaxSignalPct, '%', `${cid} rmse_max_signal_pct`, `${cid}:rmse`)) }
  const binders = pairs.filter(p => p.qc.bindingClass === 'confirmed_binder').length
  return { experimentId, records, summaryStats: { candidateCount: pairs.length, confirmedBinders: binders } }
}
export const resolveEvidence = (b: EvidenceBundle, id: string) => b.records.find(r => r.id === id)
```
- [ ] **Step 4:** Run → PASS. **Step 5: Commit** `feat(domain): evidence bundle with numeric + categorical records`.

## Task 4.3: Structured-segment draft — compose, validate (fail-closed), render

**Files:** Create `src/domain/comms/compose.ts`; extend `src/adapters/llm/deterministic.ts` (`draftCustomerUpdate`); Test `src/domain/comms/compose.test.ts`.
**Produces:** `validateCustomerDraft(draft, bundle): { ok; errors }`; `renderCustomerDraft(draft, bundle): string`; deterministic `draftCustomerUpdate` returning evidence-only segments (no digits in text).

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from 'vitest'
import { validateCustomerDraft, renderCustomerDraft } from './compose'
import type { CustomerDraft, EvidenceBundle } from '@/domain/schemas'
const bundle: EvidenceBundle = { experimentId: 'e', summaryStats: {}, records: [
  { id: 'ev_AC-1_name', kind: 'classification', valueKind: 'categorical', numericValue: null, unit: null, categoricalValue: 'AC-1', displayLabel: 'n', sourceRef: 'r', provenanceChain: [] },
  { id: 'ev_AC-1_kd', kind: 'qc_calculation', valueKind: 'numeric', numericValue: 2.0, unit: 'nM', categoricalValue: null, displayLabel: 'k', sourceRef: 'r', provenanceChain: [] } ] }
const draft = (segs: CustomerDraft['segments']): CustomerDraft => ({ segments: segs, generatedBy: { adapter: 's', model: 's', promptHash: 'x' }, status: 'draft' })
describe('customer draft compose', () => {
  it('renders inserting values from evidence', () => {
    const d = draft([{ kind: 'evidence', evidenceId: 'ev_AC-1_name', claimType: 'confirmed', prefix: '', suffix: '' }, { kind: 'text', text: ' binds with KD ' }, { kind: 'evidence', evidenceId: 'ev_AC-1_kd', claimType: 'confirmed', prefix: '', suffix: '.' }])
    expect(validateCustomerDraft(d, bundle).ok).toBe(true)
    expect(renderCustomerDraft(d, bundle)).toBe('AC-1 binds with KD 2 nM.')
  })
  it('blocks a text segment that contains a number', () => {
    expect(validateCustomerDraft(draft([{ kind: 'text', text: 'KD 2.0 nM improvement of 40%' }]), bundle).errors.some(e => e.code === 'TEXT_SEGMENT_HAS_NUMBER')).toBe(true) })
  it('blocks a missing evidence id (fail-closed)', () => {
    expect(validateCustomerDraft(draft([{ kind: 'evidence', evidenceId: 'ev_nope', claimType: 'confirmed', prefix: '', suffix: '' }]), bundle).errors.some(e => e.code === 'EVIDENCE_NOT_FOUND')).toBe(true) })
})
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: `src/domain/comms/compose.ts`**
```ts
import type { CustomerDraft, EvidenceBundle, EvidenceRecord } from '@/domain/schemas'
import { resolveEvidence } from '@/domain/evidence/bundle'
const DIGIT = /\d/
function formatEvidence(r: EvidenceRecord): string {
  if (r.valueKind === 'categorical') return r.categoricalValue ?? r.displayLabel
  const v = r.numericValue as number; return `${v}${r.unit ? ' ' + r.unit : ''}`
}
export function validateCustomerDraft(draft: CustomerDraft, bundle: EvidenceBundle): { ok: boolean; errors: { code: string; detail: string }[] } {
  const errors: { code: string; detail: string }[] = []
  for (const s of draft.segments) {
    if (s.kind === 'text') { if (DIGIT.test(s.text)) errors.push({ code: 'TEXT_SEGMENT_HAS_NUMBER', detail: s.text }) }
    else if (!resolveEvidence(bundle, s.evidenceId)) errors.push({ code: 'EVIDENCE_NOT_FOUND', detail: s.evidenceId })
  }
  return { ok: errors.length === 0, errors }
}
export function renderCustomerDraft(draft: CustomerDraft, bundle: EvidenceBundle): string {
  const v = validateCustomerDraft(draft, bundle)
  if (!v.ok) throw new Error(`draft not renderable: ${v.errors.map(e => e.code).join(',')}`)
  return draft.segments.map(s => s.kind === 'text' ? s.text : s.prefix + formatEvidence(resolveEvidence(bundle, s.evidenceId)!) + s.suffix).join('')
}
```
- [ ] **Step 4: extend `src/adapters/llm/deterministic.ts`** `draftCustomerUpdate` to emit evidence-only segments (no digit in any text segment):
```ts
async draftCustomerUpdate({ evidenceBundle }: { evidenceBundle: import('@/domain/schemas').EvidenceBundle }) {
  const has = (id: string) => evidenceBundle.records.some(r => r.id === id)
  const segments: import('@/domain/schemas').CustomerDraftSegment[] = []
  for (const cid of ['AC-1', 'AC-2', 'AC-3', 'AC-4']) {
    if (!has(`ev_${cid}_class`)) continue
    segments.push({ kind: 'evidence', evidenceId: `ev_${cid}_name`, claimType: 'confirmed', prefix: '', suffix: '' })
    segments.push({ kind: 'text', text: ' is ' })
    segments.push({ kind: 'evidence', evidenceId: `ev_${cid}_class`, claimType: 'confirmed', prefix: '', suffix: '' })
    if (has(`ev_${cid}_kd`)) { segments.push({ kind: 'text', text: ' with a dissociation constant of ' })
      segments.push({ kind: 'evidence', evidenceId: `ev_${cid}_kd`, claimType: 'confirmed', prefix: '', suffix: '' }) }
    segments.push({ kind: 'text', text: ' and is ' })
    segments.push({ kind: 'evidence', evidenceId: `ev_${cid}_reco`, claimType: 'recommendation', prefix: '', suffix: '.' })
    segments.push({ kind: 'text', text: '\n' })
  }
  return { ok: true as const, draft: { segments, generatedBy: { adapter: 'deterministic', model: 'stub', promptHash: 'fixed' }, status: 'draft' as const } }
}
```
- [ ] **Step 5:** Run → PASS. **Step 6: Commit** `feat(domain): structured-segment draft compose/validate/render (renderer inserts values)`.

## Task 4.4: reviewResults + draftComms application

**Files:** Create `src/application/reviewResults.ts`, `src/application/draftComms.ts`; Test `tests/results.integration.test.ts`.
**Produces:** `reviewResults(foundry, experimentId): Promise<{ pairs; bundle }>`; `draftCustomerUpdate(llm, bundle): Promise<{ ok; rendered?; draft?; errors? }>`.

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from 'vitest'
import { MockFoundryClient } from '@/adapters/foundry/mock'
import { DeterministicLlmAdapter } from '@/adapters/llm/deterministic'
import { reviewResults } from '@/application/reviewResults'
import { draftCustomerUpdate } from '@/application/draftComms'
describe('results + draft', () => {
  it('reviews AC-1..AC-4 and renders an evidence-backed draft', async () => {
    const { pairs, bundle } = await reviewResults(new MockFoundryClient(), 'exp-demo')
    expect(pairs.map(p => p.qc.bindingClass)).toEqual(['confirmed_binder','apparent_binder_poor_fit','no_detectable_binding','inconclusive_replicate_inconsistent'])
    const r = await draftCustomerUpdate(new DeterministicLlmAdapter(), bundle)
    expect(r.ok).toBe(true); expect(r.rendered).toContain('AC-1'); expect(r.rendered).toContain('2 nM')
  })
})
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: implementations**
```ts
// src/application/reviewResults.ts
import type { FoundryClient } from './ports'
import { classifyCandidate } from '@/domain/results/qc'
import { buildEvidenceBundle } from '@/domain/evidence/bundle'
export async function reviewResults(foundry: FoundryClient, experimentId: string) {
  const records = await foundry.getResults(experimentId)
  const pairs = records.map(record => ({ record, qc: classifyCandidate(record) }))
  return { pairs, bundle: buildEvidenceBundle(experimentId, pairs) }
}
```
```ts
// src/application/draftComms.ts
import type { LlmClient } from './ports'
import type { EvidenceBundle } from '@/domain/schemas'
import { validateCustomerDraft, renderCustomerDraft } from '@/domain/comms/compose'
export async function draftCustomerUpdate(llm: LlmClient, bundle: EvidenceBundle) {
  const res = await llm.draftCustomerUpdate({ evidenceBundle: bundle })
  if (!res.ok) return { ok: false, errors: [{ code: 'LLM_ERROR', detail: res.error }] }
  const v = validateCustomerDraft(res.draft, bundle)
  if (!v.ok) return { ok: false, draft: res.draft, errors: v.errors }
  return { ok: true, draft: res.draft, rendered: renderCustomerDraft(res.draft, bundle) }
}
```
- [ ] **Step 4:** Run → PASS. **Step 5: Commit** `feat(application): reviewResults + evidence-backed draftComms`.

## Task 4.5: Three-layer results + draft UI

**Files:** Create `src/app/actions/results.ts`, `src/components/{ResultsStage,CandidateCard,EvidenceChip,DraftStage}.tsx`.
**Produces:** server action `resultsAction(experimentId)` returning `{ pairs, bundle, draft }` (draft via `draftCustomerUpdate`); the three-layer results UI + draft UI.

- [ ] **Step 1:** `CandidateCard` renders three bands with `data-testid={`layer-measured-${id}`}` (documented BLI fields, monospace, lock icon), `data-testid={`layer-qc-${id}`}` (Demo QC Policy v1 badges incl. an explicit `Demo QC Policy v1` label, teal, shield icon), `data-testid={`layer-commentary-${id}`}` (rendered draft prose, violet). Each numeric badge is an `EvidenceChip` (`data-testid="evidence-chip"`) opening a provenance popover.
- [ ] **Step 2:** `DraftStage` renders `resultsAction().draft`; when `draft.ok === false`, render the offending segment as a red `data-testid="draft-blocked"` block and disable copy/mark-ready. When `ok`, render `rendered` with evidence chips; show `Not sent — manual send only`.
- [ ] **Step 3:** Manual check: review AC-1..AC-4; every number is renderer-inserted; expand two chips; confirm the model never emits a raw number (temporarily feed a bad draft to see the fail-closed block). **Step 4: Commit** `feat(presentation): three-layer results + evidence-backed draft UI`.

**Slice 4 runnable check:** review AC-1..AC-4; generate an evidence-backed draft; all numbers renderer-inserted.

---

# SLICE 5 — Playwright + evals + README + Loom hardening

*End state: `demo-ready` gate green.*

## Task 5.1: Playwright full scripted flow

**Files:** Create `playwright.config.ts`, `e2e/demo.spec.ts`, `fixtures/demo.fasta` (the `demoFasta` contents).
**Produces:** an e2e spec exercising the entire flow (P1.11).

- [ ] **Step 1: Write the failing spec**
```ts
// e2e/demo.spec.ts
import { test, expect } from '@playwright/test'
test('full FoundryOps demo flow', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('env-badge')).toHaveText(/MOCK/)
  await page.getByTestId('request-input').fill('Prepare a BLI affinity characterization against EGFR using the attached sequences, six-point concentration series in duplicate. Keep it below the customer budget of $8,000, flag anything suspicious, and do not submit without my approval.')
  await page.getByTestId('fasta-input').setInputFiles('fixtures/demo.fasta')
  await page.getByTestId('run-intake').click()
  // resolve target ambiguity
  await expect(page.getByTestId('target-picker')).toBeVisible()
  await page.getByTestId('target-option-tgt_egfr_human_ecd').click()
  // remediate budget by deselecting AC-7/AC-8
  await expect(page.getByTestId('over-budget')).toBeVisible()
  await page.getByTestId('candidate-toggle-AC-7').click()
  await page.getByTestId('candidate-toggle-AC-8').click()
  await expect(page.getByTestId('over-budget')).toBeHidden()
  // approve exact payload, then invalidate + reissue
  await page.getByTestId('request-approval').click()
  await expect(page.getByTestId('confirm-submit')).toBeDisabled()
  await page.getByTestId('create-draft').click()
  await expect(page.getByTestId('hash-chip')).toBeVisible()
  await page.getByTestId('edit-replicates').fill('3')
  await expect(page.getByTestId('approval-invalidated')).toBeVisible()
  await page.getByTestId('reissue-approval').click()
  await page.getByTestId('create-draft').click()
  // replay + dedupe a signed update; invalid signature only in audit
  await page.getByTestId('goto-timeline').click()
  await page.getByTestId('replay-update').click()  // advance to Done
  await page.getByTestId('replay-duplicate').click()
  await expect(page.getByTestId('dedupe-badge')).toContainText('applied once')
  await page.getByTestId('open-audit').click()
  await expect(page.getByTestId('audit-drawer')).toContainText(/invalid signature/i)
  // review AC-1..AC-4 and generate an evidence-backed draft
  await page.getByTestId('goto-results').click()
  for (const id of ['AC-1','AC-2','AC-3','AC-4']) await expect(page.getByTestId(`layer-qc-${id}`)).toBeVisible()
  await page.getByTestId('generate-draft').click()
  await expect(page.getByTestId('evidence-chip').first()).toBeVisible()
})
```
- [ ] **Step 2:** `playwright.config.ts` (webServer `npm run demo`, baseURL `http://127.0.0.1:3000`); write `fixtures/demo.fasta`.
- [ ] **Step 3:** `npx playwright install chromium`.
- [ ] **Step 4:** `npm run test:e2e` → PASS. Add any missing `data-testid`s to components to satisfy selectors (adjust components, not assertions).
- [ ] **Step 5: Commit** `test(e2e): full scripted demo flow (ambiguity, budget, approval reissue, dedupe, audit, results, draft)`.

## Task 5.2: Golden/adversarial eval registry (8–10 explicit cases)

**Files:** Create `tests/evals/registry.ts`, `tests/evals/suite.test.ts`.
**Produces:** `EVAL_CASES: { id; layer; adversarial; run }[]` — 11 explicit cases (9 adversarial), no placeholders; a meta-test asserting ≥8 adversarial.

- [ ] **Step 1: Write the failing meta + suite test**
```ts
// tests/evals/suite.test.ts
import { describe, it, expect } from 'vitest'
import { EVAL_CASES } from './registry'
describe('eval suite', () => {
  it('has >= 8 adversarial cases', () => expect(EVAL_CASES.filter(c => c.adversarial).length).toBeGreaterThanOrEqual(8))
  for (const c of EVAL_CASES) it(`${c.id} [${c.layer}]`, async () => { await c.run() })
})
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: `tests/evals/registry.ts`** — 10 explicit cases (all use `node:assert/strict`), each calling the real functions:
```ts
import assert from 'node:assert/strict'
import { validateIntent } from '@/domain/intent/validate'
import { resolveTarget } from '@/domain/target/resolve'
import { applyBudget } from '@/domain/cost/budget'
import { hashDraftPayload } from '@/domain/payload/canonical'
import { decideTransition } from '@/domain/webhook/transition'
import { verifyUpdateSignature } from '@/domain/webhook/verify'
import { classifyCandidate } from '@/domain/results/qc'
import { validateCustomerDraft } from '@/domain/comms/compose'
import { DeterministicLlmAdapter } from '@/adapters/llm/deterministic'
import { demoTargets } from '../../fixtures/targets'
import { demoResultRecords } from '../../fixtures/results'
import { signedUpdate } from '../../fixtures/updates'
import type { DraftPayload } from '@/domain/schemas'
export type EvalCase = { id: string; layer: string; adversarial: boolean; run: () => void | Promise<void> }
const P: DraftPayload = { method: 'bli', experimentType: 'affinity', targetId: 't', sequences: [{ id: 'AC-1', residues: 'MK' }],
  concentrations: [1e-9], replicates: 2, costTotalMinor: 730000, currency: 'USD', environment: 'mock', operation: 'create_draft', canonicalizerVersion: 'canon@v1', version: 1 }
const byId = (id: string) => demoResultRecords.find(r => r.candidateId === id)!
export const EVAL_CASES: EvalCase[] = [
  { id: 'INTK-01', layer: 'intake', adversarial: false, run: async () => { const r = await new DeterministicLlmAdapter().extractIntent({ requestText: 'unknown' }); assert.equal(r.ok && r.raw.budget, null) } },
  { id: 'INTK-02', layer: 'intake', adversarial: true, run: () => { const r = validateIntent({ experimentType: 'screening', method: 'elisa', targetQuery: null, requestedCount: null, concentrations: null, replicates: null, budget: null, fields: [], ambiguities: [] }); assert.equal(r.ok, false) } },
  { id: 'TGT-01', layer: 'target', adversarial: true, run: () => assert.equal(resolveTarget('EGFR', demoTargets).status, 'ambiguous') },
  { id: 'COST-01', layer: 'cost', adversarial: true, run: () => { const b = applyBudget(970000, 800000); assert.equal(b.withinBudget, false); assert.equal(b.maxWithinBudget, 4) } },
  { id: 'HASH-01', layer: 'approval-hash', adversarial: false, run: () => assert.equal(hashDraftPayload({ ...P, sequences: [P.sequences[0]!], version: 9 }), hashDraftPayload(P)) },
  { id: 'HASH-02', layer: 'approval-hash', adversarial: true, run: () => assert.notEqual(hashDraftPayload({ ...P, environment: 'live' }), hashDraftPayload(P)) },
  { id: 'WH-01', layer: 'webhook', adversarial: true, run: () => { assert.equal(decideTransition('Done', 'Done'), 'ignore'); assert.equal(decideTransition('InQueue', 'Done'), 'apply') } },
  { id: 'WH-02', layer: 'webhook', adversarial: true, run: () => { const u = signedUpdate({ experimentId: 'e', updateType: 's', status: 'Done', title: 't', content: 'c' }, 'sec', 'D1'); assert.equal(verifyUpdateSignature(u.rawBody, 'sha256=bad', 'sec'), false) } },
  { id: 'QC-02', layer: 'qc', adversarial: true, run: () => assert.equal(classifyCandidate(byId('AC-2')).bindingClass, 'apparent_binder_poor_fit') },
  { id: 'QC-04', layer: 'qc', adversarial: true, run: () => assert.equal(classifyCandidate(byId('AC-4')).bindingClass, 'inconclusive_replicate_inconsistent') },
  { id: 'EVID-02', layer: 'evidence-faithfulness', adversarial: true, run: () => { const r = validateCustomerDraft({ segments: [{ kind: 'text', text: 'KD 2.0 nM' }], generatedBy: { adapter: 's', model: 's', promptHash: 'x' }, status: 'draft' }, { experimentId: 'e', records: [], summaryStats: {} }); assert.equal(r.ok, false) } },
]
```
(11 cases, 9 adversarial — exceeds the ≥8 requirement with margin.)
- [ ] **Step 4:** Run → PASS. **Step 5: Commit** `test(evals): explicit 11-case golden/adversarial registry`.

## Task 5.3: Foundry contract schemas + mapper tests (SHOULD)

**Files:** Create `src/adapters/foundry/contract/schemas.ts`, `src/adapters/foundry/contract/mappers.ts`; Test `src/adapters/foundry/contract/mappers.test.ts`.
**Produces:** Zod schemas for the four used operations' wire shapes (targets list, cost-estimate, create-draft response, results) derived from `openapi.snapshot.json`, and mappers to the domain types (`Target`, `CostEstimate`, experiment id, `ResultRecord`), with tests validating representative snapshot example payloads round-trip through the mappers. Executable HTTP (`http.ts`) remains STRETCH.

- [ ] **Step 1:** Write mapper tests using representative wire payloads copied from the snapshot's example objects; assert `mapTarget(wire)`, `mapCostEstimate(wire)`, `mapResults(wire)` produce valid domain objects (Zod-parsed). Include the status-enum wire→domain mapping test (`waiting_for_confirmation`|`WaitingForConfirmation` → `'WaitingForConfirmation'`).
- [ ] **Step 2:** Implement `schemas.ts` (wire Zod) + `mappers.ts`. Run tests → PASS.
- [ ] **Step 3: Commit** `feat(adapters): Foundry contract schemas + mappers for the four used operations`.

## Task 5.4: Secret hygiene, README, runbook, demo-ready gate

**Files:** Create `scripts/check-client-bundle.mjs`, `README.md` demo section, `docs/DEMO_RUNBOOK.md`.
**Produces:** the `demo-ready` composite.

- [ ] **Step 1:** `scripts/check-client-bundle.mjs` (greps `.next/static` for `GEMINI_API_KEY`/`FOUNDRY_TOKEN`/`AIza…`; exits non-zero on a hit — as R1 Task 17 Step 1).
- [ ] **Step 2:** Confirm `package.json` scripts (already added in Task 0.1): `secret:scan` is `gitleaks detect --no-banner` **with no `|| true`**; `demo-ready` runs verify + secret:scan + e2e.
- [ ] **Step 3:** Write `docs/DEMO_RUNBOOK.md` (the §11 4:50 scene script, the verbatim demo request, `fixtures/demo.fasta`, reset `rm -f data/foundryops.db`).
- [ ] **Step 4:** Run `npm run verify` then `npm run test:e2e`. Expected: both green.
- [ ] **Step 5: Commit** `chore: client-bundle secret check, README/runbook, demo-ready gate`.

**Slice 5 runnable check:** `npm run demo-ready` green from a clean checkout.

---

# STRETCH — Gemini adapter + executable live client

## Task S.1: GeminiLlmAdapter (structured output + malformed-JSON catch) + factory branch + transcript parity

**Files:** Create `src/adapters/llm/gemini.ts`, `fixtures/transcripts/{intent.json,draft.json}`; Modify `src/adapters/llm/factory.ts`; Test `src/adapters/llm/gemini-parity.test.ts`.
**Produces:** `GeminiLlmAdapter` implementing `LlmClient` with a structured-output schema and `try/catch` around JSON parsing; the factory gains a `gemini` branch **created together with the module** (no import of a non-existent file). Offline transcript-parity test only; live calls are manual/non-blocking.

- [ ] **Step 1: Failing offline parity test**
```ts
import { describe, it, expect } from 'vitest'
import { RawExtractedIntentSchema } from '@/domain/schemas'
import intent from '../../../fixtures/transcripts/intent.json'
describe('gemini transcript parity (offline)', () => {
  it('recorded intent transcript validates', () => expect(() => RawExtractedIntentSchema.parse(intent)).not.toThrow())
})
```
- [ ] **Step 2:** Run → FAIL (fixture missing). Add `fixtures/transcripts/intent.json` (a recorded, schema-valid `RawExtractedIntent`) and `draft.json`. `npm install @google/genai` (verify current stable version + `gemini-3.6-flash` availability at implementation time).
- [ ] **Step 3: `src/adapters/llm/gemini.ts`** — uses `responseSchema` structured output; wraps `JSON.parse` in try/catch; returns `ok:false` on malformed output or missing key.
```ts
import type { LlmClient } from '@/application/ports'
import { RawExtractedIntentSchema, CustomerDraftSchema, type EvidenceBundle } from '@/domain/schemas'
import { env } from '@/infrastructure/config/env'
async function generate(prompt: string): Promise<string> {
  const { GoogleGenAI } = await import('@google/genai')
  const ai = new GoogleGenAI({ apiKey: env.geminiApiKey! })
  const res = await ai.models.generateContent({ model: 'gemini-3.6-flash', contents: prompt, config: { responseMimeType: 'application/json' } })
  return res.text ?? '{}'
}
function safeJson(s: string): unknown | null { try { return JSON.parse(s) } catch { return null } }
export class GeminiLlmAdapter implements LlmClient {
  async extractIntent({ requestText }: { requestText: string }) {
    if (!env.geminiApiKey) return { ok: false as const, error: 'GEMINI_API_KEY missing' }
    const parsed = RawExtractedIntentSchema.safeParse(safeJson(await generate(`Extract a BLI affinity intent as JSON; never invent absent fields.\n${requestText}`)))
    return parsed.success ? { ok: true as const, raw: parsed.data } : { ok: false as const, error: 'malformed intent output' }
  }
  async draftCustomerUpdate({ evidenceBundle }: { evidenceBundle: EvidenceBundle }) {
    if (!env.geminiApiKey) return { ok: false as const, error: 'GEMINI_API_KEY missing' }
    const parsed = CustomerDraftSchema.safeParse(safeJson(await generate(`Compose customer-draft segments as JSON. Text segments must contain no digits; cite every value via an evidenceId from this bundle.\n${JSON.stringify(evidenceBundle)}`)))
    return parsed.success ? { ok: true as const, draft: parsed.data } : { ok: false as const, error: 'malformed draft output' }
  }
}
```
- [ ] **Step 4: modify `src/adapters/llm/factory.ts`** to add the `gemini` branch (now that the module exists):
```ts
import type { LlmClient } from '@/application/ports'
import { DeterministicLlmAdapter } from './deterministic'
import { env } from '@/infrastructure/config/env'
export async function buildLlmClient(): Promise<LlmClient> {
  if (env.llmProvider === 'gemini') { const { GeminiLlmAdapter } = await import('./gemini'); return new GeminiLlmAdapter() }
  return new DeterministicLlmAdapter()
}
```
- [ ] **Step 5:** Run parity test → PASS. **Step 6: Commit** `feat(adapters): opt-in GeminiLlmAdapter (structured output + JSON catch) + transcript parity`.

---

## Self-Review

**1. Spec coverage (R2 §21 items):**
- P0.1 official update contract → Task 0.3 (fixtures), 3.1 (verify/transition over official lifecycle), 3.2 (ingest), 3.3 (local replay, no public route). ✓
- P0.2 real gates → Task 1.7 (ambiguity + over-budget block + deselect), 2.5 (edit invalidates), 5.1 (e2e proves all). ✓
- P0.3 structured evidence segments → Task 4.2 (numeric+categorical), 4.3 (segments/validate/render, no digits in text). ✓
- P0.4 Raw vs Validated intent → Task 0.2 (schemas), 1.2 (validateIntent + keyed adapter). ✓
- P0.5 approval/idempotency → Task 2.2 (compare version/requestId/op/env), 2.3 (repositories), 2.4 (READY_FOR_APPROVAL gate, txn consume, operationKey, no remote-atomicity claim). ✓
- P0.6 QC alignment → Task 0.3 (documented fields, multi-conc), 4.1 (demo-qc-policy@v1, no_detectable_binding, control/non-finite fail). ✓
- P1.7 CSV removed → request text + FASTA only throughout; no CSV task. ✓
- P1.8 contract schemas + mappers, live stretch → Task 0.3 (snapshot), 5.3 (schemas/mappers), S.1-area http stretch. ✓
- P1.9 six slices → SLICE 0–5 + Stretch, each with a runnable end-state check. ✓
- P1.10 defects → no Infinity (1.4), code-unit ordering + compile-time exhaustive classification (2.1), payloadVersion compared (2.2), control/non-finite/negative KD fail QC (4.1), Gemini module created with factory branch (S.1), Gemini structured output + JSON catch (S.1), gitleaks no `|| true` (0.1/5.4), explicit eval registry (5.2). ✓
- P1.11 Playwright rewrite → Task 5.1 (full flow incl. reissue + dedupe + audit). ✓
- P1.12 wording → "BLI affinity characterization" in fixtures/request.ts, UI copy, runbook. ✓

**2. Placeholder scan:** every code step shows code; the eval registry is fully enumerated (11 cases, no `...`); UI tasks list concrete components + `data-testid`s validated by the Task 5.1 assertions.

**3. Type consistency:** `LlmClient`/`FoundryClient` signatures (Task 1.2/1.5) match uses in application services; `hashDraftPayload` stable (2.1/2.2/2.4/5.2); `classifyCandidate`/`buildEvidenceBundle`/`validateCustomerDraft`/`renderCustomerDraft` names stable (4.1–4.4/5.2); `operationKey`/`mockExperimentId`/`consumeApproval`/`insertUpdateOnce` stable (1.5/2.3/2.4/3.2); cost math 250000/120000/800000 → 970000/730000/4 consistent (0.3/1.4/1.5/2.x); QC classes and evidence ids match between 4.1/4.2/4.3.

---

*R2 plan derived from `docs/superpowers/specs/2026-07-22-foundryops-mvp-design.md` (Revision R2). ADRs 0001–0005 are written to `docs/adr/` as their decisions are first implemented. No application code, package.json, ADR file, GitHub issue, or worktree is created until the user approves proceeding to implementation.*
