# FoundryOps MVP — Design specification (Revision R2)

- **Status:** proposed — R2 correction pass awaiting review
- **Date:** 2026-07-22
- **Owner:** Fernando
- **Process authority:** `superpowers:brainstorming` (written-spec gate)
- **R2 basis:** current official Adaptyv Foundry documentation (`docs.adaptyvbio.com/api-reference`, OpenAPI `foundry-api-public.adaptyvbio.com/api/v1/openapi.json`, api version `0.0.2`) plus the user's mandatory correction list. The R2 change log is §21.

Statements are labelled **[C]** confirmed (locked by the user, the product docs, or verified Foundry docs), **[A]** assumption, **[R]** recommendation, **[Q]** open question.

---

## 1. Mission and MVP statement

FoundryOps is the safe operational layer around the Adaptyv Foundry API. The MVP delivers **one reproducible vertical story**, recorded end-to-end offline in mock mode: an operator pastes an unstructured **BLI affinity characterization** request against EGFR and uploads a FASTA, and FoundryOps produces a validated, budget-aware Foundry draft behind a human approval gate, monitors experiment updates, runs deterministic results QC, and drafts an evidence-backed customer update — never inventing a measurement, never performing an unapproved mutation, and never letting the model write a numeric value into customer prose.

**Thesis the demo proves:** the model interprets ambiguity; deterministic software enforces truth, permissions, numbers, and state.

## 2. Locked decisions

| Area | Decision |
|---|---|
| **Experiment type** [C] | Single type end-to-end: **affinity characterization via BLI vs EGFR** (`experiment_type=affinity`, `method=bli`). 8 uploaded candidates; only **AC-1..AC-4** enter the approved draft and results after preflight + budget remediation. A light extension seam only — no generic N-type architecture. |
| **Request wording** [C] | Everywhere the phrase is **"BLI affinity characterization"**, never "BLI screening". |
| **Vertical path** [C] | request text → FASTA preflight → target resolution (ambiguity blocks) → cost estimate (over-budget blocks) → candidate remediation → approval → idempotent mock draft → official signed **experiment_update** replay → results QC → evidence-backed customer draft. |
| **Stack** [C] | Next.js App Router + React + Node + TypeScript strict + Zod + Drizzle/SQLite + Vitest + Playwright. No Python backend. `@google/genai` only inside the (stretch) Gemini adapter. |
| **Layering** [C] | `domain/ · application/ · adapters/ · infrastructure/ · presentation(src/app + src/components)`. Next.js route handlers and server actions only adapt UI to application services; domain logic never lives in Next.js. |
| **LLM** [C] | Provider-neutral typed `LlmClient`. MVP default: **DeterministicLlmAdapter** (`LLM_PROVIDER=stub`, keyed by the exact demo request). **GeminiLlmAdapter** (`gemini-3.6-flash`, `@google/genai`, structured-output schema) is **STRETCH**, opt-in. LLM only (a) proposes a `RawExtractedIntent` and (b) composes customer-draft **segments that reference evidence**. It never writes numeric values into prose, validates sequences, computes metrics, resolves approval policy, decides state transitions, or invents values. **No raw residues ever reach the LLM.** |
| **Foundry** [C] | `FoundryClient` interface. **MockFoundryClient** is the only client exercised in the Loom. For the real client the MVP delivers a **pinned OpenAPI snapshot + Zod contract schemas + mapper tests** for the four used operations; **executable live HTTP calls are STRETCH**. Live ops require `FOUNDRY_MODE=live` + server token + separate explicit confirmation + a still-valid approval. |
| **Persistence** [C] | SQLite via Drizzle behind repositories, including mock draft operations and deterministic IDs. Postgres future-only. |
| **Runtime posture** [C] | Single-user local; offline/mock by default; no public webhook endpoint (local signed-fixture replay only); timebox 12–16 focused hours. |

## 3. Realistic scope — MUST / SHOULD / STRETCH

**MUST (the recorded demo depends on all of these):**
- Slices 0–4 (see §17): executable shell + canonical fixtures; intake + preflight + target/budget remediation UI; approval + idempotent mock draft UI; official signed `experiment_update` replay + timeline/audit; results QC + EvidenceBundle + evidence-backed customer draft + three-layer UI.
- Deterministic offline run with `LLM_PROVIDER=stub` + `MockFoundryClient` from a clean checkout.
- Real demo gates: target ambiguity blocks; over-budget blocks; candidate remediation before approval; only AC-1..AC-4 in the approved draft/results; payload edit invalidates approval.
- Renderer-inserted numbers: the LLM never emits a numeric value into prose; every number in the draft comes from `EvidenceBundle`.
- Playwright happy path (§11 flow) and the core evals (§14).

**SHOULD:**
- `FoundryHttpClient` contract layer: pinned OpenAPI snapshot + Zod contract schemas + mapper tests for the four used operations (no live network).
- The full 8–10-case adversarial eval set and the audit-drawer polish.
- README + `docs/DEMO_RUNBOOK.md` and secret-hygiene gate.

**STRETCH (explicitly out of the acceptance criteria):**
- Executable live `FoundryHttpClient` HTTP calls; opt-in sandbox contract smoke test.
- `GeminiLlmAdapter` real calls + offline transcript-parity eval.

### Deliberate cuts
- **CSV is out of MVP scope.** Input is **request text + FASTA only**; budget, concentrations, and replicates are extracted from the request text (and may be unresolved — see §9). No CSV parser, fixture, or UI path.
- **No public webhook route.** HMAC verification + dedup + transition checks run behind a local "replay signed update" control over signed fixtures.
- **No generic N-type framework, no PDF/export, no charting beyond tables + at most one inline sparkline, no email/Slack send, no multi-user auth.**

## 4. Architecture options considered

The stack is user-locked; recorded here for the ≥2-alternative requirement. **A — TypeScript full-stack (chosen):** best product-quality-per-hour for the demo; one language; Zod gives runtime-validated typed contracts at every boundary; domain stays framework-independent. **B — Python full-stack (FastAPI + server-rendered UI):** SDK affinity is irrelevant to a mock-only Loom; UI polish cost too high in the timebox. **C — React + FastAPI split:** two runtimes/type systems, integration tax with no demo benefit. → **ADR-0001.**

## 5. Module and layer architecture

```
src/
  domain/
    schemas/index.ts        # Zod contracts + inferred types (single source)
    constants.ts            # cost model, Demo QC Policy v1, canonicalizer version, lifecycle enum + ranks
    sequence/fasta.ts       # parseFasta, normalizeResidues, sequenceHash
    intent/validate.ts      # validateIntent: RawExtractedIntent -> ValidatedAffinityIntent | block finding
    preflight/engine.ts     # runPreflight
    target/resolve.ts       # resolveTarget (ambiguity blocks)
    cost/budget.ts          # applyBudget (no Infinity)
    payload/canonical.ts    # canonicalizeDraftPayload, hashDraftPayload (compile-time exhaustive classification, code-unit ordering)
    approval/rules.ts       # approvalStatusFor (hash + version + requestId + operation + env + expiry)
    webhook/verify.ts       # verifyUpdateSignature (sha256=<hex>, constant-time)
    webhook/transition.ts   # decideTransition over the official lifecycle
    results/qc.ts           # classifyCandidate (Demo QC Policy v1)
    evidence/bundle.ts      # buildEvidenceBundle (numeric + categorical records), resolveEvidence
    comms/compose.ts        # validateCustomerDraft (fail-closed) + renderCustomerDraft (inserts values)
  application/
    ports.ts                # FoundryClient, LlmClient, repository interfaces
    intake.ts estimate.ts approval.ts createDraft.ts
    ingestUpdate.ts reviewResults.ts draftComms.ts
  adapters/
    foundry/mock.ts         # MockFoundryClient (deterministic, SQLite-backed drafts)
    foundry/contract/       # pinned openapi.snapshot.json + Zod contract schemas + mappers (SHOULD)
    foundry/http.ts         # FoundryHttpClient (STRETCH, executable calls)
    foundry/factory.ts
    llm/deterministic.ts    # DeterministicLlmAdapter (keyed by request)
    llm/gemini.ts           # GeminiLlmAdapter (STRETCH)
    llm/factory.ts
  infrastructure/
    db/schema.ts db/client.ts
    repositories/*.ts       # requests, approvals, draftOperations, updateLog, eventLog
    crypto/hash.ts crypto/hmac.ts
    config/env.ts config/network-guard.ts
    logging/logger.ts
  app/                      # Next.js App Router (thin) — no public webhook route
  components/               # React presentation (three-layer UI)
fixtures/  tests/  e2e/
```

Concern → home: **validation** = `domain/preflight` + `domain/intent` + Zod boundaries · **QC arithmetic** = `domain/results/qc` · **evidence resolution + rendering** = `domain/evidence` + `domain/comms` · **authorization** = `domain/approval` (pure) enforced in `application/createDraft` · **canonical hashing** = `domain/payload` + `infrastructure/crypto` · **adapters** = `adapters/*` · **repositories** = `infrastructure/repositories`.

## 6. Domain model

Class legend: **M** measured/external, **D** deterministic-derived, **X** model-authored (re-validated). Money is integer minor units (cents) throughout.

| Type | Key fields (class) | Notes |
|---|---|---|
| `RawExtractedIntent` | `experimentType: string` (X), `method: string` (X), `targetQuery: string|null` (X), `requestedCount: number|null` (X), `concentrations: number[]|null` (X), `replicates: number|null` (X), `budget: Money|null` (X), `fields: ExtractedField[]`, `ambiguities[]` | **Permissive** — an unsupported `experimentType`/`method` (e.g. screening, expression) is *representable*, not a schema error. **No `approvalRequired` field.** |
| `ValidatedAffinityIntent` | `experimentType: 'affinity'` (D), `method: 'bli'` (D), `targetQuery`, `requestedCount`, `concentrations: number[]` (D, defaulted), `replicates: number` (D, defaulted), `budget: Money|null`, `approvalRequired: true` (D, **policy**), `assayDefaultsApplied: boolean` (D), `fields`, `ambiguities` | Product of `validateIntent`. `approvalRequired` is deterministic policy. |
| `ExtractedField` | `name`, `value` (X), `confidence` (X), `sourceSpan|null` (X) | Absent required fields → `ambiguities`, never invented. |
| `Sequence` | `id` (D), `rawHeader` (M, untrusted), `residues` (D), `chains[]` (D), `length` (D), `normHash` (D), `sourceLoc` (D) | Never sent to the LLM. |
| `SequenceSet` | `sequences[]`, `acceptedIds[]` (D), `rejectedIds[]` (D) | |
| `PreflightFinding` | `code` (enum), `severity`, `message` (D-template), `evidenceLocation`, `remediation`, `blocksProgression` (D), `duplicateOf?` | Deterministic templates, not model text. Includes `UNSUPPORTED_EXPERIMENT_TYPE`. |
| `Target` | `foundryTargetId`, `name`, `aliases[]`, `organism`, `uniprotId` (M) | From `GET /api/v1/targets`. |
| `TargetResolution` | `query`, `chosen: Target|null` (D), `alternatives[]` (M), `status: 'resolved'|'ambiguous'|'missing'` (D) | `ambiguous`/`missing` block. |
| `CostEstimate` | `foundryQuoteRef` (M), `lineItems[]` (M), `totalMinor` (M), `currency` (M), `withinBudget` (D), `overageMinor` (D), `maxWithinBudget: number|null` (D) | From `POST /experiments/cost-estimate`. `maxWithinBudget` is `null` when no budget (**never `Infinity`**). |
| `DraftPayload` | `method`, `experimentType`, `targetId`, `sequences[]` (accepted), `concentrations`, `replicates`, `costTotalMinor`, `currency`, `environment`, `operation`, `canonicalizerVersion` (semantic); `version`, `costEstimateRef?`, `requestId?`, `canonicalHash?`, `createdAt?` (volatile) | Field classification is compile-time exhaustive (§7c). |
| `Approval` | `id`, `operation`, `payloadHash`, `payloadVersion`, `requestId`, `actor`, `issuedAt`, `expiresAt`, `environment`, `costSnapshotMinor`, `status` | All D. Binds requestId + operation + environment + payloadVersion + payloadHash. |
| `FoundryUpdate` | `deliveryId` (M, dedup key), `event: 'experiment_update'` (M), `timestamp` (M), `apiVersion` (M), `signatureVerified` (D), `data: { experimentId, updateType, status: ExperimentStatus, title, content }` (M) | **Update** message; the experiment **status** is a separate derived mirror (§7a). |
| `Measurement` | `candidateId`, `concentrationM` (M), `replicateIndex` (M), `responseValue` (M) | Multi-concentration series populated in fixtures. |
| `ResultRecord` | `experimentId`, `candidateId`, `replicateKdsM: number[]|null` (M), `konPerMs: number|null` (M), `koffPerS: number|null` (M), `kdMeanM: number|null` (M), `rmseMaxSignalPct: number|null` (M), `fitQualityReported: 'good'|'medium'|'poor'|null` (M), `controlOutcome: 'pass'|'fail'|'na'` (M), `measurements: Measurement[]` (M) | Documented BLI fields; **no R2, no MAE, no expression flag.** |
| `QCResult` | `candidateId`, `qcStatus: 'pass'|'fail'` (D), `bindingClass` (D), `affinity{kdM,ciLowM,ciHighM}` (D), `replicateConsistency{cv,consistent}` (D), `fitQuality{rmseMaxSignalPct,reported,pass}` (D), `controlOutcome` (D), `recommendation` (D), `appliedThresholds: 'demo-qc-policy@v1'` (D), `warnings[]` (D) | `bindingClass ∈ {confirmed_binder, apparent_binder_poor_fit, no_detectable_binding, inconclusive_replicate_inconsistent, non_binder}`. |
| `EvidenceRecord` | `id` (stable), `kind: 'measurement'|'qc_calculation'|'control'|'threshold'|'classification'|'approved_recommendation'`, `valueKind: 'numeric'|'categorical'`, `numericValue: number|null`, `unit: string|null`, `categoricalValue: string|null`, `displayLabel`, `sourceRef`, `provenanceChain` | Supports numeric **and** categorical evidence so recommendations/classes are also cited. |
| `EvidenceBundle` | `experimentId`, `records: EvidenceRecord[]`, `summaryStats` (D) | The only object the drafting LLM sees. No residues. |
| `CustomerDraftSegment` | `{ kind: 'text', text }` **(no digits allowed)** or `{ kind: 'evidence', evidenceId, claimType, prefix, suffix }` | The LLM chooses which evidence to cite and the connecting words; the **renderer inserts the value**. |
| `CustomerDraft` | `segments: CustomerDraftSegment[]` (X, structure), `generatedBy{adapter,model,promptHash}`, `status: 'draft'` | Rendered by `renderCustomerDraft` after `validateCustomerDraft` passes. |

## 7. State machines

### 7a. Request lifecycle vs Foundry experiment status (modelled separately)

**Internal request lifecycle** (our workflow state): `INTAKE → INTENT_VALIDATED → PREFLIGHT_PASSED → TARGET_RESOLVED → ESTIMATED → REMEDIATED → READY_FOR_APPROVAL → APPROVED → DRAFT_CREATED → MONITORING → RESULTS_AVAILABLE → REVIEWED → COMMS_DRAFTED`. A payload edit in `ESTIMATED..APPROVED` returns to `ESTIMATED` (or `PREFLIGHT_PASSED` if sequences change) and **invalidates any approval**. `READY_FOR_APPROVAL` is a **persisted gate**: an `Approval` may only be issued/consumed when the request row is in this state.

**Foundry experiment status** (mirrored from verified `experiment_update` messages, **separate** from the update stream): official lifecycle with ranks —

| Status | Rank |
|---|---|
| `Draft` | 1 |
| `WaitingForConfirmation` | 2 |
| `QuoteSent` | 3 |
| `WaitingForMaterials` | 4 |
| `InQueue` | 5 |
| `InProduction` | 6 |
| `DataAnalysis` | 7 |
| `InReview` | 8 |
| `Done` | 9 |
| `Canceled` | terminal (applies from any non-terminal) |

Updates are stored append-only in `updateLog`; the current experiment status is **derived** by taking the max applied rank. `decideTransition`: apply only when incoming rank > current rank (or incoming is `Canceled`); equal/lower rank = ignored no-op (duplicate/stale), logged distinctly. `Done`/`Canceled` are terminal. A verified update for an unknown experiment does not create one. **[Q]** exact wire casing of the status enum and the exact `data` sub-schema are confirmed from the pinned OpenAPI snapshot; a mapper converts wire → the domain enum above.

### 7b. Approval lifecycle

`VALID (issued in READY_FOR_APPROVAL)` → **`CONSUMED`** (bound op executes once) · **`EXPIRED`** (`now > expiresAt`, checked at consume time against an injectable clock) · **`INVALIDATED`** (any of payloadHash, payloadVersion, operation, environment, or requestId no longer matches).

### 7c. Canonical payload hash → ADR-0003

`canonicalHash = sha256(canonicalize(DraftPayload))`. `canonicalize`:
- Field classification is **compile-time exhaustive**: a `Record<keyof DraftPayload, 'semantic'|'volatile'>` map means adding a `DraftPayload` field without classifying it is a TypeScript error; a runtime guard is retained as defense-in-depth.
- **Semantic** fields hashed: `method, experimentType, targetId, sequences(id+residues), concentrations, replicates, costTotalMinor, currency, environment, operation, canonicalizerVersion`. **Volatile** excluded: `version, costEstimateRef, requestId, canonicalHash, createdAt`.
- Money must be integer (throws otherwise). Sequences sorted by id and concentrations sorted using a **code-unit comparator** (`a < b ? -1 : a > b ? 1 : 0`), **never `localeCompare`** (locale-independent). Strings NFC-normalized. `null` vs absent explicit.

At consume time recompute and compare to `approval.payloadHash`; mismatch → reject. Because `environment` and `operation` are hashed, a mock/create_draft approval can never authorize a live/confirm mutation. `payloadVersion` is compared **separately** (it is volatile and not in the hash) so a re-serialized-but-identical payload with a bumped version is caught. `canonicalizerVersion` guards against a future canonicalizer changing meanings.

## 8. Adapter contracts

### FoundryClient (four used operations + status/updates)

```ts
interface FoundryClient {
  searchTargets(q: { query: string }): Promise<Target[]>                       // GET /api/v1/targets
  estimateCost(input: { acceptedCount: number; budgetMinor: number | null }): Promise<CostEstimate> // POST /experiments/cost-estimate
  createDraft(input: DraftPayload, opts: { operationKey: string }): Promise<{ experimentId: string; draftId: string }> // POST /experiments (Draft)
  getResults(experimentId: string): Promise<ResultRecord[]>                    // GET /experiments/{id}/results
}
```

- **Idempotency:** `operationKey = requestId + '::' + operation + '::' + payloadHash`. The MVP does **not** assume Foundry supports an `Idempotency-Key` header (not present in the pinned OpenAPI). In mock mode, `createDraft` persists the draft operation and a **deterministic id** (`exp_${sha256(operationKey).slice(0,10)}`) in SQLite behind a unique index on `operationKey`; a repeat returns the stored row. Live idempotency behavior is **[Q]** and deferred to the stretch HTTP client.
- **Real client:** the MVP delivers `adapters/foundry/contract/` — a pinned `openapi.snapshot.json` (api version `0.0.2`, hash recorded) + Zod contract schemas + mapper tests validating our domain mapping for the four operations. Executable HTTP is STRETCH. → **ADR-0004.**

### LlmClient

```ts
interface LlmClient {
  extractIntent(input: { requestText: string }): Promise<{ ok: true; raw: RawExtractedIntent } | { ok: false; error: string }>
  draftCustomerUpdate(input: { evidenceBundle: EvidenceBundle }): Promise<{ ok: true; draft: CustomerDraft } | { ok: false; error: string }>
}
```

`DeterministicLlmAdapter` is **keyed by the exact demo request** (`sha256(normalize(requestText))` lookup); an unrecognized request yields a low-confidence `RawExtractedIntent` with nulls + an `unrecognized_request` ambiguity, never a fabricated intent. `GeminiLlmAdapter` (STRETCH) uses a structured-output schema and wraps `JSON.parse` in try/catch, returning `ok:false` on malformed output. No residues cross this boundary. → **ADR-0002.**

## 9. LLM boundary vs deterministic boundary

**The LLM may only:** (a) propose a `RawExtractedIntent` from request text; (b) compose `CustomerDraft` **segments** that reference evidence. **It may never:** validate sequences, compute metrics, resolve approval policy, decide transitions, invent values, execute Foundry ops, or **write a numeric value into prose**.

**Intent (P0.4):** `validateIntent(raw)` maps `RawExtractedIntent → ValidatedAffinityIntent` or returns a deterministic block finding. Unsupported `experimentType`/`method` (screening, expression) are representable in `RawExtractedIntent` and produce `UNSUPPORTED_EXPERIMENT_TYPE` (error, blocks) rather than a schema-parse crash. `concentrations`/`replicates` may be `null`; when null, deterministic assay defaults are applied and `assayDefaultsApplied=true` is surfaced as derived (not measured). `approvalRequired` is set to `true` by policy, not by the model.

**Evidence-segment composition (P0.3):** `CustomerDraft.segments` are either plain `text` (must contain **no digits** — enforced) or `evidence` references. `renderCustomerDraft(draft, bundle)` resolves each evidence segment and **inserts** the value (`numericValue + unit`, or the categorical `displayLabel`) from `EvidenceBundle`. Categorical claims and recommendations reference `classification`/`approved_recommendation` evidence records, so *every* claim — numeric or categorical — is evidence-backed. `validateCustomerDraft` fails closed on: a `text` segment containing a digit (`TEXT_SEGMENT_HAS_NUMBER`), or an `evidence` segment whose id is absent from the bundle (`EVIDENCE_NOT_FOUND`). Rendering never happens unless validation passes.

## 10. Approval, idempotency, updates, replay, audit

- **Approval freshness (P0.5):** `createDraft` consumes a fully valid, non-expired approval bound to `requestId + operation + environment + payloadVersion + payloadHash`, and requires the request to be in the persisted `READY_FOR_APPROVAL` state.
- **Transaction honesty (P0.5):** in one SQLite transaction we (1) re-verify the approval, (2) conditionally consume it (`UPDATE ... WHERE id=? AND consumed=0`, assert 1 row), (3) insert the `draftOperations` row (unique `operationKey`, deterministic id), (4) advance the request to `DRAFT_CREATED`. In **mock** mode the deterministic id is computed locally, so no remote call participates. We do **not** claim a remote HTTP mutation is atomic with SQLite; the stretch HTTP client would POST after the local commit and reconcile the row status, which is explicitly non-atomic.
- **Idempotency:** unique index on `operationKey`; a repeat returns the existing draft.
- **Signed update replay (P0.1):** no public route. A local control replays signed `experiment_update` fixtures. `verifyUpdateSignature` parses `X-Adaptyv-Signature: sha256=<hex>`, strips the prefix, and constant-time compares against HMAC-SHA256 of the raw body with the webhook secret. Dedup by `X-Adaptyv-Delivery-Id` (unique index). Rank-based transition over the official lifecycle. Append-only `updateLog` records `accepted | duplicate | rejected_signature | rejected_transition | dead_letter`. Invalid signatures appear only in the audit view, never in the trusted timeline.
- **Audit trail:** append-only event/update logs plus the canonical payload + hash + cost + each state transition, sufficient to reconstruct which rule, model call, tool call, approval, and transition produced an outcome.

## 11. UX design

**One flowing workspace.** Persistent left **stepper** (the request lifecycle spine) + top bar with **environment badge (MOCK/SANDBOX/LIVE)**, a **"Live mutations disabled" padlock**, the run-identity + canonical-hash chip, and an **Audit** button (event + rejected-delivery counts). Two global overlays: an **Audit drawer** and the reusable **Evidence popover** (chip → provenance), used identically in results and draft.

**Stages mapped to scenes:** Intake (S2), Preflight + Target/Budget remediation (S3), Approval boundary (S4), Status/update timeline (S5), Results QC (S6), Customer draft (S7); shell + Audit carry S1/S8.

### 11a. Three-layer results (approved, retained)
Each of AC-1..AC-4 is a card with three bands, each with its own visual language (color **plus** icon **plus** label **plus** typography, legible in grayscale):
- **Layer A — MEASURED · read-only** (slate, monospace, lock icon): documented BLI fields — per-replicate `kd/kon/koff`, `kd_mean`, `kd_app` CI, `rmse_max_signal_pct`, reported `fit_quality`, control outcome, multi-concentration response series. No control edits; no model text.
- **Layer B — DETERMINISTIC QC** (teal, shield-check icon): `Demo QC Policy v1` badges — binding class, replicate consistency (CV), fit quality (`rmse_max_signal_pct` vs policy + reported quality), control, recommendation. Each badge is an evidence chip → popover shows the formula and the policy threshold.
- **Layer C — MODEL COMMENTARY · interpretation** (violet, prose italic, sparkle icon): the rendered customer-draft prose. Every number is renderer-inserted from evidence; if the model is unavailable, `Model commentary unavailable — deterministic results unaffected`.

The `Demo QC Policy v1` badge is explicit on the results screen so a viewer never mistakes the demo policy for Adaptyv production thresholds.

### 11b. Trust cues and real gates (P0.2)
- **Target ambiguity blocks:** the two EGFR constructs render as a required choice; `Continue` is disabled until one is picked.
- **Over-budget blocks:** the cost panel is red; `Continue`/`Request approval` disabled until remediated. Remediation = **deselect AC-7 and AC-8** (6 → 4 candidates), which brings the estimate within budget.
- **Candidate selection before approval:** target selected and AC-7/AC-8 deselected before the request reaches `READY_FOR_APPROVAL`; only AC-1..AC-4 enter the draft and results.
- **Approval boundary:** exact payload + hash chip; `Create draft — no lab action, no charge` (enabled) vs `Confirm & submit to lab` (present, padlocked). Editing the payload shows a diff + changed hash + red `INVALIDATED` banner; re-issuing mints a fresh approval.

### 11c. Critical blocked states
| State | On-screen treatment |
|---|---|
| Unsupported experiment type | Red `UNSUPPORTED_EXPERIMENT_TYPE: only affinity/BLI is supported in this MVP`; progression blocked. |
| Target ambiguous | Red required-choice card between the two EGFR constructs; Continue disabled. |
| Over budget | Red cost panel `Over budget by $1,700`; remediation `Deselect AC-7 and AC-8 to fit`; Continue disabled. |
| Malformed sequence | Preflight `INVALID_RESIDUE` error with evidence location; sequence excluded. |
| Duplicate sequence | `DUPLICATE_SEQUENCE` (`identical to AC-1`); collapsed once. |
| Invalidated approval | Red banner + diff + changed hash after any payload edit. |
| Invalid-signature update | Audit drawer only: `Rejected — invalid signature`; never in the trusted timeline. |
| Fail-closed draft | Offending segment replaced by red `Claim blocked: evidence missing`; copy/mark-ready disabled. |
| Model outage | Layer C: `Model commentary unavailable — deterministic results unaffected`. |

### 11d. Accessibility
Never color-only; AA-contrast on violet/teal; focusable stepper/chips/controls; `aria-expanded`/`aria-controls` on chips; polite live-region for timeline/dedupe, assertive for gates; dedupe shown as a persistent badge (reduced-motion safe).

### 11e. Visual exploration (Pencil) — deferred, minimal
At most two wireframes during planning: **MUST** the Results QC three-layer card; **SHOULD** the Approval boundary. Everything else builds directly from description.

## 12. Fixtures and QC policy

**Input:** request text + FASTA only (no CSV). Demo request (verbatim): *"Prepare a BLI affinity characterization against EGFR using the attached sequences, six-point concentration series in duplicate. Keep it below the customer budget of $8,000, flag anything suspicious, and do not submit without my approval."*

**Cost model (synthetic):** `totalMinor = 250000 + 120000 × acceptedCandidates`; budget `800000` (USD). Preflight rejects AC-5 (malformed) + AC-6 (duplicate of AC-1) → 6 accepted (AC-1,2,3,4,7,8) → estimate `970000` → **over budget by $1,700**. Remediation deselects AC-7 + AC-8 → 4 accepted → `730000` (within budget); `maxWithinBudget = 4`. Only **AC-1..AC-4** enter the draft and results.

**Candidate roles:**

| Candidate | Role | Resolves at | Documented-field values | QC outcome |
|---|---|---|---|---|
| AC-1 | Strong consistent binder | Results | kd [2.0, 2.1, 1.95] nM, kd_mean 2.02 nM, rmse_max_signal_pct 4.2%, fit_quality `good`, kon 3.1e5, koff 6.3e-4, control pass | `confirmed_binder`, follow_up |
| AC-2 | Poor-fit apparent binder | Results | kd [40, 44, 38] nM, kd_mean 40.7 nM, rmse_max_signal_pct 22.5%, fit_quality `poor`, control pass | `apparent_binder_poor_fit` (LOW_FIT), inconclusive |
| AC-3 | No detectable binding | Results | kd not determinable (null), response at control baseline, fit_quality `poor`/na, control pass | `no_detectable_binding`, drop |
| AC-4 | Contradictory replicates | Results | kd [5, 500] nM, CV 138.6%, control pass | `inconclusive_replicate_inconsistent` (REPLICATE_CV_EXCEEDED), inconclusive |
| AC-5 | Malformed sequence | Preflight | invalid residue → rejected |
| AC-6 | Duplicate of AC-1 | Preflight | byte-identical → collapsed once |
| AC-7, AC-8 | Filler valid binders | Cost remediation | deselected to fit budget; do not enter results |

Each of AC-1..AC-4 carries a **populated multi-concentration measurement series** (six concentrations 1e-7 … 4e-10 M × duplicate replicates) so the measured layer is concrete.

**Demo QC Policy v1** (`demo-qc-policy@v1`, labelled as a demo policy, **not** Adaptyv production thresholds): `fit.rmseMaxPct = 15`; `replicate.cvMax = 0.20` (`CV = sampleStdev(kd)/mean(kd)`); `binding.kdMaxBinderM = 1e-6`. Classification order: control fail **or** non-finite/negative kd **or** kd not determinable → `qcStatus=fail` / `no_detectable_binding` (reco drop); else CV > cvMax → `inconclusive_replicate_inconsistent`; else rmse_max_signal_pct > rmseMaxPct **or** reported fit_quality `poor` → `apparent_binder_poor_fit`; else kd_mean ≤ kdMaxBinderM → `confirmed_binder` (follow_up); else `non_binder`. Chosen so AC-1..AC-4 land with wide margins.

**The material intake ambiguity (retained):** target-construct ambiguity — `EGFR` resolves to two catalog constructs (human ECD vs ectodomain-Fc). One dropdown decision; stages the whole thesis (model surfaces → human decides → deterministic binds → approval hash locks).

## 13. Observability, logging, secrets

Structured logs over an **allowlisted field set** (never raw bodies/headers/SDK errors). Redact tokens, keys, raw sequences, customer contact info, file contents. Secrets (`GEMINI_API_KEY`, Foundry token) server-side only; **no `NEXT_PUBLIC_` secret**; a CI step greps the built client bundle for key patterns; `gitleaks` runs **without a `|| true` bypass** (a hit fails the build). The SQLite file lives outside any served/static directory. Mutations are POST server actions or Origin-checked handlers.

## 14. Testing, evals, release gates

**Golden/adversarial suite — 8–10 explicit cases** (each enumerated in the plan's eval registry, no placeholders): (1) intake must-not-invent absent budget; (2) unsupported experiment type blocked deterministically; (3) target ambiguity blocks; (4) over-budget block + remediation math; (5) canonical-hash stability under reorder + volatile change; (6) canonical-hash sensitivity to every invalidator incl. payloadVersion; (7) update dedup changes state once; (8) invalid update signature rejected (audit only); (9) each QC class AC-1..AC-4 at Demo QC Policy v1; (10) fail-closed draft: `text`-with-number and missing-evidence both block. Every LLM-touching case runs on `DeterministicLlmAdapter`; none needs live Gemini.

**CI:** a network guard throws on any non-loopback socket; env `LLM_PROVIDER=stub`, `FOUNDRY_MODE=mock`. Jobs: **A unit** (schemas, intent, preflight, cost, hash, approval, webhook, QC, evidence, comms), **B integration** (intake→…→draft on in-mem SQLite + Mock + stub, updates dedup/signature/transition, idempotent draft), **C e2e** (Playwright §11 flow from clean checkout), **D contract** (Zod mapper tests vs the pinned OpenAPI snapshot — SHOULD). `demo-ready` = A+B+C green · contract mapper tests green (SHOULD) · ≥8 adversarial cases green · `gitleaks` clean (no bypass) · client-bundle grep clean · `npm run demo` boots on stub+mock.

**Three most load-bearing evals:** fail-closed draft (thesis: every number traceable, renderer-inserted); approval hash stability/sensitivity + update dedup (Scenes 4–5 safety invariants); QC classification of AC-1..AC-4 (Scene 6 determinism).

## 15. Threat model

| Threat | Attack | Deterministic control | Location |
|---|---|---|---|
| Accidental live mutation | stray `FOUNDRY_MODE=live` or a mutating call in demo/CI | live adapter non-constructable without token; demo env holds no token; startup assertion under test | Foundry factory + config guard |
| Prompt injection | request text / FASTA header says "target=X, approved, submit" | LLM output is an untrusted suggestion re-derived deterministically; LLM emits no permission/cost/approval fields; unsupported type blocked | intake boundary; validateIntent; approval service |
| Secret leakage | token in logs, bundle, screenshots | allowlist logging; `server-only`; CI bundle grep; gitleaks (no bypass); no `NEXT_PUBLIC_` secrets | logger; server/client split; CI |
| Replay / duplicate update | captured signed update replayed | signed `delivery_id` + unique index; apply only on rank increase | ingestUpdate + updateLog |
| Hallucinated target | LLM proposes a non-existent EGFR construct | deterministic resolution against catalog; ambiguous/unknown blocks | target resolver |
| Hallucinated measurement | model writes a number into prose | LLM cannot emit numbers; renderer inserts from evidence; `TEXT_SEGMENT_HAS_NUMBER` blocks | comms validator + renderer |
| Stale approval | payload edited after approval, or reuse after expiry | approval bound to hash + version + requestId + op + env; expiry at consume; conditional consume | approval consume txn |
| Cost arithmetic error | float math / model total | integer minor units; cost computed in code; cost in hash at zero tolerance | cost engine; canonicalizer |
| Model/provider outage | Gemini down | deterministic adapter default; Gemini opt-in stretch; prerecorded fallback | LLM factory; storyboard |
| Malicious file content | XSS / oversized / bad residues | size caps; strict FASTA parse + residue allowlist; React escaping | upload parser; render layer |
| Dependency / deployment | vulnerable dep; SQLite served; debug endpoint | pinned lockfile + `npm audit` + gitleaks; DB outside served dir; no debug routes | CI; deployment config |

## 16. Deployment, secrets, no-network fallback

`npm run demo` boots the scripted demo in mock mode from a clean checkout — no credentials, no network — and is the acceptance baseline. An optional single container carries no live token and defaults to mock+stub. The deterministic adapter + mock client are the no-network fallback; a prerecorded Loom clip is kept if a hosted provider is unavailable.

## 17. Implementation slices (6 vertical, each leaves a runnable state)

| Slice | Deliverable | Runnable end state |
|---|---|---|
| **0** | Executable shell + canonical fixtures (scaffold, env, network guard, schemas/constants, FASTA/request/target/result/signed-update fixtures, pinned OpenAPI snapshot) | app boots to an empty workspace; schema + fixture tests green |
| **1** | Intake + preflight + target/budget remediation + UI (RawIntent→validate, keyed stub, preflight, resolve, budget, Mock search/estimate, intake UI with ambiguity + over-budget blocks + deselect) | paste → remediated, target-selected, AC-1..AC-4 selected, within budget |
| **2** | Approval + idempotent mock draft + UI (canonical hash, approval rules, repositories, READY_FOR_APPROVAL gate, createDraft txn, deterministic id, approval UI) | approve exact payload → deterministic mock draft; edit invalidates; reissue works |
| **3** | Official signed `experiment_update` replay + timeline/audit (verify, transition, ingestUpdate, signed fixtures, local replay, timeline + audit UI) | replay signed updates, dedupe once, invalid sig only in audit |
| **4** | Results QC + EvidenceBundle + customer draft + polished UI (classifyCandidate, evidence bundle, structured-segment draft, validate + render, three-layer UI) | review AC-1..AC-4; generate evidence-backed draft, all numbers renderer-inserted |
| **5** | Playwright + 8–10 evals + README + Loom hardening (full e2e, eval registry, contract mapper tests SHOULD, secret hygiene, runbook) | `demo-ready` gate green |
| Stretch | GeminiLlmAdapter (structured output + malformed-JSON catch) + factory branch + transcript parity; executable live FoundryHttpClient | opt-in, non-blocking |

## 18. ADRs to record (after this spec is approved)

| ADR | Decision | Alternative rejected |
|---|---|---|
| 0001 | Layered TS, framework-independent domain | Next.js-centric logic |
| 0002 | Narrow, deterministic-default LLM; RawExtractedIntent split from ValidatedAffinityIntent; segments not prose-numbers; Gemini stretch | LLM in the loop for QC/authorization; LLM writing numbers |
| 0003 | Canonical hash = approval binding; compile-time exhaustive classification; code-unit ordering; integer money; payloadVersion compared separately | random idempotency key; approval-by-id; localeCompare ordering |
| 0004 | Mock default; real client = pinned OpenAPI snapshot + contract schemas + mapper tests (live HTTP stretch); `operationKey` idempotency, no assumed `Idempotency-Key` | building against live; assuming provider idempotency |
| 0005 | Official webhook trust model: `experiment_update`, `X-Adaptyv-*` headers, `sha256=<hex>` verify-before-parse, delivery-id dedup, rank-based official lifecycle, updates modelled separately from status, local replay only | synthetic contract; public route; strict-monotonic reject |

## 19. Open questions (`docs/OPEN_QUESTIONS.md`; non-blocking)

- **[Q]** Exact wire casing of the Foundry status enum and the exact `experiment_update` `data` sub-schema — confirm from the pinned OpenAPI snapshot; a mapper bridges wire → domain enum.
- **[Q]** Whether the live API offers any idempotency guarantee for `POST /experiments` — deferred to the stretch HTTP client.
- **[Q]** Production base URL (`devs.adaptyvbio.com` vs `foundry-api-public.adaptyvbio.com`) and auth token scope — config, pinned.
- **[Q]** Availability of a sandbox token (gates the stretch contract smoke test).
- **[Q]** `gemini-3.6-flash` / `@google/genai` current stable versions — verify at implementation.

## 20. Approved elements retained (unchanged from R1)

One affinity/BLI/EGFR story; offline/mock default; TypeScript/Next.js/Zod; strict domain/application/adapter boundaries; no raw sequences to the LLM; three-layer Measured / Deterministic QC / Model Commentary UX; visible environment and mutation locks; human approval; evidence-backed communications.

## 21. R2 change log (mandatory corrections → sections)

| Item | Change | Sections |
|---|---|---|
| P0.1 | Official `experiment_update` contract (headers, `sha256=<hex>` signature, body `delivery_id/event/timestamp/api_version/data`), official lifecycle enum + ranks, updates modelled separately from status, local signed-fixture replay only, public webhook route removed | §2, §6 (`FoundryUpdate`), §7a, §8, §10, §11b, §17 (slice 3), §18 (ADR-0005) |
| P0.2 | Real gates: ambiguity blocks, over-budget blocks, target + deselect AC-7/AC-8 before approval, only AC-1..AC-4 in draft/results, edits invalidate approval | §2, §7a, §11b, §12 |
| P0.3 | Structured evidence segments; LLM never writes numbers; renderer inserts values; categorical/recommendation claims cite evidence | §6 (`CustomerDraftSegment`, `EvidenceRecord`), §9, §11a |
| P0.4 | `RawExtractedIntent` split from `ValidatedAffinityIntent`; `approvalRequired` is policy; concentrations/replicates nullable; unsupported types representable + blocked; deterministic adapter keyed by exact request | §6, §8, §9 |
| P0.5 | Approval bound to requestId+operation+environment+payloadVersion+payloadHash; persisted `READY_FOR_APPROVAL` gate; no claimed remote-atomicity; SQLite-persisted mock drafts + deterministic ids; `operationKey`; no assumed `Idempotency-Key` | §7a, §7b, §8, §10 |
| P0.6 | QC aligned to documented BLI fields (`kd/kon/koff`, `rmse_max_signal_pct`, `fit_quality`); no R2/MAE; `no_expression` → `no_detectable_binding`/KD-not-determinable; thresholds labelled Demo QC Policy v1; multi-concentration measurements populated | §6 (`ResultRecord`, `QCResult`), §11a, §12 |
| P1.7 | CSV removed; request text + FASTA only | §2, §3, §12 |
| P1.8 | Real client = pinned OpenAPI snapshot + contract schemas + mapper tests; live HTTP stretch | §2, §8, §14, §17, §18 (ADR-0004) |
| P1.9 | Plan rewritten as 6 vertical demoable slices | §17 (and the plan) |
| P1.10 | Defect fixes: no Infinity; code-unit ordering; compare payloadVersion; compile-time exhaustive classification; control/non-finite/negative KD fail QC; Gemini import only when module exists; Gemini structured output + JSON catch; gitleaks no bypass; explicit eval cases | §6, §7c, §12, §13, §14 (and the plan) |
| P1.11 | Playwright rewritten to cover the full scripted flow incl. reissue + dedup + audit | §14 (and the plan slice 5) |
| P1.12 | "BLI screening" → "BLI affinity characterization" everywhere | §1, §2, §12 |

---

*This R2 spec is the written-design gate. No application code, package.json, ADR file, GitHub issue, or worktree is created until the user reviews this document and the revised plan and approves proceeding to implementation.*
