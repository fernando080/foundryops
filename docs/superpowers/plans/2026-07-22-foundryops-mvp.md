# FoundryOps MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the FoundryOps vertical demo — paste a BLI-vs-EGFR request + upload a FASTA/CSV, produce a validated budget-aware Foundry draft behind a human approval gate, monitor status, run deterministic results QC, and draft an evidence-backed customer update — runnable end-to-end offline in mock mode.

**Architecture:** Layered TypeScript. Pure `domain/` (no framework, no IO) holds all validation, arithmetic, hashing, authorization, QC, and evidence rules. `application/` orchestrates use-cases and owns transaction boundaries. `adapters/` wraps Foundry and the LLM behind interfaces. `infrastructure/` holds Drizzle/SQLite, crypto, config, logging. `src/app` (Next.js App Router) + `src/components` are the thin presentation layer that only adapts HTTP/UI to application services.

**Tech Stack:** Next.js 15 (App Router) · React 19 · TypeScript strict · Zod · Drizzle ORM + better-sqlite3 · Vitest · Playwright · `@google/genai` (only inside the Gemini adapter).

## Global Constraints

- **Money is integer minor units (cents)** everywhere; never floats. Currency is an ISO code string (`'USD'`).
- **LLM boundary:** the LLM may ONLY (a) extract `ExperimentIntent` from request text and (b) draft the customer update from a validated `EvidenceBundle`. It never validates sequences, computes metrics, resolves approval, decides transitions, or invents values. **No raw residues are ever passed to any LLM adapter.**
- **Default env:** `LLM_PROVIDER=stub`, `FOUNDRY_MODE=mock`. The Loom runs entirely on `DeterministicLlmAdapter` + `MockFoundryClient`. Live Foundry ops are non-constructable unless `FOUNDRY_MODE=live` + server token.
- **Cost model (synthetic):** `SETUP_COST_MINOR = 250000`; `PER_CANDIDATE_MINOR = 120000`; `totalMinor = 250000 + 120000 * acceptedCandidates`. Demo budget = `800000`.
- **QC thresholds are versioned** (`qc_thresholds@v1`): `r2Min = 0.95`, `ssKinRatioMax = 2.0` (flag if `KD_ss/KD_kin ∉ [0.5, 2.0]`), `cvMax = 0.20`, `kdMaxBinderM = 1e-6`, `evidence.relTol = 0.01`.
- **Canonicalizer version:** `CANONICALIZER_VERSION = 'canon@v1'`, included inside the hash input.
- **Secrets** (`GEMINI_API_KEY`, any Foundry token) are server-side only. No `NEXT_PUBLIC_` secret. The SQLite file lives outside any served/static directory.
- **TDD:** every behavior change is red → green → refactor. Commit after each green task.
- Repo root: `D:\proyectos\foundryops-claude-bootstrap`. App code lives in `src/` alongside the existing `docs/` and `.claude/`.

---

## File Structure

```
src/
  domain/
    schemas/index.ts            # all Zod schemas + inferred types (single source of contracts)
    constants.ts                # cost model, qc thresholds v1, canonicalizer version, enums
    sequence/fasta.ts           # parseFasta, normalizeResidues, sequenceHash
    preflight/engine.ts         # runPreflight (all finding codes)
    target/resolve.ts           # resolveTarget
    cost/budget.ts              # applyBudget
    payload/canonical.ts        # canonicalizeDraftPayload, hashDraftPayload (ADR-0003)
    approval/rules.ts           # issueApproval, approvalStatusFor
    webhook/verify.ts           # verifyWebhookSignature (constant-time HMAC)
    webhook/transition.ts       # decideTransition (rank-based)
    results/qc.ts               # classifyCandidate
    evidence/bundle.ts          # buildEvidenceBundle, resolveEvidence
    comms/validate.ts           # validateCustomerDraft (numericClaims + prose scan, fail-closed)
  application/
    ports.ts                    # FoundryClient, LlmClient, repository interfaces
    intake.ts estimate.ts approval.ts createDraft.ts
    ingestWebhook.ts reviewResults.ts draftComms.ts
  adapters/
    foundry/mock.ts             # MockFoundryClient
    foundry/http.ts             # FoundryHttpClient (behind flag; not exercised in demo)
    foundry/factory.ts          # buildFoundryClient(config)
    llm/deterministic.ts        # DeterministicLlmAdapter
    llm/gemini.ts               # GeminiLlmAdapter (stretch, opt-in)
    llm/factory.ts              # buildLlmClient(config)
  infrastructure/
    db/schema.ts db/client.ts   # Drizzle schema + connection
    repositories/*.ts           # SQLite-backed repositories
    crypto/hash.ts              # sha256Hex
    config/env.ts               # typed env, mode guards
    config/network-guard.ts     # test-time outbound-socket guard
    logging/logger.ts           # allowlist structured logging
  app/                          # Next.js App Router (thin)
    layout.tsx page.tsx
    actions/*.ts                # server actions -> application services
    api/webhooks/foundry/route.ts
  components/                   # React presentation
fixtures/                       # synthetic FASTA/CSV, candidates AC-1..AC-8, transcripts
tests/                          # integration + eval registry
e2e/                            # Playwright specs
```

---

## Task 0: Project scaffold, tooling, and config

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `vitest.config.ts`, `drizzle.config.ts`, `.gitignore`, `.env.example`, `playwright.config.ts`
- Create: `src/infrastructure/config/env.ts`, `src/infrastructure/config/network-guard.ts`, `tests/setup.ts`

**Interfaces:**
- Produces: `env` object `{ llmProvider: 'stub'|'gemini', foundryMode: 'mock'|'sandbox'|'live', geminiApiKey?: string, foundryToken?: string, dbPath: string }` from `src/infrastructure/config/env.ts`; `installNetworkGuard()` from `network-guard.ts`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "foundryops",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "demo": "cross-env LLM_PROVIDER=stub FOUNDRY_MODE=mock next dev",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "db:migrate": "drizzle-kit migrate",
    "typecheck": "tsc --noEmit",
    "secret:scan": "gitleaks detect --no-banner || true"
  },
  "dependencies": {
    "next": "15.1.0",
    "react": "19.0.0",
    "react-dom": "19.0.0",
    "zod": "3.24.1",
    "drizzle-orm": "0.38.3",
    "better-sqlite3": "11.7.0"
  },
  "devDependencies": {
    "typescript": "5.7.2",
    "@types/node": "22.10.2",
    "@types/react": "19.0.2",
    "@types/better-sqlite3": "7.6.12",
    "vitest": "2.1.8",
    "drizzle-kit": "0.30.1",
    "@playwright/test": "1.49.1",
    "cross-env": "7.0.3"
  }
}
```

- [ ] **Step 2: Install and pin**

Run: `npm install`
Expected: `node_modules/` created, lockfile written. (Verify exact current versions at install time per RESEARCH_NOTES; if a pinned version is unavailable, install the nearest stable and record it.)

- [ ] **Step 3: Create `tsconfig.json` (strict)**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "jsx": "preserve",
    "incremental": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "paths": { "@/*": ["./src/*"] },
    "baseUrl": ".",
    "plugins": [{ "name": "next" }]
  },
  "include": ["src", "tests", "e2e", "next-env.d.ts", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create `next.config.mjs`, `.gitignore`, `.env.example`**

`next.config.mjs`:
```js
/** @type {import('next').NextConfig} */
const nextConfig = { serverExternalPackages: ['better-sqlite3'] }
export default nextConfig
```

`.gitignore` (append):
```
node_modules
.next
*.db
*.db-*
.env
.env.local
test-artifacts
playwright-report
```

`.env.example`:
```
LLM_PROVIDER=stub
FOUNDRY_MODE=mock
# GEMINI_API_KEY=   # only when LLM_PROVIDER=gemini
# FOUNDRY_TOKEN=    # only when FOUNDRY_MODE=live
FOUNDRYOPS_DB_PATH=./data/foundryops.db
```

- [ ] **Step 5: Create `vitest.config.ts` with the network guard as setup**

```ts
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
})
```

- [ ] **Step 6: Create the env module `src/infrastructure/config/env.ts`**

```ts
export type FoundryMode = 'mock' | 'sandbox' | 'live'
export type LlmProvider = 'stub' | 'gemini'

function read(name: string, fallback?: string): string | undefined {
  const v = process.env[name]
  return v === undefined || v === '' ? fallback : v
}

export const env = {
  llmProvider: (read('LLM_PROVIDER', 'stub') as LlmProvider),
  foundryMode: (read('FOUNDRY_MODE', 'mock') as FoundryMode),
  geminiApiKey: read('GEMINI_API_KEY'),
  foundryToken: read('FOUNDRY_TOKEN'),
  dbPath: read('FOUNDRYOPS_DB_PATH', ':memory:')!,
}

export function assertLiveAllowed(): void {
  if (env.foundryMode === 'live' && !env.foundryToken) {
    throw new Error('FOUNDRY_MODE=live requires a server-side FOUNDRY_TOKEN')
  }
}
```

- [ ] **Step 7: Create the network guard `src/infrastructure/config/network-guard.ts` and `tests/setup.ts`**

`network-guard.ts`:
```ts
import net from 'node:net'

/** Throws on any outbound TCP connect except loopback. Installed in test setup. */
export function installNetworkGuard(): void {
  const original = net.Socket.prototype.connect
  ;(net.Socket.prototype as any).connect = function (...args: any[]) {
    const opts = args[0]
    const host = typeof opts === 'object' ? opts.host : args[1]
    const allowed = host === undefined || host === '127.0.0.1' || host === 'localhost' || host === '::1'
    if (!allowed) throw new Error(`Network guard: blocked outbound connection to ${host}`)
    return original.apply(this, args as any)
  }
}
```

`tests/setup.ts`:
```ts
import { installNetworkGuard } from '@/infrastructure/config/network-guard'
installNetworkGuard()
```

- [ ] **Step 8: Verify tooling boots**

Run: `npm run typecheck`
Expected: exits 0 (no source files yet beyond config/env — no type errors).

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.mjs vitest.config.ts .gitignore .env.example src/infrastructure/config tests/setup.ts
git commit -m "chore: scaffold FoundryOps TS app (Next.js, Vitest, env, network guard)"
```

---

## Task 1: Domain schemas and constants

**Files:**
- Create: `src/domain/constants.ts`, `src/domain/schemas/index.ts`
- Test: `src/domain/schemas/schemas.test.ts`

**Interfaces:**
- Produces (constants): `SETUP_COST_MINOR`, `PER_CANDIDATE_MINOR`, `DEMO_BUDGET_MINOR`, `CANONICALIZER_VERSION`, `qcThresholdsV1`.
- Produces (types, all Zod-inferred): `ExperimentIntent`, `ExtractedField`, `Ambiguity`, `ParsedSequence`, `Sequence`, `SequenceSet`, `PreflightFinding`, `Target`, `TargetResolution`, `CostEstimate`, `DraftPayload`, `Approval`, `WebhookEvent`, `ResultRecord`, `Measurement`, `QCResult`, `EvidenceRecord`, `EvidenceBundle`, `CustomerDraft`, `NumericClaim`.

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/schemas/schemas.test.ts
import { describe, it, expect } from 'vitest'
import { ExperimentIntentSchema, DraftPayloadSchema, QCResultSchema } from './index'
import { qcThresholdsV1, SETUP_COST_MINOR } from '../constants'

describe('domain schemas', () => {
  it('parses a valid ExperimentIntent', () => {
    const intent = ExperimentIntentSchema.parse({
      experimentType: 'affinity', method: 'bli', targetQuery: 'EGFR',
      requestedCount: 8, concentrations: [1e-7, 1e-9], replicates: 2,
      budget: { amountMinor: 800000, currency: 'USD' }, approvalRequired: true,
      fields: [{ name: 'target', value: 'EGFR', confidence: 0.7, sourceSpan: { start: 10, end: 14 } }],
      ambiguities: [],
    })
    expect(intent.method).toBe('bli')
  })

  it('rejects a DraftPayload with non-integer money', () => {
    const bad = { method: 'bli', experimentType: 'affinity', targetId: 't1', sequences: [],
      concentrations: [], replicates: 2, costTotalMinor: 1.5, currency: 'USD',
      environment: 'mock', operation: 'create_draft', canonicalizerVersion: 'canon@v1',
      version: 1 }
    expect(() => DraftPayloadSchema.parse(bad)).toThrow()
  })

  it('exposes versioned QC thresholds', () => {
    expect(qcThresholdsV1.version).toBe('qc_thresholds@v1')
    expect(SETUP_COST_MINOR).toBe(250000)
    QCResultSchema.parse({
      candidateId: 'AC-1', expressionClass: 'expressed', bindingClass: 'confirmed_binder',
      affinity: { kdM: 2.02e-9, ciLowM: null, ciHighM: null },
      replicateConsistency: { cv: 0.038, consistent: true },
      fitQuality: { r2: 0.985, pass: true }, controlOutcome: 'pass',
      recommendation: 'follow_up', appliedThresholds: 'qc_thresholds@v1', warnings: [],
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/schemas/schemas.test.ts`
Expected: FAIL — cannot resolve `./index` / `../constants`.

- [ ] **Step 3: Create `src/domain/constants.ts`**

```ts
export const SETUP_COST_MINOR = 250_000
export const PER_CANDIDATE_MINOR = 120_000
export const DEMO_BUDGET_MINOR = 800_000
export const CANONICALIZER_VERSION = 'canon@v1'

export const qcThresholdsV1 = {
  version: 'qc_thresholds@v1',
  fit: { r2Min: 0.95, ssKinRatioMax: 2.0 },
  replicate: { cvMax: 0.2 },
  binding: { kdMaxBinderM: 1e-6 },
  evidence: { relTol: 0.01 },
} as const
```

- [ ] **Step 4: Create `src/domain/schemas/index.ts`**

```ts
import { z } from 'zod'

const intMinor = z.number().int()
export const MoneySchema = z.object({ amountMinor: intMinor, currency: z.string().length(3) })

export const ExtractedFieldSchema = z.object({
  name: z.string(), value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  confidence: z.number().min(0).max(1),
  sourceSpan: z.object({ start: z.number().int(), end: z.number().int() }).nullable(),
})
export const AmbiguitySchema = z.object({ field: z.string(), reason: z.string(), options: z.array(z.string()).optional() })

export const ExperimentIntentSchema = z.object({
  experimentType: z.literal('affinity'),
  method: z.literal('bli'),
  targetQuery: z.string().nullable(),
  requestedCount: z.number().int().nullable(),
  concentrations: z.array(z.number()),
  replicates: z.number().int(),
  budget: MoneySchema.nullable(),
  approvalRequired: z.boolean(),
  fields: z.array(ExtractedFieldSchema),
  ambiguities: z.array(AmbiguitySchema),
})

export const ParsedSequenceSchema = z.object({
  id: z.string(), rawHeader: z.string(), residues: z.string(),
  chains: z.array(z.string()), length: z.number().int(),
  sourceLoc: z.object({ file: z.string(), lineStart: z.number().int(), lineEnd: z.number().int() }),
})
export const SequenceSchema = ParsedSequenceSchema.extend({ normHash: z.string() })
export const SequenceSetSchema = z.object({
  sequences: z.array(SequenceSchema), acceptedIds: z.array(z.string()), rejectedIds: z.array(z.string()),
})

export const PreflightSeverity = z.enum(['error', 'warning', 'info'])
export const PreflightFindingSchema = z.object({
  code: z.string(), severity: PreflightSeverity, message: z.string(),
  evidenceLocation: z.object({ sequenceId: z.string().nullable(), position: z.number().int().nullable() }),
  remediation: z.string(), blocksProgression: z.boolean(), duplicateOf: z.string().optional(),
})

export const TargetSchema = z.object({
  foundryTargetId: z.string(), name: z.string(), aliases: z.array(z.string()),
  organism: z.string(), uniprotId: z.string(),
})
export const TargetResolutionSchema = z.object({
  query: z.string(), chosen: TargetSchema.nullable(),
  alternatives: z.array(TargetSchema), status: z.enum(['resolved', 'ambiguous', 'missing']),
})

export const CostEstimateSchema = z.object({
  foundryQuoteRef: z.string(),
  lineItems: z.array(z.object({ label: z.string(), amountMinor: intMinor })),
  totalMinor: intMinor, currency: z.string().length(3),
  withinBudget: z.boolean(), overageMinor: intMinor, maxWithinBudget: z.number().int(),
})

export const DraftPayloadSchema = z.object({
  method: z.literal('bli'), experimentType: z.literal('affinity'), targetId: z.string(),
  sequences: z.array(z.object({ id: z.string(), residues: z.string() })),
  concentrations: z.array(z.number()), replicates: z.number().int(),
  costTotalMinor: intMinor, currency: z.string().length(3),
  environment: z.enum(['mock', 'sandbox', 'live']),
  operation: z.enum(['create_draft', 'confirm_experiment']),
  canonicalizerVersion: z.string(), version: z.number().int(),
  costEstimateRef: z.string().optional(), requestId: z.string().optional(),
  canonicalHash: z.string().optional(), createdAt: z.string().optional(),
})

export const ApprovalSchema = z.object({
  id: z.string(), operation: z.enum(['create_draft', 'confirm_experiment']),
  payloadHash: z.string(), payloadVersion: z.number().int(), requestId: z.string(),
  actor: z.string(), issuedAt: z.string(), expiresAt: z.string(),
  environment: z.enum(['mock', 'sandbox', 'live']), costSnapshotMinor: intMinor,
  status: z.enum(['valid', 'consumed', 'expired', 'invalidated']),
})

export const WebhookEventSchema = z.object({
  deliveryId: z.string(), signature: z.string(), signatureVerified: z.boolean(),
  providerTs: z.string(), eventType: z.string(), experimentId: z.string(),
  targetStatus: z.enum(['queued', 'in_progress', 'completed', 'failed']),
  processingStatus: z.enum(['accepted', 'duplicate', 'rejected_signature', 'rejected_transition', 'dead_letter']),
})

export const MeasurementSchema = z.object({
  candidateId: z.string(), concentration: z.number(), replicateIndex: z.number().int(),
  responseValue: z.number(), controlType: z.string().nullable(),
})
export const ResultRecordSchema = z.object({
  experimentId: z.string(), candidateId: z.string(), expressionOutcome: z.boolean(),
  replicateKdsM: z.array(z.number()).nullable(), fitR2: z.number().nullable(),
  kdSteadyStateM: z.number().nullable(), kdKineticM: z.number().nullable(),
  measurements: z.array(MeasurementSchema), controlOutcome: z.enum(['pass', 'fail', 'na']),
})

export const QCResultSchema = z.object({
  candidateId: z.string(),
  expressionClass: z.enum(['expressed', 'no_expression']),
  bindingClass: z.enum(['confirmed_binder', 'apparent_binder_poor_fit', 'non_binder', 'no_expression', 'inconclusive_replicate_inconsistent']),
  affinity: z.object({ kdM: z.number().nullable(), ciLowM: z.number().nullable(), ciHighM: z.number().nullable() }),
  replicateConsistency: z.object({ cv: z.number().nullable(), consistent: z.boolean() }),
  fitQuality: z.object({ r2: z.number().nullable(), pass: z.boolean() }),
  controlOutcome: z.enum(['pass', 'fail', 'na']),
  recommendation: z.enum(['follow_up', 'inconclusive', 'drop']),
  appliedThresholds: z.string(), warnings: z.array(z.string()),
})

export const EvidenceRecordSchema = z.object({
  id: z.string(), kind: z.enum(['measurement', 'qc_calculation', 'control', 'threshold', 'approved_recommendation']),
  sourceRef: z.string(), value: z.number(), unit: z.string(), displayLabel: z.string(),
  provenanceChain: z.array(z.string()),
})
export const EvidenceBundleSchema = z.object({
  experimentId: z.string(), records: z.array(EvidenceRecordSchema),
  summaryStats: z.record(z.string(), z.number()),
})

export const NumericClaimSchema = z.object({ value: z.number(), unit: z.string(), evidenceId: z.string() })
export const CustomerDraftSchema = z.object({
  bodyBlocks: z.array(z.object({
    text: z.string(), claimType: z.enum(['confirmed', 'recommendation', 'inconclusive']),
    numericClaims: z.array(NumericClaimSchema),
  })),
  unresolvedClaims: z.array(z.string()),
  generatedBy: z.object({ adapter: z.string(), model: z.string(), promptHash: z.string() }),
  status: z.literal('draft'),
})

export type ExperimentIntent = z.infer<typeof ExperimentIntentSchema>
export type ExtractedField = z.infer<typeof ExtractedFieldSchema>
export type Ambiguity = z.infer<typeof AmbiguitySchema>
export type ParsedSequence = z.infer<typeof ParsedSequenceSchema>
export type Sequence = z.infer<typeof SequenceSchema>
export type SequenceSet = z.infer<typeof SequenceSetSchema>
export type PreflightFinding = z.infer<typeof PreflightFindingSchema>
export type Target = z.infer<typeof TargetSchema>
export type TargetResolution = z.infer<typeof TargetResolutionSchema>
export type CostEstimate = z.infer<typeof CostEstimateSchema>
export type DraftPayload = z.infer<typeof DraftPayloadSchema>
export type Approval = z.infer<typeof ApprovalSchema>
export type WebhookEvent = z.infer<typeof WebhookEventSchema>
export type Measurement = z.infer<typeof MeasurementSchema>
export type ResultRecord = z.infer<typeof ResultRecordSchema>
export type QCResult = z.infer<typeof QCResultSchema>
export type EvidenceRecord = z.infer<typeof EvidenceRecordSchema>
export type EvidenceBundle = z.infer<typeof EvidenceBundleSchema>
export type NumericClaim = z.infer<typeof NumericClaimSchema>
export type CustomerDraft = z.infer<typeof CustomerDraftSchema>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/domain/schemas/schemas.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/domain/schemas src/domain/constants.ts
git commit -m "feat(domain): add Zod contracts and versioned constants"
```

---

## Task 2: FASTA parsing, normalization, and sequence hashing (FOUND-001)

**Files:**
- Create: `src/domain/sequence/fasta.ts`, `src/infrastructure/crypto/hash.ts`
- Test: `src/domain/sequence/fasta.test.ts`

**Interfaces:**
- Consumes: `ParsedSequence`, `Sequence` from `@/domain/schemas`.
- Produces: `sha256Hex(input: string): string`; `parseFasta(text: string, fileName: string): Sequence[]`; `normalizeResidues(raw: string): string`.

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/sequence/fasta.test.ts
import { describe, it, expect } from 'vitest'
import { parseFasta, normalizeResidues } from './fasta'

const FASTA = `>AC-1 strong binder\nMKT AYIAK\n>AC-6 duplicate\nMKTAYIAK\n`

describe('parseFasta', () => {
  it('parses records, strips whitespace, uppercases, records line ranges', () => {
    const seqs = parseFasta(FASTA, 'demo.fasta')
    expect(seqs).toHaveLength(2)
    expect(seqs[0]!.id).toBe('AC-1')
    expect(seqs[0]!.residues).toBe('MKTAYIAK')
    expect(seqs[0]!.length).toBe(8)
    expect(seqs[0]!.sourceLoc).toEqual({ file: 'demo.fasta', lineStart: 1, lineEnd: 2 })
  })

  it('gives byte-identical sequences the same normHash', () => {
    const seqs = parseFasta(FASTA, 'demo.fasta')
    expect(seqs[0]!.normHash).toBe(seqs[1]!.normHash)
  })

  it('normalizeResidues removes whitespace and uppercases', () => {
    expect(normalizeResidues(' mk t\n a ')).toBe('MKTA')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/sequence/fasta.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/infrastructure/crypto/hash.ts`**

```ts
import { createHash } from 'node:crypto'
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}
```

- [ ] **Step 4: Create `src/domain/sequence/fasta.ts`**

```ts
import type { Sequence } from '@/domain/schemas'
import { sha256Hex } from '@/infrastructure/crypto/hash'

export function normalizeResidues(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase()
}

export function parseFasta(text: string, fileName: string): Sequence[] {
  const lines = text.split(/\r?\n/)
  const out: Sequence[] = []
  let current: { header: string; id: string; body: string[]; lineStart: number } | null = null

  const flush = (lineEnd: number) => {
    if (!current) return
    const residues = normalizeResidues(current.body.join(''))
    out.push({
      id: current.id, rawHeader: current.header, residues,
      chains: residues.split(':'), length: residues.replace(/:/g, '').length,
      normHash: sha256Hex(residues),
      sourceLoc: { file: fileName, lineStart: current.lineStart, lineEnd },
    })
  }

  lines.forEach((line, i) => {
    const lineNo = i + 1
    if (line.startsWith('>')) {
      if (current) flush(lineNo - 1)
      const header = line.slice(1).trim()
      const id = header.split(/\s+/)[0] ?? `seq-${lineNo}`
      current = { header, id, body: [], lineStart: lineNo }
    } else if (current && line.trim() !== '') {
      current.body.push(line)
    }
  })
  if (current) flush(lines.length)
  return out
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/domain/sequence/fasta.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/domain/sequence src/infrastructure/crypto
git commit -m "feat(domain): FASTA parser, residue normalization, sequence hashing"
```

---

## Task 3: Preflight validation engine (FOUND-002)

**Files:**
- Create: `src/domain/preflight/engine.ts`
- Test: `src/domain/preflight/engine.test.ts`

**Interfaces:**
- Consumes: `Sequence`, `SequenceSet`, `PreflightFinding` from `@/domain/schemas`.
- Produces: `runPreflight(input: { sequences: Sequence[]; requestedCount: number | null }): { findings: PreflightFinding[]; sequenceSet: SequenceSet }`.

Rules (finding codes): `INVALID_RESIDUE` (error), `DUPLICATE_SEQUENCE` (error, sets `duplicateOf`), `DUPLICATE_ID` (error), `COUNT_MISMATCH` (warning), `EMPTY_INPUT` (error). A sequence with an invalid residue or that duplicates an earlier sequence is excluded from `acceptedIds`.

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/preflight/engine.test.ts
import { describe, it, expect } from 'vitest'
import { runPreflight } from './engine'
import { parseFasta } from '@/domain/sequence/fasta'

const FASTA = `>AC-1\nMKTAYIAK\n>AC-5\nMKTAYIAZ\n>AC-6\nMKTAYIAK\n`

describe('runPreflight', () => {
  it('flags invalid residue and excludes it', () => {
    const { findings, sequenceSet } = runPreflight({ sequences: parseFasta(FASTA, 'f'), requestedCount: 3 })
    const invalid = findings.find(f => f.code === 'INVALID_RESIDUE')
    expect(invalid?.evidenceLocation).toEqual({ sequenceId: 'AC-5', position: 8 })
    expect(sequenceSet.acceptedIds).not.toContain('AC-5')
  })

  it('collapses a byte-identical duplicate once', () => {
    const { findings, sequenceSet } = runPreflight({ sequences: parseFasta(FASTA, 'f'), requestedCount: 3 })
    const dup = findings.find(f => f.code === 'DUPLICATE_SEQUENCE')
    expect(dup?.duplicateOf).toBe('AC-1')
    expect(sequenceSet.acceptedIds).toEqual(['AC-1'])
    expect(sequenceSet.rejectedIds.sort()).toEqual(['AC-5', 'AC-6'])
  })

  it('warns when uploaded count != requested count', () => {
    const { findings } = runPreflight({ sequences: parseFasta(FASTA, 'f'), requestedCount: 8 })
    expect(findings.some(f => f.code === 'COUNT_MISMATCH' && f.severity === 'warning')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/preflight/engine.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/domain/preflight/engine.ts`**

```ts
import type { Sequence, SequenceSet, PreflightFinding } from '@/domain/schemas'

const VALID_AA = new Set('ACDEFGHIKLMNPQRSTVWY'.split(''))

export function runPreflight(input: { sequences: Sequence[]; requestedCount: number | null }): {
  findings: PreflightFinding[]; sequenceSet: SequenceSet
} {
  const { sequences, requestedCount } = input
  const findings: PreflightFinding[] = []
  const accepted: string[] = []
  const rejected: string[] = []
  const seenHash = new Map<string, string>()
  const seenId = new Set<string>()

  if (sequences.length === 0) {
    findings.push({ code: 'EMPTY_INPUT', severity: 'error', message: 'No sequences were uploaded.',
      evidenceLocation: { sequenceId: null, position: null }, remediation: 'Upload a FASTA file with at least one sequence.', blocksProgression: true })
    return { findings, sequenceSet: { sequences, acceptedIds: [], rejectedIds: [] } }
  }

  for (const seq of sequences) {
    let rejectedThis = false

    if (seenId.has(seq.id)) {
      findings.push({ code: 'DUPLICATE_ID', severity: 'error', message: `Duplicate sequence id ${seq.id}.`,
        evidenceLocation: { sequenceId: seq.id, position: null }, remediation: 'Give each sequence a unique identifier.', blocksProgression: true })
      rejectedThis = true
    }
    seenId.add(seq.id)

    const bare = seq.residues.replace(/:/g, '')
    const badIdx = [...bare].findIndex(c => !VALID_AA.has(c))
    if (badIdx >= 0) {
      findings.push({ code: 'INVALID_RESIDUE', severity: 'error',
        message: `Sequence ${seq.id} contains an invalid residue '${bare[badIdx]}' at position ${badIdx + 1}.`,
        evidenceLocation: { sequenceId: seq.id, position: badIdx + 1 },
        remediation: 'Remove or correct the invalid residue; only the 20 standard amino acids are accepted.', blocksProgression: true })
      rejectedThis = true
    }

    const priorId = seenHash.get(seq.normHash)
    if (priorId !== undefined) {
      findings.push({ code: 'DUPLICATE_SEQUENCE', severity: 'error',
        message: `Sequence ${seq.id} is identical to ${priorId}.`,
        evidenceLocation: { sequenceId: seq.id, position: null },
        remediation: 'Remove the duplicate sequence; it is counted once.', blocksProgression: true, duplicateOf: priorId })
      rejectedThis = true
    } else {
      seenHash.set(seq.normHash, seq.id)
    }

    if (rejectedThis) rejected.push(seq.id)
    else accepted.push(seq.id)
  }

  if (requestedCount !== null && requestedCount !== sequences.length) {
    findings.push({ code: 'COUNT_MISMATCH', severity: 'warning',
      message: `Request asked for ${requestedCount} sequences but ${sequences.length} were uploaded.`,
      evidenceLocation: { sequenceId: null, position: null },
      remediation: 'Confirm the intended number of candidates.', blocksProgression: false })
  }

  return { findings, sequenceSet: { sequences, acceptedIds: accepted, rejectedIds: rejected } }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/preflight/engine.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/preflight
git commit -m "feat(domain): deterministic preflight engine with severity-coded findings"
```

---

## Task 4: Target resolution and budget evaluation (FOUND-003 domain)

**Files:**
- Create: `src/domain/target/resolve.ts`, `src/domain/cost/budget.ts`
- Test: `src/domain/target/resolve.test.ts`, `src/domain/cost/budget.test.ts`

**Interfaces:**
- Consumes: `Target`, `TargetResolution`, `CostEstimate` from `@/domain/schemas`; cost constants.
- Produces: `resolveTarget(query: string | null, candidates: Target[]): TargetResolution`; `applyBudget(totalMinor: number, budgetMinor: number | null): { withinBudget: boolean; overageMinor: number; maxWithinBudget: number }`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/domain/target/resolve.test.ts
import { describe, it, expect } from 'vitest'
import { resolveTarget } from './resolve'
import type { Target } from '@/domain/schemas'

const human: Target = { foundryTargetId: 'tgt_egfr_human', name: 'EGFR (human ECD)', aliases: ['EGFR'], organism: 'Homo sapiens', uniprotId: 'P00533' }
const murine: Target = { foundryTargetId: 'tgt_egfr_mouse', name: 'EGFR (murine)', aliases: ['EGFR'], organism: 'Mus musculus', uniprotId: 'Q01279' }

describe('resolveTarget', () => {
  it('resolves a single exact match', () => {
    expect(resolveTarget('EGFR', [human]).status).toBe('resolved')
  })
  it('is ambiguous when multiple candidates match and blocks progression', () => {
    const r = resolveTarget('EGFR', [human, murine])
    expect(r.status).toBe('ambiguous')
    expect(r.chosen).toBeNull()
    expect(r.alternatives).toHaveLength(2)
  })
  it('is missing when query is null or no candidates', () => {
    expect(resolveTarget(null, [human]).status).toBe('missing')
    expect(resolveTarget('EGFR', []).status).toBe('missing')
  })
})
```

```ts
// src/domain/cost/budget.test.ts
import { describe, it, expect } from 'vitest'
import { applyBudget } from './budget'

describe('applyBudget', () => {
  it('detects over-budget and computes overage and max-within-budget', () => {
    // total for 6 candidates = 250000 + 120000*6 = 970000, budget 800000
    const r = applyBudget(970000, 800000)
    expect(r.withinBudget).toBe(false)
    expect(r.overageMinor).toBe(170000)
    expect(r.maxWithinBudget).toBe(4) // 250000 + 120000*4 = 730000 <= 800000
  })
  it('passes when within budget', () => {
    expect(applyBudget(730000, 800000).withinBudget).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/domain/target src/domain/cost`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create implementations**

`src/domain/target/resolve.ts`:
```ts
import type { Target, TargetResolution } from '@/domain/schemas'

export function resolveTarget(query: string | null, candidates: Target[]): TargetResolution {
  if (query === null || query.trim() === '' || candidates.length === 0) {
    return { query: query ?? '', chosen: null, alternatives: candidates, status: 'missing' }
  }
  const q = query.trim().toLowerCase()
  const matches = candidates.filter(t =>
    t.name.toLowerCase().includes(q) || t.aliases.some(a => a.toLowerCase() === q))
  if (matches.length === 1) return { query, chosen: matches[0]!, alternatives: matches, status: 'resolved' }
  if (matches.length > 1) return { query, chosen: null, alternatives: matches, status: 'ambiguous' }
  return { query, chosen: null, alternatives: candidates, status: 'missing' }
}
```

`src/domain/cost/budget.ts`:
```ts
import { SETUP_COST_MINOR, PER_CANDIDATE_MINOR } from '@/domain/constants'

export function applyBudget(totalMinor: number, budgetMinor: number | null): {
  withinBudget: boolean; overageMinor: number; maxWithinBudget: number
} {
  if (budgetMinor === null) return { withinBudget: true, overageMinor: 0, maxWithinBudget: Number.POSITIVE_INFINITY }
  const withinBudget = totalMinor <= budgetMinor
  const overageMinor = Math.max(0, totalMinor - budgetMinor)
  const maxWithinBudget = Math.max(0, Math.floor((budgetMinor - SETUP_COST_MINOR) / PER_CANDIDATE_MINOR))
  return { withinBudget, overageMinor, maxWithinBudget }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/domain/target src/domain/cost`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/target src/domain/cost
git commit -m "feat(domain): deterministic target resolution and budget evaluation"
```

---

## Task 5: Canonical payload hash (FOUND-004 core, load-bearing — ADR-0003)

**Files:**
- Create: `src/domain/payload/canonical.ts`
- Test: `src/domain/payload/canonical.test.ts`

**Interfaces:**
- Consumes: `DraftPayload` from `@/domain/schemas`; `sha256Hex`; `CANONICALIZER_VERSION`.
- Produces: `canonicalizeDraftPayload(p: DraftPayload): string`; `hashDraftPayload(p: DraftPayload): string`. Throws `Error('Unclassified payload field: <k>')` on an unknown field.

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/payload/canonical.test.ts
import { describe, it, expect } from 'vitest'
import { hashDraftPayload, canonicalizeDraftPayload } from './canonical'
import type { DraftPayload } from '@/domain/schemas'

const base: DraftPayload = {
  method: 'bli', experimentType: 'affinity', targetId: 'tgt_egfr_human',
  sequences: [{ id: 'AC-1', residues: 'MKTAYIAK' }, { id: 'AC-7', residues: 'MKQWERTY' }],
  concentrations: [1e-7, 1e-9], replicates: 2, costTotalMinor: 730000, currency: 'USD',
  environment: 'mock', operation: 'create_draft', canonicalizerVersion: 'canon@v1', version: 1,
}

describe('canonical payload hash', () => {
  it('is stable under sequence reordering and volatile-field changes', () => {
    const reordered: DraftPayload = { ...base, sequences: [base.sequences[1]!, base.sequences[0]!],
      requestId: 'req-xyz', createdAt: '2026-07-22T00:00:00Z', version: 99 }
    expect(hashDraftPayload(reordered)).toBe(hashDraftPayload(base))
  })

  it('changes when any invalidator changes', () => {
    const h = hashDraftPayload(base)
    expect(hashDraftPayload({ ...base, targetId: 'tgt_egfr_mouse' })).not.toBe(h)
    expect(hashDraftPayload({ ...base, costTotalMinor: 730001 })).not.toBe(h)
    expect(hashDraftPayload({ ...base, currency: 'EUR' })).not.toBe(h)
    expect(hashDraftPayload({ ...base, environment: 'live' })).not.toBe(h)
    expect(hashDraftPayload({ ...base, operation: 'confirm_experiment' })).not.toBe(h)
    expect(hashDraftPayload({ ...base, sequences: [base.sequences[0]!] })).not.toBe(h)
    expect(hashDraftPayload({ ...base, sequences: [{ id: 'AC-1', residues: 'MKTAYIAX' }, base.sequences[1]!] })).not.toBe(h)
  })

  it('rejects non-integer money and unknown fields', () => {
    expect(() => canonicalizeDraftPayload({ ...base, costTotalMinor: 1.5 })).toThrow(/integer/)
    expect(() => canonicalizeDraftPayload({ ...(base as any), surpriseField: 1 })).toThrow(/Unclassified/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/payload/canonical.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/domain/payload/canonical.ts`**

```ts
import type { DraftPayload } from '@/domain/schemas'
import { sha256Hex } from '@/infrastructure/crypto/hash'

const SEMANTIC_KEYS = ['method', 'experimentType', 'targetId', 'sequences', 'concentrations',
  'replicates', 'costTotalMinor', 'currency', 'environment', 'operation', 'canonicalizerVersion'] as const
const VOLATILE_KEYS = ['version', 'costEstimateRef', 'requestId', 'canonicalHash', 'createdAt'] as const

function nfc(s: string): string { return s.normalize('NFC') }

export function canonicalizeDraftPayload(p: DraftPayload): string {
  for (const k of Object.keys(p)) {
    if (!SEMANTIC_KEYS.includes(k as any) && !VOLATILE_KEYS.includes(k as any)) {
      throw new Error(`Unclassified payload field: ${k}`)
    }
  }
  if (!Number.isInteger(p.costTotalMinor)) throw new Error('costTotalMinor must be an integer (minor units)')

  const sequences = [...p.sequences]
    .map(s => ({ id: nfc(s.id), residues: nfc(s.residues) }))
    .sort((a, b) => a.id.localeCompare(b.id))
  const concentrations = [...p.concentrations].sort((a, b) => a - b)

  const ordered: [string, unknown][] = [
    ['method', p.method], ['experimentType', p.experimentType], ['targetId', nfc(p.targetId)],
    ['sequences', sequences], ['concentrations', concentrations], ['replicates', p.replicates],
    ['costTotalMinor', p.costTotalMinor], ['currency', nfc(p.currency)],
    ['environment', p.environment], ['operation', p.operation], ['canonicalizerVersion', p.canonicalizerVersion],
  ]
  return JSON.stringify(ordered)
}

export function hashDraftPayload(p: DraftPayload): string {
  return sha256Hex(canonicalizeDraftPayload(p))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/payload/canonical.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/payload
git commit -m "feat(domain): canonical draft-payload hash (approval binding + idempotency key)"
```

---

## Task 6: Approval lifecycle rules (FOUND-004)

**Files:**
- Create: `src/domain/approval/rules.ts`
- Test: `src/domain/approval/rules.test.ts`

**Interfaces:**
- Consumes: `Approval`, `DraftPayload` from `@/domain/schemas`; `hashDraftPayload`.
- Produces: `approvalStatusFor(approval: Approval, currentPayload: DraftPayload, nowIso: string): 'valid' | 'expired' | 'invalidated'`.

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/approval/rules.test.ts
import { describe, it, expect } from 'vitest'
import { approvalStatusFor } from './rules'
import { hashDraftPayload } from '@/domain/payload/canonical'
import type { Approval, DraftPayload } from '@/domain/schemas'

const payload: DraftPayload = {
  method: 'bli', experimentType: 'affinity', targetId: 'tgt_egfr_human',
  sequences: [{ id: 'AC-1', residues: 'MKTAYIAK' }], concentrations: [1e-9], replicates: 2,
  costTotalMinor: 370000, currency: 'USD', environment: 'mock', operation: 'create_draft',
  canonicalizerVersion: 'canon@v1', version: 1,
}
const approval: Approval = {
  id: 'ap-1', operation: 'create_draft', payloadHash: hashDraftPayload(payload), payloadVersion: 1,
  requestId: 'req-1', actor: 'operator', issuedAt: '2026-07-22T10:00:00Z', expiresAt: '2026-07-22T10:15:00Z',
  environment: 'mock', costSnapshotMinor: 370000, status: 'valid',
}

describe('approvalStatusFor', () => {
  it('is valid for the exact payload before expiry', () => {
    expect(approvalStatusFor(approval, payload, '2026-07-22T10:05:00Z')).toBe('valid')
  })
  it('is invalidated when the payload changes', () => {
    expect(approvalStatusFor(approval, { ...payload, costTotalMinor: 370001 }, '2026-07-22T10:05:00Z')).toBe('invalidated')
  })
  it('is expired after expiresAt', () => {
    expect(approvalStatusFor(approval, payload, '2026-07-22T10:20:00Z')).toBe('expired')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/approval/rules.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/domain/approval/rules.ts`**

```ts
import type { Approval, DraftPayload } from '@/domain/schemas'
import { hashDraftPayload } from '@/domain/payload/canonical'

export function approvalStatusFor(approval: Approval, currentPayload: DraftPayload, nowIso: string): 'valid' | 'expired' | 'invalidated' {
  if (hashDraftPayload(currentPayload) !== approval.payloadHash) return 'invalidated'
  if (currentPayload.operation !== approval.operation) return 'invalidated'
  if (new Date(nowIso).getTime() > new Date(approval.expiresAt).getTime()) return 'expired'
  return 'valid'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/approval/rules.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/approval
git commit -m "feat(domain): approval freshness rules bound to canonical hash"
```

---

## Task 7: Webhook signature verification and rank-based transition (FOUND-005 domain)

**Files:**
- Create: `src/domain/webhook/verify.ts`, `src/domain/webhook/transition.ts`
- Test: `src/domain/webhook/webhook.test.ts`

**Interfaces:**
- Produces: `verifyWebhookSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean`; `statusRank(s: string): number`; `decideTransition(current: string | null, incoming: string): 'apply' | 'ignore'`.

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/webhook/webhook.test.ts
import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyWebhookSignature } from './verify'
import { decideTransition } from './transition'

const SECRET = 'test-secret'
const body = JSON.stringify({ deliveryId: 'D1', targetStatus: 'completed', experimentId: 'exp-1' })
const goodSig = createHmac('sha256', SECRET).update(body, 'utf8').digest('hex')

describe('verifyWebhookSignature', () => {
  it('accepts a correct HMAC over the raw body', () => {
    expect(verifyWebhookSignature(body, goodSig, SECRET)).toBe(true)
  })
  it('rejects a tampered body, a wrong signature, and a missing header', () => {
    expect(verifyWebhookSignature(body + ' ', goodSig, SECRET)).toBe(false)
    expect(verifyWebhookSignature(body, 'deadbeef', SECRET)).toBe(false)
    expect(verifyWebhookSignature(body, null, SECRET)).toBe(false)
  })
})

describe('decideTransition (rank-based)', () => {
  it('applies a forward transition, even skipping a rank', () => {
    expect(decideTransition(null, 'queued')).toBe('apply')
    expect(decideTransition('queued', 'completed')).toBe('apply')
  })
  it('ignores a duplicate or backward transition', () => {
    expect(decideTransition('completed', 'completed')).toBe('ignore')
    expect(decideTransition('in_progress', 'queued')).toBe('ignore')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/webhook/webhook.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create implementations**

`src/domain/webhook/verify.ts`:
```ts
import { createHmac, timingSafeEqual } from 'node:crypto'

export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) return false
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(signatureHeader, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
```

`src/domain/webhook/transition.ts`:
```ts
const RANK: Record<string, number> = { queued: 1, in_progress: 2, completed: 3, failed: 3 }

export function statusRank(s: string): number { return RANK[s] ?? -1 }

export function decideTransition(current: string | null, incoming: string): 'apply' | 'ignore' {
  const incomingRank = statusRank(incoming)
  if (incomingRank < 0) return 'ignore'
  const currentRank = current === null ? 0 : statusRank(current)
  return incomingRank > currentRank ? 'apply' : 'ignore'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/webhook/webhook.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/webhook
git commit -m "feat(domain): constant-time webhook HMAC verify + rank-based transitions"
```

---

## Task 8: Deterministic results QC (FOUND-006 core)

**Files:**
- Create: `src/domain/results/qc.ts`
- Test: `src/domain/results/qc.test.ts`

**Interfaces:**
- Consumes: `ResultRecord`, `QCResult` from `@/domain/schemas`; `qcThresholdsV1`.
- Produces: `classifyCandidate(record: ResultRecord): QCResult`; `coefficientOfVariation(values: number[]): number`.

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/results/qc.test.ts
import { describe, it, expect } from 'vitest'
import { classifyCandidate, coefficientOfVariation } from './qc'
import type { ResultRecord } from '@/domain/schemas'

const rec = (over: Partial<ResultRecord>): ResultRecord => ({
  experimentId: 'exp-1', candidateId: 'AC', expressionOutcome: true,
  replicateKdsM: [2.0e-9, 2.1e-9, 1.95e-9], fitR2: 0.985, kdSteadyStateM: 2.1e-9, kdKineticM: 1.9e-9,
  measurements: [], controlOutcome: 'pass', ...over,
})

describe('classifyCandidate at qc_thresholds@v1', () => {
  it('AC-1 strong consistent binder -> confirmed_binder', () => {
    const r = classifyCandidate(rec({ candidateId: 'AC-1' }))
    expect(r.bindingClass).toBe('confirmed_binder')
    expect(r.recommendation).toBe('follow_up')
  })
  it('AC-2 poor fit -> apparent_binder_poor_fit', () => {
    const r = classifyCandidate(rec({ candidateId: 'AC-2', replicateKdsM: [40e-9, 44e-9, 38e-9], fitR2: 0.82, kdSteadyStateM: 8e-9, kdKineticM: 42e-9 }))
    expect(r.bindingClass).toBe('apparent_binder_poor_fit')
    expect(r.warnings).toContain('LOW_R2')
  })
  it('AC-3 no expression -> no_expression', () => {
    const r = classifyCandidate(rec({ candidateId: 'AC-3', expressionOutcome: false, replicateKdsM: null, fitR2: null, kdSteadyStateM: null, kdKineticM: null }))
    expect(r.bindingClass).toBe('no_expression')
    expect(r.affinity.kdM).toBeNull()
  })
  it('AC-4 contradictory replicates -> inconclusive_replicate_inconsistent', () => {
    const r = classifyCandidate(rec({ candidateId: 'AC-4', replicateKdsM: [5e-9, 500e-9] }))
    expect(r.bindingClass).toBe('inconclusive_replicate_inconsistent')
    expect(r.warnings).toContain('REPLICATE_CV_EXCEEDED')
  })
  it('computes CV as sample stdev / mean', () => {
    expect(coefficientOfVariation([5e-9, 500e-9])).toBeCloseTo(1.386, 2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/results/qc.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/domain/results/qc.ts`**

```ts
import type { ResultRecord, QCResult } from '@/domain/schemas'
import { qcThresholdsV1 as T } from '@/domain/constants'

export function coefficientOfVariation(values: number[]): number {
  const n = values.length
  if (n < 2) return 0
  const mean = values.reduce((a, b) => a + b, 0) / n
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)
  return Math.sqrt(variance) / mean
}

export function classifyCandidate(rec: ResultRecord): QCResult {
  const warnings: string[] = []
  const base = {
    candidateId: rec.candidateId, appliedThresholds: T.version, controlOutcome: rec.controlOutcome,
  }

  if (!rec.expressionOutcome) {
    return { ...base, expressionClass: 'no_expression', bindingClass: 'no_expression',
      affinity: { kdM: null, ciLowM: null, ciHighM: null },
      replicateConsistency: { cv: null, consistent: false }, fitQuality: { r2: null, pass: false },
      recommendation: 'drop', warnings: ['NO_EXPRESSION'] }
  }

  const kds = rec.replicateKdsM ?? []
  const cv = coefficientOfVariation(kds)
  const meanKd = kds.length ? kds.reduce((a, b) => a + b, 0) / kds.length : null
  const consistent = kds.length >= 2 && cv <= T.replicate.cvMax
  const r2 = rec.fitR2
  const r2Pass = r2 !== null && r2 >= T.fit.r2Min
  const ratio = rec.kdSteadyStateM !== null && rec.kdKineticM ? rec.kdSteadyStateM / rec.kdKineticM : null
  const ratioOk = ratio !== null && ratio >= 1 / T.fit.ssKinRatioMax && ratio <= T.fit.ssKinRatioMax

  const affinity = { kdM: meanKd, ciLowM: null, ciHighM: null }
  const replicateConsistency = { cv, consistent }
  const fitQuality = { r2, pass: r2Pass && ratioOk }

  if (!consistent) {
    warnings.push('REPLICATE_CV_EXCEEDED')
    return { ...base, expressionClass: 'expressed', bindingClass: 'inconclusive_replicate_inconsistent',
      affinity, replicateConsistency, fitQuality, recommendation: 'inconclusive', warnings }
  }
  if (!r2Pass) warnings.push('LOW_R2')
  if (!ratioOk) warnings.push('STEADYSTATE_KINETIC_MISMATCH')
  if (!r2Pass || !ratioOk) {
    return { ...base, expressionClass: 'expressed', bindingClass: 'apparent_binder_poor_fit',
      affinity, replicateConsistency, fitQuality, recommendation: 'inconclusive', warnings }
  }
  if (meanKd !== null && meanKd <= T.binding.kdMaxBinderM) {
    return { ...base, expressionClass: 'expressed', bindingClass: 'confirmed_binder',
      affinity, replicateConsistency, fitQuality, recommendation: 'follow_up', warnings }
  }
  return { ...base, expressionClass: 'expressed', bindingClass: 'non_binder',
    affinity, replicateConsistency, fitQuality, recommendation: 'drop', warnings }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/results/qc.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/results
git commit -m "feat(domain): deterministic BLI results QC classifier (qc_thresholds@v1)"
```

---

## Task 9: Evidence bundle assembly (FOUND-006)

**Files:**
- Create: `src/domain/evidence/bundle.ts`
- Test: `src/domain/evidence/bundle.test.ts`

**Interfaces:**
- Consumes: `ResultRecord`, `QCResult`, `EvidenceRecord`, `EvidenceBundle` from `@/domain/schemas`.
- Produces: `buildEvidenceBundle(experimentId: string, pairs: { record: ResultRecord; qc: QCResult }[]): EvidenceBundle`; `resolveEvidence(bundle: EvidenceBundle, id: string): EvidenceRecord | undefined`.

Each candidate contributes evidence records with stable ids `ev_<candidateId>_kd`, `ev_<candidateId>_r2`, `ev_<candidateId>_cv`.

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/evidence/bundle.test.ts
import { describe, it, expect } from 'vitest'
import { buildEvidenceBundle, resolveEvidence } from './bundle'
import { classifyCandidate } from '@/domain/results/qc'
import type { ResultRecord } from '@/domain/schemas'

const record: ResultRecord = { experimentId: 'exp-1', candidateId: 'AC-1', expressionOutcome: true,
  replicateKdsM: [2.0e-9, 2.1e-9, 1.95e-9], fitR2: 0.985, kdSteadyStateM: 2.1e-9, kdKineticM: 1.9e-9,
  measurements: [], controlOutcome: 'pass' }

describe('buildEvidenceBundle', () => {
  it('emits stable evidence ids with measured/derived values and units', () => {
    const bundle = buildEvidenceBundle('exp-1', [{ record, qc: classifyCandidate(record) }])
    const kd = resolveEvidence(bundle, 'ev_AC-1_kd')
    expect(kd?.unit).toBe('nM')
    expect(kd?.value).toBeCloseTo(2.017, 2) // mean KD in nM
    expect(resolveEvidence(bundle, 'ev_AC-1_r2')?.value).toBe(0.985)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/evidence/bundle.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/domain/evidence/bundle.ts`**

```ts
import type { ResultRecord, QCResult, EvidenceRecord, EvidenceBundle } from '@/domain/schemas'

export function buildEvidenceBundle(experimentId: string, pairs: { record: ResultRecord; qc: QCResult }[]): EvidenceBundle {
  const records: EvidenceRecord[] = []
  for (const { record, qc } of pairs) {
    const cid = record.candidateId
    if (qc.affinity.kdM !== null) {
      records.push({ id: `ev_${cid}_kd`, kind: 'qc_calculation', sourceRef: `${cid}:mean_kd`,
        value: qc.affinity.kdM * 1e9, unit: 'nM', displayLabel: `${cid} mean KD`,
        provenanceChain: [`replicates:${(record.replicateKdsM ?? []).join(',')}`] })
    }
    if (record.fitR2 !== null) {
      records.push({ id: `ev_${cid}_r2`, kind: 'measurement', sourceRef: `${cid}:fit_r2`,
        value: record.fitR2, unit: 'dimensionless', displayLabel: `${cid} fit R²`, provenanceChain: [`${cid}:curve_fit`] })
    }
    if (qc.replicateConsistency.cv !== null) {
      records.push({ id: `ev_${cid}_cv`, kind: 'qc_calculation', sourceRef: `${cid}:cv`,
        value: qc.replicateConsistency.cv, unit: 'ratio', displayLabel: `${cid} replicate CV`, provenanceChain: [`${cid}:replicate_kds`] })
    }
  }
  const binders = pairs.filter(p => p.qc.bindingClass === 'confirmed_binder').length
  return { experimentId, records, summaryStats: { candidateCount: pairs.length, confirmedBinders: binders } }
}

export function resolveEvidence(bundle: EvidenceBundle, id: string): EvidenceRecord | undefined {
  return bundle.records.find(r => r.id === id)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/evidence/bundle.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/domain/evidence
git commit -m "feat(domain): evidence bundle assembly with stable ids and units"
```

---

## Task 10: Fail-closed customer-draft validator (FOUND-007 core, load-bearing — ADR-0004)

**Files:**
- Create: `src/domain/comms/validate.ts`
- Test: `src/domain/comms/validate.test.ts`

**Interfaces:**
- Consumes: `CustomerDraft`, `EvidenceBundle` from `@/domain/schemas`; `qcThresholdsV1.evidence.relTol`; `resolveEvidence`.
- Produces: `validateCustomerDraft(draft: CustomerDraft, bundle: EvidenceBundle): { ok: boolean; errors: { code: string; detail: string }[] }`.

Checks per numeric claim: `EVIDENCE_NOT_FOUND`, `EVIDENCE_UNIT_MISMATCH`, `EVIDENCE_VALUE_MISMATCH`. Plus a prose-number scan: every numeric token in `text` must be covered by a validated claim value (within relTol) or `UNTAGGED_NUMBER`.

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/comms/validate.test.ts
import { describe, it, expect } from 'vitest'
import { validateCustomerDraft } from './validate'
import type { CustomerDraft, EvidenceBundle } from '@/domain/schemas'

const bundle: EvidenceBundle = { experimentId: 'exp-1', summaryStats: {},
  records: [{ id: 'ev_AC-1_kd', kind: 'qc_calculation', sourceRef: 'AC-1:mean_kd', value: 2.02, unit: 'nM', displayLabel: 'AC-1 mean KD', provenanceChain: [] }] }

const draft = (over: Partial<CustomerDraft['bodyBlocks'][number]>): CustomerDraft => ({
  bodyBlocks: [{ text: 'AC-1 bound with KD 2.0 nM.', claimType: 'confirmed',
    numericClaims: [{ value: 2.0, unit: 'nM', evidenceId: 'ev_AC-1_kd' }], ...over }],
  unresolvedClaims: [], generatedBy: { adapter: 'stub', model: 'stub', promptHash: 'x' }, status: 'draft',
})

describe('validateCustomerDraft (fail-closed)', () => {
  it('accepts a claim within tolerance whose prose number is tagged', () => {
    expect(validateCustomerDraft(draft({}), bundle).ok).toBe(true)
  })
  it('blocks a missing evidence id', () => {
    const r = validateCustomerDraft(draft({ numericClaims: [{ value: 2.0, unit: 'nM', evidenceId: 'ev_nope' }] }), bundle)
    expect(r.ok).toBe(false)
    expect(r.errors.some(e => e.code === 'EVIDENCE_NOT_FOUND')).toBe(true)
  })
  it('blocks a value mismatch beyond tolerance', () => {
    const r = validateCustomerDraft(draft({ text: 'KD 0.5 nM.', numericClaims: [{ value: 0.5, unit: 'nM', evidenceId: 'ev_AC-1_kd' }] }), bundle)
    expect(r.errors.some(e => e.code === 'EVIDENCE_VALUE_MISMATCH')).toBe(true)
  })
  it('blocks a unit mismatch', () => {
    const r = validateCustomerDraft(draft({ text: 'KD 2.0 uM.', numericClaims: [{ value: 2.0, unit: 'uM', evidenceId: 'ev_AC-1_kd' }] }), bundle)
    expect(r.errors.some(e => e.code === 'EVIDENCE_UNIT_MISMATCH')).toBe(true)
  })
  it('blocks an untagged number in prose', () => {
    const r = validateCustomerDraft(draft({ text: 'AC-1 improved binding by 40% at KD 2.0 nM.' }), bundle)
    expect(r.errors.some(e => e.code === 'UNTAGGED_NUMBER')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/comms/validate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/domain/comms/validate.ts`**

```ts
import type { CustomerDraft, EvidenceBundle } from '@/domain/schemas'
import { qcThresholdsV1 } from '@/domain/constants'
import { resolveEvidence } from '@/domain/evidence/bundle'

const REL_TOL = qcThresholdsV1.evidence.relTol
const NUMBER_RE = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?%?/g

function withinTol(a: number, b: number): boolean {
  if (b === 0) return a === 0
  return Math.abs(a - b) / Math.abs(b) <= REL_TOL
}

export function validateCustomerDraft(draft: CustomerDraft, bundle: EvidenceBundle): {
  ok: boolean; errors: { code: string; detail: string }[]
} {
  const errors: { code: string; detail: string }[] = []
  const validatedValues: number[] = []

  for (const block of draft.bodyBlocks) {
    for (const claim of block.numericClaims) {
      const ev = resolveEvidence(bundle, claim.evidenceId)
      if (!ev) { errors.push({ code: 'EVIDENCE_NOT_FOUND', detail: claim.evidenceId }); continue }
      if (ev.unit !== claim.unit) { errors.push({ code: 'EVIDENCE_UNIT_MISMATCH', detail: `${claim.unit} != ${ev.unit}` }); continue }
      if (!withinTol(claim.value, ev.value)) { errors.push({ code: 'EVIDENCE_VALUE_MISMATCH', detail: `${claim.value} vs ${ev.value}` }); continue }
      validatedValues.push(claim.value)
    }
  }

  for (const block of draft.bodyBlocks) {
    const tokens = block.text.match(NUMBER_RE) ?? []
    for (const tok of tokens) {
      const num = parseFloat(tok.replace('%', ''))
      if (Number.isNaN(num)) continue
      const covered = validatedValues.some(v => withinTol(num, v))
      if (!covered) errors.push({ code: 'UNTAGGED_NUMBER', detail: tok })
    }
  }

  return { ok: errors.length === 0, errors }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/comms/validate.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/comms
git commit -m "feat(domain): fail-closed customer-draft evidence validator (+ prose-number scan)"
```

---

## Task 11: Ports, MockFoundryClient, and DeterministicLlmAdapter

**Files:**
- Create: `src/application/ports.ts`, `src/adapters/foundry/mock.ts`, `src/adapters/foundry/factory.ts`, `src/adapters/llm/deterministic.ts`, `src/adapters/llm/factory.ts`
- Create fixtures: `fixtures/targets.ts`, `fixtures/candidates.ts`, `fixtures/intent.ts`, `fixtures/results.ts`
- Test: `src/adapters/foundry/mock.test.ts`, `src/adapters/llm/deterministic.test.ts`

**Interfaces:**
- Produces `ports.ts`:
```ts
export interface FoundryClient {
  searchTargets(q: { query: string }): Promise<Target[]>
  estimateCost(input: { acceptedCount: number; budgetMinor: number | null }): Promise<CostEstimate>
  createDraft(input: DraftPayload, opts: { idempotencyKey: string }): Promise<{ experimentId: string; draftId: string }>
  getExperimentStatus(experimentId: string): Promise<{ status: string }>
  getResults(experimentId: string): Promise<ResultRecord[]>
}
export interface LlmClient {
  extractIntent(input: { requestText: string }): Promise<{ ok: true; intent: ExperimentIntent } | { ok: false; error: string }>
  draftCustomerUpdate(input: { evidenceBundle: EvidenceBundle }): Promise<{ ok: true; draft: CustomerDraft } | { ok: false; error: string }>
}
```
- Produces: `buildFoundryClient(): FoundryClient`; `buildLlmClient(): LlmClient`; fixture exports `demoTargets`, `demoCandidates` (AC-1..AC-8), `demoResultRecords`, `demoIntent`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/adapters/foundry/mock.test.ts
import { describe, it, expect } from 'vitest'
import { MockFoundryClient } from './mock'

describe('MockFoundryClient', () => {
  it('estimates cost deterministically and flags over-budget for 6 candidates', async () => {
    const c = new MockFoundryClient()
    const est = await c.estimateCost({ acceptedCount: 6, budgetMinor: 800000 })
    expect(est.totalMinor).toBe(970000)
    expect(est.withinBudget).toBe(false)
    expect(est.maxWithinBudget).toBe(4)
  })
  it('is idempotent: same key returns the same experiment id', async () => {
    const c = new MockFoundryClient()
    const payload: any = { targetId: 'tgt_egfr_human', sequences: [], concentrations: [], replicates: 2,
      costTotalMinor: 730000, currency: 'USD', environment: 'mock', operation: 'create_draft', method: 'bli', experimentType: 'affinity', canonicalizerVersion: 'canon@v1', version: 1 }
    const a = await c.createDraft(payload, { idempotencyKey: 'k1' })
    const b = await c.createDraft(payload, { idempotencyKey: 'k1' })
    expect(a.experimentId).toBe(b.experimentId)
  })
})
```

```ts
// src/adapters/llm/deterministic.test.ts
import { describe, it, expect } from 'vitest'
import { DeterministicLlmAdapter } from './deterministic'

describe('DeterministicLlmAdapter', () => {
  it('extracts a fixed intent without inventing an absent budget', async () => {
    const llm = new DeterministicLlmAdapter()
    const r = await llm.extractIntent({ requestText: 'BLI screen against EGFR, no budget stated.' })
    expect(r.ok).toBe(true)
    if (r.ok) { expect(r.intent.method).toBe('bli'); expect(r.intent.budget).toBeNull() }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/adapters`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create fixtures**

`fixtures/targets.ts`:
```ts
import type { Target } from '@/domain/schemas'
export const demoTargets: Target[] = [
  { foundryTargetId: 'tgt_egfr_human', name: 'EGFR (human ECD)', aliases: ['EGFR'], organism: 'Homo sapiens', uniprotId: 'P00533' },
  { foundryTargetId: 'tgt_egfr_ecd_fc', name: 'EGFR ectodomain-Fc', aliases: ['EGFR'], organism: 'Homo sapiens', uniprotId: 'P00533' },
]
```

`fixtures/candidates.ts` (AC-1..AC-8; AC-6 duplicates AC-1, AC-5 malformed):
```ts
export const demoFasta = [
  '>AC-1 strong binder', 'MKTAYIAKQR',
  '>AC-2 poor fit', 'MKQWERTYIPL',
  '>AC-3 no expression', 'MKLLNODATAA'.replace('O', 'Q'),
  '>AC-4 contradictory', 'MKSTVWYACDE',
  '>AC-5 malformed', 'MKTAYIAKZZ',      // Z invalid residue
  '>AC-6 duplicate of AC-1', 'MKTAYIAKQR',
  '>AC-7 filler', 'MKGGHHIILLK',
  '>AC-8 weak binder', 'MKPPRRSSTTV',
].join('\n') + '\n'
```

`fixtures/intent.ts`:
```ts
import type { ExperimentIntent } from '@/domain/schemas'
import { DEMO_BUDGET_MINOR } from '@/domain/constants'
export const demoIntent: ExperimentIntent = {
  experimentType: 'affinity', method: 'bli', targetQuery: 'EGFR', requestedCount: 8,
  concentrations: [1e-7, 3e-8, 1e-8, 3e-9, 1e-9, 4e-10], replicates: 2,
  budget: { amountMinor: DEMO_BUDGET_MINOR, currency: 'USD' }, approvalRequired: true,
  fields: [
    { name: 'target', value: 'EGFR', confidence: 0.72, sourceSpan: { start: 34, end: 38 } },
    { name: 'method', value: 'bli', confidence: 0.95, sourceSpan: { start: 8, end: 11 } },
    { name: 'budget', value: 8000, confidence: 0.9, sourceSpan: { start: 60, end: 71 } },
  ],
  ambiguities: [{ field: 'target', reason: 'EGFR resolves to more than one construct', options: ['tgt_egfr_human', 'tgt_egfr_ecd_fc'] }],
}
export const demoIntentNoBudget: ExperimentIntent = { ...demoIntent, budget: null,
  fields: demoIntent.fields.filter(f => f.name !== 'budget'),
  ambiguities: [...demoIntent.ambiguities, { field: 'budget', reason: 'not_stated' }] }
```

`fixtures/results.ts`:
```ts
import type { ResultRecord } from '@/domain/schemas'
const m = (candidateId: string, over: Partial<ResultRecord>): ResultRecord => ({
  experimentId: 'exp-demo', candidateId, expressionOutcome: true, replicateKdsM: null,
  fitR2: null, kdSteadyStateM: null, kdKineticM: null, measurements: [], controlOutcome: 'pass', ...over })
export const demoResultRecords: ResultRecord[] = [
  m('AC-1', { replicateKdsM: [2.0e-9, 2.1e-9, 1.95e-9], fitR2: 0.985, kdSteadyStateM: 2.1e-9, kdKineticM: 1.9e-9 }),
  m('AC-2', { replicateKdsM: [40e-9, 44e-9, 38e-9], fitR2: 0.82, kdSteadyStateM: 8e-9, kdKineticM: 42e-9 }),
  m('AC-3', { expressionOutcome: false, controlOutcome: 'na' }),
  m('AC-4', { replicateKdsM: [5e-9, 500e-9], fitR2: 0.6 }),
  m('AC-7', { replicateKdsM: [40e-9, 41e-9, 39e-9], fitR2: 0.97, kdSteadyStateM: 40e-9, kdKineticM: 41e-9 }),
  m('AC-8', { replicateKdsM: [8e-7, 8.2e-7, 7.9e-7], fitR2: 0.96, kdSteadyStateM: 8e-7, kdKineticM: 8.1e-7 }),
]
```

- [ ] **Step 4: Create `src/application/ports.ts`** (interfaces exactly as in the Interfaces block above).

- [ ] **Step 5: Create `src/adapters/foundry/mock.ts`**

```ts
import type { FoundryClient } from '@/application/ports'
import type { Target, CostEstimate, DraftPayload, ResultRecord } from '@/domain/schemas'
import { SETUP_COST_MINOR, PER_CANDIDATE_MINOR } from '@/domain/constants'
import { applyBudget } from '@/domain/cost/budget'
import { demoTargets } from '../../../fixtures/targets'
import { demoResultRecords } from '../../../fixtures/results'

export class MockFoundryClient implements FoundryClient {
  private drafts = new Map<string, { experimentId: string; draftId: string }>()
  private counter = 1000

  async searchTargets({ query }: { query: string }): Promise<Target[]> {
    const q = query.trim().toLowerCase()
    return demoTargets.filter(t => t.aliases.some(a => a.toLowerCase() === q) || t.name.toLowerCase().includes(q))
  }
  async estimateCost({ acceptedCount, budgetMinor }: { acceptedCount: number; budgetMinor: number | null }): Promise<CostEstimate> {
    const totalMinor = SETUP_COST_MINOR + PER_CANDIDATE_MINOR * acceptedCount
    const { withinBudget, overageMinor, maxWithinBudget } = applyBudget(totalMinor, budgetMinor)
    return { foundryQuoteRef: `quote_${acceptedCount}`, currency: 'USD', totalMinor, withinBudget, overageMinor, maxWithinBudget,
      lineItems: [ { label: 'Assay setup', amountMinor: SETUP_COST_MINOR },
        { label: `Per-candidate (${acceptedCount})`, amountMinor: PER_CANDIDATE_MINOR * acceptedCount } ] }
  }
  async createDraft(_input: DraftPayload, opts: { idempotencyKey: string }): Promise<{ experimentId: string; draftId: string }> {
    const existing = this.drafts.get(opts.idempotencyKey)
    if (existing) return existing
    const created = { experimentId: `exp_${this.counter}`, draftId: `draft_${this.counter}` }
    this.counter += 1
    this.drafts.set(opts.idempotencyKey, created)
    return created
  }
  async getExperimentStatus(_experimentId: string): Promise<{ status: string }> { return { status: 'completed' } }
  async getResults(_experimentId: string): Promise<ResultRecord[]> { return demoResultRecords }
}
```

- [ ] **Step 6: Create `src/adapters/llm/deterministic.ts`**

```ts
import type { LlmClient } from '@/application/ports'
import type { ExperimentIntent, EvidenceBundle, CustomerDraft } from '@/domain/schemas'
import { demoIntent, demoIntentNoBudget } from '../../../fixtures/intent'

export class DeterministicLlmAdapter implements LlmClient {
  async extractIntent({ requestText }: { requestText: string }) {
    const intent: ExperimentIntent = /no budget/i.test(requestText) ? demoIntentNoBudget : demoIntent
    return { ok: true as const, intent }
  }
  async draftCustomerUpdate({ evidenceBundle }: { evidenceBundle: EvidenceBundle }) {
    const kd = evidenceBundle.records.find(r => r.id === 'ev_AC-1_kd')
    const value = kd ? Number(kd.value.toFixed(2)) : 0
    const draft: CustomerDraft = {
      bodyBlocks: [{
        text: `AC-1 is a confirmed binder with a mean KD of ${value} nM and is recommended for follow-up.`,
        claimType: 'confirmed', numericClaims: kd ? [{ value, unit: 'nM', evidenceId: 'ev_AC-1_kd' }] : [],
      }],
      unresolvedClaims: [], generatedBy: { adapter: 'deterministic', model: 'stub', promptHash: 'fixed' }, status: 'draft',
    }
    return { ok: true as const, draft }
  }
}
```

- [ ] **Step 7: Create the factories**

`src/adapters/foundry/factory.ts`:
```ts
import type { FoundryClient } from '@/application/ports'
import { MockFoundryClient } from './mock'
import { env, assertLiveAllowed } from '@/infrastructure/config/env'

export function buildFoundryClient(): FoundryClient {
  if (env.foundryMode === 'mock') return new MockFoundryClient()
  assertLiveAllowed()
  throw new Error('FoundryHttpClient is not wired for the demo; set FOUNDRY_MODE=mock')
}
```

`src/adapters/llm/factory.ts`:
```ts
import type { LlmClient } from '@/application/ports'
import { DeterministicLlmAdapter } from './deterministic'
import { env } from '@/infrastructure/config/env'

export async function buildLlmClient(): Promise<LlmClient> {
  if (env.llmProvider === 'gemini') {
    const { GeminiLlmAdapter } = await import('./gemini')
    return new GeminiLlmAdapter()
  }
  return new DeterministicLlmAdapter()
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/adapters`
Expected: PASS (3 tests). (The gemini import is lazy; not needed until Task 18.)

- [ ] **Step 9: Commit**

```bash
git add src/application/ports.ts src/adapters fixtures
git commit -m "feat(adapters): ports, MockFoundryClient, DeterministicLlmAdapter, demo fixtures"
```

---

## Task 12: Persistence — Drizzle schema and repositories

**Files:**
- Create: `src/infrastructure/db/schema.ts`, `src/infrastructure/db/client.ts`, `src/infrastructure/repositories/index.ts`, `drizzle.config.ts`
- Test: `tests/repositories.test.ts`

**Interfaces:**
- Produces: `getDb(dbPath?: string)`; tables `requests`, `approvals`, `drafts`, `webhookDeliveries`, `eventLog`. Repository functions: `insertWebhookDeliveryOnce(db, deliveryId, row): boolean` (returns false if duplicate), `consumeApproval(db, approvalId): boolean` (conditional UPDATE, returns rowcount===1), `appendEvent(db, entry)`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/repositories.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { getDb, migrate } from '@/infrastructure/db/client'
import { insertWebhookDeliveryOnce, consumeApproval, seedApproval } from '@/infrastructure/repositories'

describe('repositories', () => {
  let db: ReturnType<typeof getDb>
  beforeEach(() => { db = getDb(':memory:'); migrate(db) })

  it('deduplicates a webhook delivery by id', () => {
    const row = { experimentId: 'exp-1', targetStatus: 'completed', raw: '{}' }
    expect(insertWebhookDeliveryOnce(db, 'D1', row)).toBe(true)
    expect(insertWebhookDeliveryOnce(db, 'D1', row)).toBe(false)
  })

  it('consumes an approval exactly once', () => {
    seedApproval(db, { id: 'ap-1', payloadHash: 'h', status: 'valid' })
    expect(consumeApproval(db, 'ap-1')).toBe(true)
    expect(consumeApproval(db, 'ap-1')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/repositories.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `src/infrastructure/db/schema.ts`**

```ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const approvals = sqliteTable('approvals', {
  id: text('id').primaryKey(), payloadHash: text('payload_hash').notNull(),
  status: text('status').notNull(), consumed: integer('consumed').notNull().default(0),
})
export const webhookDeliveries = sqliteTable('webhook_deliveries', {
  deliveryId: text('delivery_id').primaryKey(), experimentId: text('experiment_id').notNull(),
  targetStatus: text('target_status').notNull(), raw: text('raw').notNull(),
})
export const eventLog = sqliteTable('event_log', {
  id: integer('id').primaryKey({ autoIncrement: true }), kind: text('kind').notNull(),
  detail: text('detail').notNull(), at: text('at').notNull(),
})
```

- [ ] **Step 4: Create `src/infrastructure/db/client.ts`**

```ts
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'

export function getDb(dbPath: string) {
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  return drizzle(sqlite, { logger: false })
}
export function migrate(db: ReturnType<typeof getDb>): void {
  const raw = (db as any).session.client as import('better-sqlite3').Database
  raw.exec(`
    CREATE TABLE IF NOT EXISTS approvals (id TEXT PRIMARY KEY, payload_hash TEXT NOT NULL, status TEXT NOT NULL, consumed INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS webhook_deliveries (delivery_id TEXT PRIMARY KEY, experiment_id TEXT NOT NULL, target_status TEXT NOT NULL, raw TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS event_log (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, detail TEXT NOT NULL, at TEXT NOT NULL);
  `)
}
```

- [ ] **Step 5: Create `src/infrastructure/repositories/index.ts`**

```ts
import { sql } from 'drizzle-orm'
import { approvals } from '@/infrastructure/db/schema'
import type { getDb } from '@/infrastructure/db/client'

type Db = ReturnType<typeof getDb>

export function insertWebhookDeliveryOnce(db: Db, deliveryId: string, row: { experimentId: string; targetStatus: string; raw: string }): boolean {
  const raw = (db as any).session.client as import('better-sqlite3').Database
  const res = raw.prepare('INSERT OR IGNORE INTO webhook_deliveries (delivery_id, experiment_id, target_status, raw) VALUES (?,?,?,?)')
    .run(deliveryId, row.experimentId, row.targetStatus, row.raw)
  return res.changes === 1
}
export function consumeApproval(db: Db, approvalId: string): boolean {
  const raw = (db as any).session.client as import('better-sqlite3').Database
  const res = raw.prepare("UPDATE approvals SET consumed = 1, status = 'consumed' WHERE id = ? AND consumed = 0").run(approvalId)
  return res.changes === 1
}
export function seedApproval(db: Db, a: { id: string; payloadHash: string; status: string }): void {
  db.insert(approvals).values({ id: a.id, payloadHash: a.payloadHash, status: a.status }).run()
}
export function appendEvent(db: Db, entry: { kind: string; detail: string; at: string }): void {
  const raw = (db as any).session.client as import('better-sqlite3').Database
  raw.prepare('INSERT INTO event_log (kind, detail, at) VALUES (?,?,?)').run(entry.kind, entry.detail, entry.at)
}
```

`drizzle.config.ts`:
```ts
import type { Config } from 'drizzle-kit'
export default { schema: './src/infrastructure/db/schema.ts', out: './drizzle', dialect: 'sqlite' } satisfies Config
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/repositories.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add src/infrastructure/db src/infrastructure/repositories drizzle.config.ts
git commit -m "feat(infra): Drizzle/SQLite schema, migration, dedup + consume repositories"
```

---

## Task 13: Application services (intake → estimate → createDraft → ingestWebhook → review → draftComms)

**Files:**
- Create: `src/application/intake.ts`, `src/application/estimate.ts`, `src/application/approval.ts`, `src/application/createDraft.ts`, `src/application/ingestWebhook.ts`, `src/application/reviewResults.ts`, `src/application/draftComms.ts`
- Test: `tests/pipeline.integration.test.ts`

**Interfaces:**
- Consumes: all domain functions + `FoundryClient`/`LlmClient` ports + repositories.
- Produces (key signatures):
  - `runIntake(llm, foundry, requestText, fastaText): Promise<{ intent, sequenceSet, findings, resolution }>`
  - `createDraftUseCase(db, foundry, { payload, approvalId }): Promise<{ ok: boolean; experimentId?: string; reason?: string }>` — checks approval status, `consumeApproval` then `createDraft` with `idempotencyKey = payload.canonicalHash`, all in one better-sqlite3 transaction.
  - `ingestWebhook(db, { rawBody, signature, secret, currentStatus }): Promise<{ processingStatus }>`
  - `reviewResults(foundry, experimentId): Promise<{ pairs; bundle }>`
  - `draftCustomerUpdate(llm, bundle): Promise<{ ok; draft?; errors? }>`

- [ ] **Step 1: Write the failing integration test (the whole happy path + the safety guards)**

```ts
// tests/pipeline.integration.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { getDb, migrate } from '@/infrastructure/db/client'
import { MockFoundryClient } from '@/adapters/foundry/mock'
import { DeterministicLlmAdapter } from '@/adapters/llm/deterministic'
import { runIntake } from '@/application/intake'
import { createDraftUseCase } from '@/application/createDraft'
import { ingestWebhook } from '@/application/ingestWebhook'
import { reviewResults } from '@/application/reviewResults'
import { draftCustomerUpdate } from '@/application/draftComms'
import { hashDraftPayload } from '@/domain/payload/canonical'
import { seedApproval } from '@/infrastructure/repositories'
import { demoFasta } from '../fixtures/candidates'
import { createHmac } from 'node:crypto'
import type { DraftPayload } from '@/domain/schemas'

const SECRET = 'whsec'

describe('FoundryOps vertical pipeline', () => {
  let db: ReturnType<typeof getDb>
  beforeEach(() => { db = getDb(':memory:'); migrate(db) })

  it('runs intake -> preflight -> resolution with the demo fixtures', async () => {
    const llm = new DeterministicLlmAdapter(); const foundry = new MockFoundryClient()
    const r = await runIntake(llm, foundry, 'BLI screen vs EGFR under $8000', demoFasta)
    expect(r.sequenceSet.acceptedIds).toEqual(['AC-1', 'AC-2', 'AC-3', 'AC-4', 'AC-7', 'AC-8'])
    expect(r.findings.some(f => f.code === 'INVALID_RESIDUE')).toBe(true)
    expect(r.findings.some(f => f.code === 'DUPLICATE_SEQUENCE')).toBe(true)
  })

  it('creates a draft only with a valid approval, and is idempotent + single-consume', async () => {
    const foundry = new MockFoundryClient()
    const payload: DraftPayload = { method: 'bli', experimentType: 'affinity', targetId: 'tgt_egfr_human',
      sequences: [{ id: 'AC-1', residues: 'MKTAYIAKQR' }], concentrations: [1e-9], replicates: 2,
      costTotalMinor: 370000, currency: 'USD', environment: 'mock', operation: 'create_draft',
      canonicalizerVersion: 'canon@v1', version: 1 }
    seedApproval(db, { id: 'ap-1', payloadHash: hashDraftPayload(payload), status: 'valid' })

    const first = await createDraftUseCase(db, foundry, { payload, approvalId: 'ap-1' })
    expect(first.ok).toBe(true)
    const second = await createDraftUseCase(db, foundry, { payload, approvalId: 'ap-1' })
    expect(second.ok).toBe(false) // approval already consumed
    expect(second.reason).toBe('APPROVAL_NOT_CONSUMABLE')
  })

  it('applies a webhook once and ignores a duplicate delivery', async () => {
    const body = JSON.stringify({ deliveryId: 'D1', targetStatus: 'completed', experimentId: 'exp-1' })
    const sig = createHmac('sha256', SECRET).update(body, 'utf8').digest('hex')
    const first = await ingestWebhook(db, { rawBody: body, signature: sig, secret: SECRET, currentStatus: 'queued' })
    const dup = await ingestWebhook(db, { rawBody: body, signature: sig, secret: SECRET, currentStatus: 'completed' })
    expect(first.processingStatus).toBe('accepted')
    expect(dup.processingStatus).toBe('duplicate')
  })

  it('rejects an invalid webhook signature', async () => {
    const body = JSON.stringify({ deliveryId: 'D2', targetStatus: 'completed', experimentId: 'exp-1' })
    const r = await ingestWebhook(db, { rawBody: body, signature: 'bad', secret: SECRET, currentStatus: 'queued' })
    expect(r.processingStatus).toBe('rejected_signature')
  })

  it('reviews results and drafts an evidence-backed update that passes validation', async () => {
    const foundry = new MockFoundryClient(); const llm = new DeterministicLlmAdapter()
    const { bundle } = await reviewResults(foundry, 'exp-demo')
    const r = await draftCustomerUpdate(llm, bundle)
    expect(r.ok).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pipeline.integration.test.ts`
Expected: FAIL — application modules not found.

- [ ] **Step 3: Create the application services**

`src/application/intake.ts`:
```ts
import type { FoundryClient, LlmClient } from './ports'
import { parseFasta } from '@/domain/sequence/fasta'
import { runPreflight } from '@/domain/preflight/engine'
import { resolveTarget } from '@/domain/target/resolve'

export async function runIntake(llm: LlmClient, foundry: FoundryClient, requestText: string, fastaText: string) {
  const extracted = await llm.extractIntent({ requestText })
  if (!extracted.ok) throw new Error(`intent extraction failed: ${extracted.error}`)
  const intent = extracted.intent
  const sequences = parseFasta(fastaText, 'upload.fasta')
  const { findings, sequenceSet } = runPreflight({ sequences, requestedCount: intent.requestedCount })
  const targets = intent.targetQuery ? await foundry.searchTargets({ query: intent.targetQuery }) : []
  const resolution = resolveTarget(intent.targetQuery, targets)
  return { intent, sequenceSet, findings, resolution }
}
```

`src/application/createDraft.ts`:
```ts
import type { FoundryClient } from './ports'
import type { DraftPayload } from '@/domain/schemas'
import { hashDraftPayload } from '@/domain/payload/canonical'
import { consumeApproval, appendEvent } from '@/infrastructure/repositories'
import type { getDb } from '@/infrastructure/db/client'

export async function createDraftUseCase(db: ReturnType<typeof getDb>, foundry: FoundryClient,
  input: { payload: DraftPayload; approvalId: string }): Promise<{ ok: boolean; experimentId?: string; reason?: string }> {
  const raw = (db as any).session.client as import('better-sqlite3').Database
  const row = raw.prepare('SELECT payload_hash as h, consumed as c FROM approvals WHERE id = ?').get(input.approvalId) as { h: string; c: number } | undefined
  if (!row) return { ok: false, reason: 'APPROVAL_NOT_FOUND' }
  if (row.h !== hashDraftPayload(input.payload)) return { ok: false, reason: 'APPROVAL_INVALIDATED' }

  const consumed = consumeApproval(db, input.approvalId)
  if (!consumed) return { ok: false, reason: 'APPROVAL_NOT_CONSUMABLE' }

  const created = await foundry.createDraft(input.payload, { idempotencyKey: hashDraftPayload(input.payload) })
  appendEvent(db, { kind: 'draft_created', detail: created.experimentId, at: input.payload.createdAt ?? 'na' })
  return { ok: true, experimentId: created.experimentId }
}
```

`src/application/ingestWebhook.ts`:
```ts
import { verifyWebhookSignature } from '@/domain/webhook/verify'
import { decideTransition } from '@/domain/webhook/transition'
import { insertWebhookDeliveryOnce, appendEvent } from '@/infrastructure/repositories'
import type { getDb } from '@/infrastructure/db/client'

export async function ingestWebhook(db: ReturnType<typeof getDb>,
  input: { rawBody: string; signature: string | null; secret: string; currentStatus: string | null }): Promise<{ processingStatus: string }> {
  if (!verifyWebhookSignature(input.rawBody, input.signature, input.secret)) {
    appendEvent(db, { kind: 'webhook', detail: 'rejected_signature', at: 'na' })
    return { processingStatus: 'rejected_signature' }
  }
  let parsed: { deliveryId: string; targetStatus: string; experimentId: string }
  try { parsed = JSON.parse(input.rawBody) } catch { return { processingStatus: 'dead_letter' } }

  const fresh = insertWebhookDeliveryOnce(db, parsed.deliveryId, { experimentId: parsed.experimentId, targetStatus: parsed.targetStatus, raw: input.rawBody })
  if (!fresh) return { processingStatus: 'duplicate' }
  const decision = decideTransition(input.currentStatus, parsed.targetStatus)
  const processingStatus = decision === 'apply' ? 'accepted' : 'rejected_transition'
  appendEvent(db, { kind: 'webhook', detail: processingStatus, at: 'na' })
  return { processingStatus }
}
```

`src/application/reviewResults.ts`:
```ts
import type { FoundryClient } from './ports'
import { classifyCandidate } from '@/domain/results/qc'
import { buildEvidenceBundle } from '@/domain/evidence/bundle'

export async function reviewResults(foundry: FoundryClient, experimentId: string) {
  const records = await foundry.getResults(experimentId)
  const pairs = records.map(record => ({ record, qc: classifyCandidate(record) }))
  const bundle = buildEvidenceBundle(experimentId, pairs)
  return { pairs, bundle }
}
```

`src/application/draftComms.ts`:
```ts
import type { LlmClient } from './ports'
import type { EvidenceBundle } from '@/domain/schemas'
import { validateCustomerDraft } from '@/domain/comms/validate'

export async function draftCustomerUpdate(llm: LlmClient, bundle: EvidenceBundle) {
  const result = await llm.draftCustomerUpdate({ evidenceBundle: bundle })
  if (!result.ok) return { ok: false, errors: [{ code: 'LLM_ERROR', detail: result.error }] }
  const validation = validateCustomerDraft(result.draft, bundle)
  if (!validation.ok) return { ok: false, errors: validation.errors }
  return { ok: true, draft: result.draft }
}
```

`src/application/estimate.ts` and `src/application/approval.ts`: thin helpers.
```ts
// src/application/estimate.ts
import type { FoundryClient } from './ports'
export async function estimate(foundry: FoundryClient, acceptedCount: number, budgetMinor: number | null) {
  return foundry.estimateCost({ acceptedCount, budgetMinor })
}
```
```ts
// src/application/approval.ts
import type { Approval, DraftPayload } from '@/domain/schemas'
import { hashDraftPayload } from '@/domain/payload/canonical'
export function buildApproval(payload: DraftPayload, opts: { actor: string; issuedAt: string; ttlMinutes: number; requestId: string }): Approval {
  const issued = new Date(opts.issuedAt).getTime()
  return { id: `ap_${opts.requestId}`, operation: payload.operation, payloadHash: hashDraftPayload(payload),
    payloadVersion: payload.version, requestId: opts.requestId, actor: opts.actor, issuedAt: opts.issuedAt,
    expiresAt: new Date(issued + opts.ttlMinutes * 60000).toISOString(), environment: payload.environment,
    costSnapshotMinor: payload.costTotalMinor, status: 'valid' }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pipeline.integration.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/application
git commit -m "feat(application): intake, createDraft (atomic consume), webhook ingest, review, draft"
```

---

## Task 14: Next.js presentation — workspace shell and the seven stages

**Files:**
- Create: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`
- Create: `src/app/actions/pipeline.ts` (server actions), `src/app/api/webhooks/foundry/route.ts`
- Create components: `src/components/Shell.tsx`, `Stepper.tsx`, `IntakeStage.tsx`, `PreflightStage.tsx`, `ApprovalStage.tsx`, `TimelineStage.tsx`, `ResultsStage.tsx`, `DraftStage.tsx`, `EvidenceChip.tsx`, `EnvBadge.tsx`
- Create: `src/infrastructure/logging/logger.ts`

**Interfaces:**
- Consumes: application services via server actions.
- Produces: a single-page workspace with the persistent stepper + env badge + audit affordance and the six stage panels wired to server actions. This is presentation only — no domain logic. Not TDD; covered by the Playwright suite in Task 15.

- [ ] **Step 1: Create the allowlist logger**

```ts
// src/infrastructure/logging/logger.ts
const ALLOW = new Set(['event', 'kind', 'processingStatus', 'experimentId', 'code', 'severity', 'stage', 'env'])
export function logEvent(fields: Record<string, unknown>): void {
  const safe: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(fields)) if (ALLOW.has(k)) safe[k] = v
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(safe))
}
```

- [ ] **Step 2: Create server actions `src/app/actions/pipeline.ts`**

```ts
'use server'
import { buildFoundryClient } from '@/adapters/foundry/factory'
import { buildLlmClient } from '@/adapters/llm/factory'
import { runIntake } from '@/application/intake'
import { estimate } from '@/application/estimate'
import { reviewResults } from '@/application/reviewResults'
import { draftCustomerUpdate } from '@/application/draftComms'

export async function intakeAction(requestText: string, fastaText: string) {
  const foundry = buildFoundryClient(); const llm = await buildLlmClient()
  const r = await runIntake(llm, foundry, requestText, fastaText)
  const acceptedCount = r.sequenceSet.acceptedIds.length
  const cost = await estimate(foundry, acceptedCount, r.intent.budget?.amountMinor ?? null)
  return { intent: r.intent, findings: r.findings, sequenceSet: r.sequenceSet, resolution: r.resolution, cost }
}

export async function resultsAction(experimentId: string) {
  const foundry = buildFoundryClient()
  const { pairs, bundle } = await reviewResults(foundry, experimentId)
  const llm = await buildLlmClient()
  const draft = await draftCustomerUpdate(llm, bundle)
  return { pairs, bundle, draft }
}
```

- [ ] **Step 3: Create the webhook route `src/app/api/webhooks/foundry/route.ts`**

```ts
import { NextRequest } from 'next/server'
import { getDb, migrate } from '@/infrastructure/db/client'
import { env } from '@/infrastructure/config/env'
import { ingestWebhook } from '@/application/ingestWebhook'

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-foundry-signature')
  const db = getDb(env.dbPath); migrate(db)
  const secret = process.env.FOUNDRY_WEBHOOK_SECRET ?? 'demo-secret'
  const result = await ingestWebhook(db, { rawBody, signature, secret, currentStatus: null })
  const status = result.processingStatus === 'rejected_signature' ? 401 : 200
  return Response.json(result, { status })
}
```

- [ ] **Step 4: Create the shell, stepper, env badge, evidence chip, and stage components**

Build `Shell.tsx` (top bar with `EnvBadge`, run-hash chip, Audit button; left `Stepper`; main canvas slot; bottom action bar). `Stepper.tsx` renders nodes with states `locked|active|complete|blocked`. `EnvBadge.tsx` reads `env.foundryMode` and shows a padlock "Live mutations disabled" when not live. `EvidenceChip.tsx` is a reusable dotted-underline value that opens a popover with the evidence kind, id, value+unit, and provenance. `ResultsStage.tsx` renders each candidate as three stacked bands (MEASURED slate/mono, DETERMINISTIC QC teal/badges, MODEL COMMENTARY violet/prose) — color **plus** icon **plus** text label on every badge. `ApprovalStage.tsx` shows the payload, the hash chip, `Create draft — no lab action, no charge` (enabled) vs `Confirm & submit to lab` (disabled padlock), and on a payload edit shows a diff + changed hash + red `INVALIDATED` banner. `DraftStage.tsx` renders draft blocks; if `draft.ok === false` it renders the offending claim as a red `Claim blocked: no evidence` block and disables copy/mark-ready.

Wire `page.tsx` to hold client state for the active stage and call the server actions. Keep styling in `globals.css` with the three-layer palette (`--measured`, `--qc`, `--commentary`) and AA-contrast checks.

- [ ] **Step 5: Manually verify the workspace boots**

Run: `npm run demo`
Expected: dev server starts; the workspace renders with the MOCK badge and stepper; pasting the demo request + FASTA fixture advances through the stages. (Automated coverage lands in Task 15.)

- [ ] **Step 6: Commit**

```bash
git add src/app src/components src/infrastructure/logging
git commit -m "feat(presentation): workspace shell, stages, evidence chips, webhook route"
```

---

## Task 15: Playwright end-to-end demo path (FOUND-001..007 acceptance)

**Files:**
- Create: `playwright.config.ts`, `e2e/demo.spec.ts`
- Create: `fixtures/demo.fasta` (written from `demoFasta`)

**Interfaces:**
- Consumes: the running dev server (`npm run demo`).
- Produces: an e2e spec covering scenes 2–7 including one over-budget block, one target ambiguity, one duplicate-webhook, and the fail-closed draft.

- [ ] **Step 1: Write the failing e2e spec**

```ts
// e2e/demo.spec.ts
import { test, expect } from '@playwright/test'

test('happy path with safety beats', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('env-badge')).toHaveText(/MOCK/)
  await page.getByTestId('request-input').fill('Prepare a BLI screening against EGFR under $8000; do not submit without approval.')
  await page.getByTestId('fasta-input').setInputFiles('fixtures/demo.fasta')
  await page.getByTestId('run-intake').click()

  await expect(page.getByTestId('finding-INVALID_RESIDUE')).toBeVisible()
  await expect(page.getByTestId('finding-DUPLICATE_SEQUENCE')).toBeVisible()
  await expect(page.getByTestId('over-budget')).toBeVisible()

  await expect(page.getByTestId('confirm-submit')).toBeDisabled()
  await page.getByTestId('create-draft').click()
  await expect(page.getByTestId('hash-chip')).toBeVisible()

  await page.getByTestId('goto-results').click()
  await expect(page.getByTestId('layer-measured-AC-1')).toBeVisible()
  await expect(page.getByTestId('layer-qc-AC-4')).toContainText(/inconsistent/i)
  await page.getByTestId('generate-draft').click()
  await expect(page.getByTestId('evidence-chip').first()).toBeVisible()
})
```

- [ ] **Step 2: Create `playwright.config.ts` and the fixture file**

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://127.0.0.1:3000' },
  webServer: { command: 'npm run demo', url: 'http://127.0.0.1:3000', reuseExistingServer: true, timeout: 120000 },
})
```

Write `fixtures/demo.fasta` with the exact `demoFasta` contents from Task 11.

- [ ] **Step 3: Install Playwright browsers**

Run: `npx playwright install chromium`
Expected: chromium downloaded.

- [ ] **Step 4: Run the e2e spec**

Run: `npm run test:e2e`
Expected: PASS. (Add the `data-testid` attributes to the Task 14 components as needed to satisfy the selectors — adjust components, not the assertions.)

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts e2e fixtures/demo.fasta
git commit -m "test(e2e): Playwright demo path covering scenes 2-7 and safety beats"
```

---

## Task 16: Golden/adversarial eval registry and gate meta-test

**Files:**
- Create: `tests/evals/registry.ts`, `tests/evals/adversarial.test.ts`
- Test: `tests/evals/gate.test.ts`

**Interfaces:**
- Produces: an array `EVAL_CASES` where each case has `{ id, layer, adversarial: boolean, run: () => void | Promise<void> }`; a meta-test asserting `EVAL_CASES.filter(c => c.adversarial).length >= 10`.

- [ ] **Step 1: Write the failing gate meta-test**

```ts
// tests/evals/gate.test.ts
import { describe, it, expect } from 'vitest'
import { EVAL_CASES } from './registry'

describe('eval gate', () => {
  it('has at least 10 adversarial cases', () => {
    expect(EVAL_CASES.filter(c => c.adversarial).length).toBeGreaterThanOrEqual(10)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evals/gate.test.ts`
Expected: FAIL — registry not found.

- [ ] **Step 3: Create `tests/evals/registry.ts`**

Register the 15 adversarial cases from the spec (INTK-02, TGT-02, TGT-03, PRE-01, PRE-02, COST-01, HASH-02, WH-01, WH-02, WH-03, QC-02, QC-04, EVID-02, INJ-01, INJ-02) plus the happy cases, each `run` calling the corresponding domain/application function and asserting with `assert` from `node:assert/strict`. Example entries:

```ts
import assert from 'node:assert/strict'
import { resolveTarget } from '@/domain/target/resolve'
import { validateCustomerDraft } from '@/domain/comms/validate'
import { demoTargets } from '../../fixtures/targets'

export type EvalCase = { id: string; layer: string; adversarial: boolean; run: () => void | Promise<void> }

export const EVAL_CASES: EvalCase[] = [
  { id: 'TGT-02', layer: 'target-resolution', adversarial: true, run: () => {
      assert.equal(resolveTarget('EGFR', demoTargets).status, 'ambiguous') } },
  { id: 'EVID-02', layer: 'evidence-faithfulness', adversarial: true, run: () => {
      const bundle = { experimentId: 'e', summaryStats: {}, records: [] }
      const draft = { bodyBlocks: [{ text: 'KD 2.0 nM.', claimType: 'confirmed' as const, numericClaims: [{ value: 2.0, unit: 'nM', evidenceId: 'ev_missing' }] }], unresolvedClaims: [], generatedBy: { adapter: 's', model: 's', promptHash: 'x' }, status: 'draft' as const }
      assert.equal(validateCustomerDraft(draft, bundle).ok, false) } },
  // ... remaining 13 adversarial cases + happy cases, one entry each
]
```

- [ ] **Step 4: Create `tests/evals/adversarial.test.ts` that executes every registered case**

```ts
import { describe, it } from 'vitest'
import { EVAL_CASES } from './registry'
describe('golden/adversarial suite', () => {
  for (const c of EVAL_CASES) it(`${c.id} [${c.layer}]`, async () => { await c.run() })
})
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/evals`
Expected: PASS — gate green, every case green.

- [ ] **Step 6: Commit**

```bash
git add tests/evals
git commit -m "test(evals): golden/adversarial registry + >=10 adversarial gate meta-test"
```

---

## Task 17: Secret hygiene, demo runbook, and green-gate verification

**Files:**
- Create: `README.md` demo section, `docs/DEMO_RUNBOOK.md`, `.gitleaks.toml` (optional), `scripts/check-client-bundle.mjs`
- Modify: `package.json` scripts

**Interfaces:**
- Produces: a `demo-ready` composite check.

- [ ] **Step 1: Create `scripts/check-client-bundle.mjs`** — greps `.next/static` for `GEMINI_API_KEY`/`FOUNDRY_TOKEN` patterns and exits non-zero on a hit.

```js
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
const ROOT = '.next/static'
const PATTERNS = [/AIza[0-9A-Za-z_\-]{20,}/, /FOUNDRY_TOKEN/, /GEMINI_API_KEY/]
function walk(dir) { for (const e of readdirSync(dir)) { const p = join(dir, e); statSync(p).isDirectory() ? walk(p) : scan(p) } }
function scan(p) { const t = readFileSync(p, 'utf8'); for (const re of PATTERNS) if (re.test(t)) { console.error(`Secret pattern in ${p}`); process.exit(1) } }
try { walk(ROOT) } catch { /* no build yet */ }
console.log('client bundle clean')
```

- [ ] **Step 2: Add scripts to `package.json`**

```json
"verify": "npm run typecheck && npm run test && npm run build && node scripts/check-client-bundle.mjs",
"demo-ready": "npm run verify && npm run test:e2e"
```

- [ ] **Step 3: Write `docs/DEMO_RUNBOOK.md`** — the 4:50 scene-by-scene script from the spec (§11 UX), the exact request text, the fixture file, and the reset command (`rm -f data/foundryops.db`).

- [ ] **Step 4: Run the full gate**

Run: `npm run verify`
Expected: typecheck clean, all Vitest suites green, `next build` succeeds, client bundle clean.

Run: `npm run test:e2e`
Expected: the demo path passes from a clean checkout.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/DEMO_RUNBOOK.md scripts package.json
git commit -m "chore: secret-hygiene client-bundle check, demo runbook, demo-ready gate"
```

---

## Task 18 (stretch): GeminiLlmAdapter + transcript replay parity (FOUND-008)

**Files:**
- Create: `src/adapters/llm/gemini.ts`, `fixtures/transcripts/intent.json`, `fixtures/transcripts/draft.json`
- Test: `src/adapters/llm/gemini-parity.test.ts`

**Interfaces:**
- Consumes: `@google/genai` (dynamic import), `LlmClient`.
- Produces: `GeminiLlmAdapter` implementing `LlmClient` using `gemini-3.6-flash` with a Zod-validated structured-output schema; a `replayTranscript` mode that reads recorded JSON and validates it against the same schema. Verify the exact `@google/genai` API surface and model id at implementation time (RESEARCH_NOTES protocol).

- [ ] **Step 1: Write the failing offline parity test**

```ts
// src/adapters/llm/gemini-parity.test.ts
import { describe, it, expect } from 'vitest'
import { ExperimentIntentSchema } from '@/domain/schemas'
import intentTranscript from '../../../fixtures/transcripts/intent.json'

describe('gemini transcript parity (offline replay)', () => {
  it('recorded intent transcript validates against the intent schema', () => {
    expect(() => ExperimentIntentSchema.parse(intentTranscript)).not.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/adapters/llm/gemini-parity.test.ts`
Expected: FAIL — transcript fixture missing.

- [ ] **Step 3: Add `fixtures/transcripts/intent.json`** (a recorded, schema-valid `ExperimentIntent`) and `draft.json` (a recorded `CustomerDraft`). Install the dependency: `npm install @google/genai`.

- [ ] **Step 4: Create `src/adapters/llm/gemini.ts`**

```ts
import type { LlmClient } from '@/application/ports'
import { ExperimentIntentSchema, CustomerDraftSchema, type EvidenceBundle } from '@/domain/schemas'
import { env } from '@/infrastructure/config/env'

export class GeminiLlmAdapter implements LlmClient {
  async extractIntent({ requestText }: { requestText: string }) {
    if (!env.geminiApiKey) return { ok: false as const, error: 'GEMINI_API_KEY missing' }
    const { GoogleGenAI } = await import('@google/genai')
    const ai = new GoogleGenAI({ apiKey: env.geminiApiKey })
    const res = await ai.models.generateContent({ model: 'gemini-3.6-flash',
      contents: `Extract a BLI affinity experiment intent as JSON. Never invent absent fields.\n\n${requestText}`,
      config: { responseMimeType: 'application/json' } })
    const parsed = ExperimentIntentSchema.safeParse(JSON.parse(res.text ?? '{}'))
    return parsed.success ? { ok: true as const, intent: parsed.data } : { ok: false as const, error: parsed.error.message }
  }
  async draftCustomerUpdate({ evidenceBundle }: { evidenceBundle: EvidenceBundle }) {
    if (!env.geminiApiKey) return { ok: false as const, error: 'GEMINI_API_KEY missing' }
    const { GoogleGenAI } = await import('@google/genai')
    const ai = new GoogleGenAI({ apiKey: env.geminiApiKey })
    const res = await ai.models.generateContent({ model: 'gemini-3.6-flash',
      contents: `Draft a customer update as JSON. Only cite values present in this evidence bundle; tag every number with its evidenceId.\n\n${JSON.stringify(evidenceBundle)}`,
      config: { responseMimeType: 'application/json' } })
    const parsed = CustomerDraftSchema.safeParse(JSON.parse(res.text ?? '{}'))
    return parsed.success ? { ok: true as const, draft: parsed.data } : { ok: false as const, error: parsed.error.message }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/adapters/llm/gemini-parity.test.ts`
Expected: PASS. (The live Gemini call is exercised only under a manual, non-blocking `gemini-live` run, never in CI.)

- [ ] **Step 6: Commit**

```bash
git add src/adapters/llm/gemini.ts fixtures/transcripts package.json package-lock.json
git commit -m "feat(adapters): opt-in GeminiLlmAdapter + offline transcript-parity eval"
```

---

## Self-Review

**1. Spec coverage:**
- Scope + cuts → Tasks 3, 11 fixtures, runbook (Task 17). ✓
- Domain model → Task 1 schemas. ✓
- Canonical hash (ADR-0003) → Task 5. ✓
- Approval lifecycle + transactional consume → Tasks 6, 12, 13. ✓
- Webhook verify/rank/dedup (ADR-0005) → Tasks 7, 12, 13. ✓
- QC thresholds v1 → Task 8. ✓
- Evidence bundle + fail-closed validator (ADR-0004) → Tasks 9, 10. ✓
- Foundry adapter + mock; LLM deterministic + Gemini → Tasks 11, 18. ✓
- UX three-layer + trust cues + error states → Tasks 14, 15. ✓
- Tests/evals + release gate → Tasks 15, 16, 17. ✓
- Secrets/no-network/fallback → Tasks 0 (network guard, env), 17 (bundle grep). ✓
- Vertical slices FOUND-001..008 → Tasks map: 001→2-3/11/13, 002→3, 003→4/11, 004→5-6/12-13, 005→7/12-13, 006→8-9, 007→10/13, 008→18. ✓

**2. Placeholder scan:** No "TBD"/"add error handling"/"write tests for the above" — every code step shows code. Task 14 (UI) and Task 16 (registry remainder) describe components/cases to add; each has concrete examples and exact selectors/ids, and UI is validated by the Task 15 Playwright assertions rather than red-green unit tests (UI is not a behavior change).

**3. Type consistency:** `FoundryClient`/`LlmClient` signatures in Task 11 match their uses in Task 13; `hashDraftPayload` used consistently in Tasks 5/6/13; `classifyCandidate`/`buildEvidenceBundle`/`validateCustomerDraft` names stable across Tasks 8/9/10/13/16; `consumeApproval`/`insertWebhookDeliveryOnce` names stable across Tasks 12/13; cost numbers (250000/120000/800000 → 970000/730000/4) consistent across Tasks 4/11/13 and the spec.

---

*Plan derived from `docs/superpowers/specs/2026-07-22-foundryops-mvp-design.md`. ADRs 0001–0005 should be written to `docs/adr/` as their decisions are first implemented (Tasks 1/5/7/10/11).*
