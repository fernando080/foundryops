# FoundryOps MVP — Design specification (Revision R2.1)

- **Status:** approved direction; R2.1 pre-implementation correction pass — this is the single canonical design source of truth.
- **Date:** 2026-07-22
- **Owner:** Fernando
- **Companion:** `docs/superpowers/plans/2026-07-22-foundryops-mvp.md` (the implementation plan). These two documents are the **only** authoritative sources for implementation. The templates under `docs/planning/` are non-authoritative human summaries and must not be treated as design or implementation truth.
- **R2.1 basis:** current official Adaptyv Foundry documentation (`docs.adaptyvbio.com/api-reference`, OpenAPI `foundry-api-public.adaptyvbio.com/api/v1/openapi.json`, OpenAPI document version `0.0.2`) plus the user's mandatory R2.1 corrections. The R2.1 change log is §21.

Labels: **[C]** confirmed, **[A]** assumption, **[R]** recommendation, **[Q]** open question.

---

## 1. Mission and MVP statement

FoundryOps is the safe operational layer around the Adaptyv Foundry API. The MVP delivers **one reproducible vertical story**, recorded end-to-end offline in mock mode: an operator pastes an unstructured **BLI affinity characterization** request against EGFR and uploads a FASTA, and FoundryOps produces a validated, budget-aware Foundry **Draft** behind a human approval gate, ingests signed `experiment_update` timeline messages, tracks experiment status separately, runs deterministic results QC, and drafts an evidence-backed customer update whose numbers are all renderer-inserted from evidence — never inventing a measurement, never performing an unapproved mutation, and never letting the model write a numeric value into customer prose.

**Thesis:** the model interprets ambiguity; deterministic software enforces truth, permissions, numbers, and state.

## 2. Locked decisions

| Area | Decision |
|---|---|
| **Experiment type** [C] | Single type end-to-end: **affinity characterization via BLI vs EGFR**. 8 uploaded candidates; **only AC-1..AC-4** enter the approved draft and results after preflight + budget remediation. Light extension seam only. |
| **Request wording** [C] | The phrase is **"BLI affinity characterization"** everywhere. |
| **Input** [C] | **Request text + FASTA only.** Budget, concentrations, and replicates are extracted from the request text (and may be unresolved — §9). |
| **Vertical path** [C] | request text → FASTA preflight → target resolution (ambiguity blocks) → cost estimate (over-budget blocks) → candidate remediation → approval → idempotent mock Draft → signed `experiment_update` timeline ingest + separate status tracking → results QC → evidence-backed customer draft. |
| **Stack** [C] | Next.js App Router + React + Node + TypeScript strict + Zod + Drizzle/SQLite + Vitest + Playwright. No Python backend. `@google/genai` only inside the (stretch) Gemini adapter. |
| **Layering** [C] | `domain/ · application/ · adapters/ · infrastructure/ · presentation(src/app + src/components)`. Next.js only adapts UI to application services. **`application/` must not import `adapters/foundry/*`;** deterministic mock-id generation is injected via a `DraftIdGenerator` port. |
| **LLM** [C] | Provider-neutral typed `LlmClient`. MVP default **DeterministicLlmAdapter** (`LLM_PROVIDER=stub`, keyed by the exact demo request; unknown requests return `NO_STUB_FIXTURE`, never a silent affinity/BLI intent). **GeminiLlmAdapter** is STRETCH. LLM only (a) proposes a `RawExtractedIntent` and (b) composes evidence-referencing draft segments; it never writes numbers into prose. **No raw residues reach the LLM.** |
| **Foundry** [C] | `FoundryClient` interface. **MockFoundryClient** is the only client exercised in the Loom. Real client = **pinned OpenAPI snapshot + Zod contract schemas + mapper tests** (Task 5.3, SHOULD, after the offline path is green); **executable live HTTP is STRETCH** and is never described as atomic with SQLite. |
| **Persistence** [C] | SQLite via Drizzle behind repositories, including the server-derived current `DraftPayload`, approvals, draft operations, and update timeline. Tests use `:memory:`; the app uses a shared file connection. Postgres future-only. |
| **Runtime posture** [C] | Single-user local; offline/mock by default (the required path); **no public webhook route** — local signed-fixture replay only; timebox 12–16 focused hours. |

## 3. Scope — MUST / SHOULD / STRETCH

**MUST:** slices 0–5 (§17); deterministic offline run (`LLM_PROVIDER=stub` + `MockFoundryClient`) from a clean checkout; real gates (ambiguity blocks, over-budget blocks, candidate remediation before approval, only AC-1..AC-4 in the draft/results, payload edit invalidates approval); renderer-inserted numbers; four final candidates AC-1..AC-4; three-layer UX; human approval; evidence-backed comms; the full Playwright flow (§11) and the eval suite (§14).

**SHOULD:** Task 5.3 Foundry contract schemas + mapper tests (no live network), after the offline path is green; audit-drawer polish; README + `docs/DEMO_RUNBOOK.md`; secret-hygiene gate.

**STRETCH (out of acceptance):** executable live `FoundryHttpClient` HTTP calls; opt-in sandbox contract smoke test; `GeminiLlmAdapter` real calls + offline transcript-parity eval.

**Non-goals:** no generic N-type framework, no PDF/export, no charting beyond tables + at most one inline sparkline, no email/Slack send, no multi-user auth, no public webhook endpoint.

## 4. Architecture options considered

Stack is user-locked. **A — TypeScript full-stack (chosen):** best product-quality-per-hour; one language; Zod runtime-validated contracts at every boundary; framework-independent domain. **B — Python full-stack:** SDK affinity irrelevant to a mock-only Loom; UI polish cost too high. **C — React + FastAPI split:** two runtimes, integration tax, no demo benefit. → **ADR-0001.**

## 5. Module and layer architecture

```
src/
  domain/{schemas,constants, sequence/fasta, intent/validate, preflight/engine, target/resolve,
    cost/budget, payload/canonical, approval/rules, webhook/{verify,envelope}, status/map,
    results/qc, evidence/bundle, comms/compose}
  application/{ports, intake, estimate, approval, createDraft, ingestUpdate, refreshStatus, reviewResults, draftComms}
  adapters/{foundry/{mock,ids,contract,http,factory}, llm/{deterministic,gemini,factory}}
  infrastructure/{db/{schema,client}, repositories, crypto/{hash,hmac}, config/{env,network-guard}, logging/logger}
  app/{layout,page,actions/*}   components/*
fixtures/  tests/  e2e/
```

`application/` depends only on ports (`FoundryClient`, `LlmClient`, `DraftIdGenerator`) and repositories — never on `adapters/foundry/*`. Deterministic mock-id generation lives in `adapters/foundry/ids.ts` (`MockDraftIdGenerator`) and is injected at the composition root (server actions).

## 6. Domain model

Class legend: **M** measured/external, **D** deterministic-derived, **X** model-authored (re-validated). Money is integer minor units (cents).

| Type | Key fields (class) | Notes |
|---|---|---|
| `RawExtractedIntent` | `experimentType: string` (X), `method: string` (X), `targetQuery: string|null` (X), `requestedCount: number|null` (X), `concentrations: number[]|null` (X), `replicates: number|null` (X), `budget: Money|null` (X), `fields[]`, `ambiguities[]` | Permissive; unsupported types representable. No `approvalRequired`. |
| `ValidatedAffinityIntent` | `experimentType:'affinity'` (D), `method:'bli'` (D), `targetQuery`, `requestedCount`, `concentrations: number[]` (D), `replicates: number` (D), `budget: Money|null`, `approvalRequired: true` (D policy), `assayDefaultsApplied: boolean` (D), `fields`, `ambiguities` | Product of `validateIntent`. |
| `Sequence` / `SequenceSet` | as R2 (`id, rawHeader(M,untrusted), residues, chains, length, normHash, sourceLoc`; `acceptedIds/rejectedIds`) | Never sent to the LLM. |
| `PreflightFinding` | `code, severity, message(D-template), evidenceLocation, remediation, blocksProgression(D), duplicateOf?` | **Auto-excluded** malformed/duplicate candidates set `blocksProgression:false` (excluded, campaign continues). Only `EMPTY_INPUT` / `UNSUPPORTED_EXPERIMENT_TYPE` / unresolved target / over-budget block. |
| `Target` / `TargetResolution` | as R2; `status:'resolved'|'ambiguous'|'missing'` | ambiguous/missing block. |
| `CostEstimate` | `foundryQuoteRef, lineItems[], totalMinor, currency, withinBudget(D), overageMinor(D), maxWithinBudget: number|null(D)` | `null` when no budget (never `Infinity`). |
| `DraftPayload` | semantic: `method, experimentType, targetId, sequences[](id+residues), concentrations, replicates, costTotalMinor, currency, environment, operation, canonicalizerVersion`; volatile: `version, costEstimateRef?, requestId?, canonicalHash?, createdAt?` | Compile-time exhaustive classification (§7c). Persisted server-side as the request's current payload. |
| `Approval` | `id, requestId, operation, environment, payloadHash, payloadVersion, costSnapshotMinor, actor, issuedAt, expiresAt, status('valid'|'consumed'|'expired'|'invalidated'), consumedAt: string|null` | All D. Every field persisted. |
| `FoundryUpdate` (timeline message) | `deliveryId, event:'experiment_update', timestamp, apiVersion, signatureVerified(D), data:{ type, experimentId, experimentCode, organizationId, updateId, name, description, updateType, eta, createdAt }` | **The webhook carries no experiment status.** Do not invent `status`/`title`/`content`. `apiVersion` is a webhook date version (e.g. `2026-02`), **distinct** from the OpenAPI document version `0.0.2`. |
| `ExperimentStatus` (domain enum) | `Draft, WaitingForConfirmation, QuoteSent, WaitingForMaterials, InQueue, InProduction, DataAnalysis, InReview, Done, Canceled` | Obtained via `getExperimentStatus()`, not from the webhook. Wire form is lower_snake_case (§7a). |
| `Measurement` | `candidateId, concentrationM(M), replicateIndex(M), responseValue(M)` | Populated multi-concentration × triplicate. |
| `ResultRecord` | `experimentId, candidateId, replicateKdsM: number[]|null(M), konPerMs: number|null(M), koffPerS: number|null(M), kdMeanM: number|null(M), rmseMaxSignalPct: number|null(M, contract), fitQualityReported: 'good'|'medium'|'poor'|null(M, contract), confidence: 'high'|'medium'|'low'|null(M, contract), controlOutcome: 'pass'|'fail'|'na'(M), measurements: Measurement[](M)` | **Contract-faithful BLI fields** (KD/kon/koff, replicate dispersion, `fit_quality`, `rmse_max_signal_pct`, `confidence`). Any non-contract metric would be explicitly labelled synthetic; none is used. |
| `QCResult` | `candidateId, qcStatus:'pass'|'fail'(D, data quality), bindingClass(D, outcome), affinity{kdM,ciLowM,ciHighM}(D), replicateConsistency{cv,consistent}(D), fitQuality{rmseMaxSignalPct,reported,pass}(D), confidence(D passthrough), controlOutcome(D), recommendation(D), appliedThresholds:'demo-qc-policy@v1'(D), warnings[](D)` | **Data quality (`qcStatus`) is separate from binding outcome (`bindingClass`).** `no_detectable_binding` with good controls is `qcStatus:'pass'`. `bindingClass ∈ {confirmed_binder, apparent_binder_poor_fit, no_detectable_binding, inconclusive_replicate_inconsistent, non_binder}`. |
| `EvidenceRecord` | `id, kind:'measurement'|'qc_calculation'|'control'|'threshold'|'classification'|'approved_recommendation', valueKind:'numeric'|'categorical', numericValue: number|null, unit: string|null, categoricalValue: string|null, displayLabel, sourceRef, provenanceChain` | Numeric + categorical. |
| `EvidenceBundle` | `experimentId, records[], summaryStats(D)` | Only object the drafting LLM sees. |
| `CustomerDraftSegment` | `{kind:'text', text}` **(no digits)** or `{kind:'evidence', evidenceId, claimType, prefix, suffix}` **(no digits in prefix/suffix; claimType must match evidence kind)** | LLM chooses citations + connecting words; renderer inserts values. |
| `CustomerDraft` | `segments[], generatedBy{adapter,model,promptHash}, status:'draft'` | Rendered after `validateCustomerDraft` passes. |

## 7. State machines

### 7a. Request lifecycle, update timeline, and experiment status (three separate concerns)

**Internal request lifecycle** (our workflow state, persisted as `request_state`): `INTAKE → INTENT_VALIDATED → PREFLIGHT_PASSED → TARGET_RESOLVED → ESTIMATED → REMEDIATED → READY_FOR_APPROVAL → APPROVED → DRAFT_CREATED → MONITORING → RESULTS_AVAILABLE → REVIEWED → COMMS_DRAFTED`. A payload edit in `ESTIMATED..APPROVED` returns to `ESTIMATED` (or `PREFLIGHT_PASSED` if sequences change) and invalidates any approval. `READY_FOR_APPROVAL` is a persisted gate.

**Update timeline** (from signed `experiment_update` webhooks): each verified, deduplicated update is stored as an **append-only timeline message** (`FoundryUpdate`). Updates carry **no status** — they are human-readable events (name/description/update_type/eta).

**Experiment status** (obtained separately via `FoundryClient.getExperimentStatus(experimentId)`): the client returns a **lower_snake_case wire enum** (`draft, waiting_for_confirmation, quote_sent, waiting_for_materials, in_queue, in_production, data_analysis, in_review, done, canceled`). `mapWireStatus` validates the wire value against the pinned OpenAPI enum and maps it to the domain `ExperimentStatus`; **only then** does the lifecycle transition policy apply. Ranks: `Draft`1 … `Done`9; `Canceled` terminal (applies from any non-terminal). `decideTransition(current, incoming)` applies only when incoming rank > current (or `Canceled`); equal/lower is an ignored no-op; `Done`/`Canceled` terminal. **[Q]** the exact wire strings are confirmed from the pinned OpenAPI snapshot; the mapper is the single bridge.

### 7b. Approval lifecycle

`VALID (issued in READY_FOR_APPROVAL)` → **`CONSUMED`** (`consumedAt` set) · **`EXPIRED`** · **`INVALIDATED`**. `approvalStatusFor(approval, currentPayload, nowIso, requestId)` returns `valid` only if **all** hold: `approval.status === 'valid'`, `requestId`, `operation`, `environment`, `payloadVersion`, `payloadHash`, and `costSnapshotMinor` match, and `now ≤ expiresAt`. The consume statement is `UPDATE approvals SET status='consumed', consumed_at=? WHERE id=? AND status='valid'` and asserts exactly one changed row.

### 7c. Canonical payload hash → ADR-0003

`canonicalHash = sha256(canonicalize(DraftPayload))`. `canonicalize`: field classification is **compile-time exhaustive** (`Record<keyof DraftPayload, 'semantic'|'volatile'>`); money must be integer; **`canonicalizerVersion` must equal `canon@v1`** (throws otherwise); sequences sorted by id and concentrations sorted with a **code-unit comparator** (never `localeCompare`); strings NFC-normalized. Semantic fields hashed; volatile excluded. `payloadVersion` is compared separately (volatile, not hashed). Env + operation are hashed, so a mock/create_draft approval can never authorize a live/confirm mutation.

## 8. Adapter contracts

### FoundryClient (+ DraftIdGenerator port)

```ts
interface FoundryClient {
  searchTargets(q: { query: string }): Promise<Target[]>                 // GET /api/v1/targets
  estimateCost(input: { acceptedCount: number; budgetMinor: number | null }): Promise<CostEstimate> // POST /experiments/cost-estimate
  createDraft(input: DraftPayload, opts: { operationKey: string }): Promise<{ experimentId: string; draftId: string }> // POST /experiments (Draft)
  getExperimentStatus(experimentId: string): Promise<{ statusWire: string }> // GET /api/v1/experiments/{id} — lower_snake_case status
  getResults(experimentId: string): Promise<ResultRecord[]>              // GET /experiments/{id}/results
}
interface DraftIdGenerator { idFor(operationKey: string): string }        // injected; mock = exp_${sha256(operationKey).slice(0,10)}
```

- **Idempotency:** `operationKey = requestId + '::' + operation + '::' + payloadHash`. No assumed `Idempotency-Key` header (absent from the pinned OpenAPI). In mock mode the create use-case persists the draft operation + a deterministic id (from the injected `DraftIdGenerator`) in SQLite behind a unique index on `operationKey`; a repeat returns the stored row. Live idempotency is **[Q]**, deferred to the stretch HTTP client.
- **Real client:** `adapters/foundry/contract/` — pinned `openapi.snapshot.json` (OpenAPI document version `0.0.2`, sha recorded) + Zod contract schemas + mapper tests for the used operations, including the wire→domain status mapping. Executable HTTP is STRETCH. → **ADR-0004.**

### LlmClient

```ts
interface LlmClient {
  extractIntent(input: { requestText: string }): Promise<{ ok: true; raw: RawExtractedIntent } | { ok: false; error: string }>
  draftCustomerUpdate(input: { evidenceBundle: EvidenceBundle }): Promise<{ ok: true; draft: CustomerDraft } | { ok: false; error: string }>
}
```

`DeterministicLlmAdapter.extractIntent` is keyed by the exact demo request; an unrecognized request returns `{ ok:false, error:'NO_STUB_FIXTURE' }` (never a fabricated affinity intent). `GeminiLlmAdapter` (STRETCH) uses a structured-output schema and try/catch JSON parsing. → **ADR-0002.**

## 9. LLM boundary vs deterministic boundary

**LLM only:** (a) propose a `RawExtractedIntent`; (b) compose evidence-referencing draft segments. **Never:** validate sequences, compute metrics, resolve approval policy, decide transitions, invent values, execute Foundry ops, or write a numeric value into prose. `validateIntent` maps `RawExtractedIntent → ValidatedAffinityIntent` or blocks (`UNSUPPORTED_EXPERIMENT_TYPE`) — an unsupported type is representable, never a schema crash. `concentrations`/`replicates` may be null → deterministic assay defaults with `assayDefaultsApplied=true`. `approvalRequired=true` by policy.

**Evidence-segment composition:** `renderCustomerDraft` inserts each cited value (`numericValue + unit`, or categorical `displayLabel`) from `EvidenceBundle`. `validateCustomerDraft` fails closed on: a `text` segment containing a digit, an `evidence` segment `prefix`/`suffix` containing a digit (`TEXT_SEGMENT_HAS_NUMBER`), an `evidence` id absent from the bundle (`EVIDENCE_NOT_FOUND`), or a `claimType` inconsistent with the evidence kind (`CLAIMTYPE_EVIDENCE_MISMATCH` — `recommendation` ↔ `approved_recommendation`; `confirmed`/`inconclusive` ↔ factual kinds). Rendering never happens unless validation passes.

## 10. Approval, request persistence, idempotency, updates, status, audit

- **Request persistence:** the server-derived current `DraftPayload` is persisted on the request row as `payload_json`, with `payload_hash`, `payload_version`, and `request_state`. The browser never supplies the payload for a mutation.
- **Approval persistence:** every `Approval` field is persisted (`request_id, operation, environment, payload_hash, payload_version, cost_snapshot_minor, actor, issued_at, expires_at, status, consumed_at`).
- **Server-authoritative actions:** `requestApprovalAction(requestId)` accepts **only** `requestId`, loads the persisted current payload, reruns readiness checks server-side, and issues the approval. `createDraftAction(requestId, approvalId)` accepts **only** those two, loads the current payload server-side, and never trusts a browser-supplied payload.
- **createDraft transaction:** in one SQLite transaction — re-verify the approval via `approvalStatusFor`; consume it (`WHERE id=? AND status='valid'`, assert 1 row); insert the `draft_operations` row (unique `operationKey`, deterministic id from the injected `DraftIdGenerator`); advance `request_state` to `DRAFT_CREATED`. Mock computes the id locally (no remote call). We do **not** claim a remote HTTP mutation is atomic with SQLite; the stretch HTTP client would POST after the local commit and reconcile — explicitly non-atomic.
- **Signed update ingest:** no public route. `ingestUpdate` verifies `X-Adaptyv-Signature: sha256=<hex>` (constant-time) over the raw body, **cross-checks** that `X-Adaptyv-Event` equals the body `event` and `X-Adaptyv-Delivery-Id` equals the body `delivery_id`, deduplicates by `delivery_id`, and stores the accepted update as an append-only **timeline message**. Invalid signatures / header-body mismatches appear only in the audit view. The webhook does not drive status.
- **Status tracking:** `refreshStatus` calls `getExperimentStatus`, maps the wire enum via `mapWireStatus`, and applies `decideTransition` to the persisted current status.
- **Audit trail:** append-only event/update logs + the canonical payload + hash + cost + each state transition, sufficient to reconstruct outcomes.

## 11. UX design

One flowing workspace: persistent left **stepper** (request lifecycle) + top bar with **environment badge (MOCK/SANDBOX/LIVE)**, a **"Live mutations disabled" padlock**, the run-identity + canonical-hash chip, and an **Audit** button. Global overlays: **Audit drawer** and the reusable **Evidence popover**.

**Stages → scenes:** Intake (S2), Preflight + Target/Budget remediation (S3), Approval boundary (S4), Update timeline + status (S5), Results QC (S6), Customer draft (S7); shell + Audit carry S1/S8.

### 11a. Three-layer results (retained)
Each of AC-1..AC-4 is a card with three bands (color + icon + label + typography, grayscale-legible):
- **Layer A — MEASURED · read-only** (slate, monospace): contract BLI fields — per-replicate `kd/kon/koff`, `kd_mean`, `rmse_max_signal_pct`, reported `fit_quality`, `confidence`, control outcome, multi-concentration series.
- **Layer B — DETERMINISTIC QC** (teal): **Demo QC Policy v1** badges, showing **Data quality (`qcStatus`)** and **Binding outcome (`bindingClass`)** as two distinct rows — a `no_detectable_binding` with good controls reads as *data quality PASS, outcome: no detectable binding*, not a failed assay. Replicate consistency (CV), fit quality, recommendation. Each badge is an evidence chip.
- **Layer C — MODEL COMMENTARY · interpretation** (violet, prose): the rendered draft; every number renderer-inserted from evidence; model-unavailable → `Model commentary unavailable — deterministic results unaffected`.

The `Demo QC Policy v1` badge is explicit so the demo policy is never mistaken for Adaptyv production thresholds.

### 11b. Real gates
Target ambiguity blocks (choose one EGFR construct); over-budget blocks (remediation = deselect AC-7 + AC-8, 6→4 candidates, within budget); target + AC-7/AC-8 deselect before `READY_FOR_APPROVAL`; only AC-1..AC-4 enter the draft/results; approval boundary shows `Create draft — no lab action, no charge` (enabled) vs `Confirm & submit to lab` (padlocked); editing the payload shows a diff + changed hash + red `INVALIDATED` banner and requires reissue.

### 11c. Critical blocked states (unchanged from R2 plus data-quality separation)
Unsupported experiment type; target ambiguous; over budget; malformed/duplicate sequence (excluded, non-blocking); invalidated approval; invalid-signature/header-mismatch update (audit only); fail-closed draft (blocked segment); model outage; **data-quality-fail candidate shown distinctly from a valid negative (no detectable binding)**.

### 11d. Accessibility
Never color-only; AA contrast; focusable stepper/chips/controls; `aria-expanded`/`aria-controls`; polite live-region for timeline/dedupe, assertive for gates; dedupe as a persistent badge.

### 11e. Pencil — deferred, minimal
At most two wireframes during planning: MUST Results QC three-layer card; SHOULD Approval boundary.

## 12. Fixtures and QC policy

**Input:** request text + FASTA only. Demo request (verbatim): *"Prepare a BLI affinity characterization against EGFR using the attached sequences, six-point concentration series in triplicate. Keep it below the customer budget of $8,000, flag anything suspicious, and do not submit without my approval."* (Replicates = **triplicate** everywhere; all AC-1..AC-4 fixtures carry three replicate KDs and a 6-point × 3-replicate measurement series.)

**Cost model:** `totalMinor = 250000 + 120000 × acceptedCandidates`; budget `800000`. Preflight rejects AC-5 (malformed) + AC-6 (duplicate) → 6 accepted → `970000` → over budget by $1,700. Remediation deselects AC-7 + AC-8 → 4 accepted → `730000` (within budget); `maxWithinBudget = 4`. Only AC-1..AC-4 enter the draft and results.

**Candidate roles** (contract-faithful affinity fields):

| Candidate | Role | Values | qcStatus | bindingClass | reco |
|---|---|---|---|---|---|
| AC-1 | Strong consistent binder | kd [2.0,2.1,1.95] nM, kd_mean 2.02, kon 3.1e5, koff 6.3e-4, rmse 4.2%, fit `good`, confidence `high`, control pass | pass | confirmed_binder | follow_up |
| AC-2 | Poor-fit apparent binder | kd [40,44,38] nM, kd_mean 40.7, rmse 22.5%, fit `poor`, confidence `low`, control pass | pass | apparent_binder_poor_fit | inconclusive |
| AC-3 | No detectable binding (valid negative) | kd not determinable, response at control baseline, fit `poor`/na, confidence `low`, **control pass** | **pass** | no_detectable_binding | drop |
| AC-4 | Contradictory replicates | kd [5,500,250] nM, CV high, control pass | pass | inconclusive_replicate_inconsistent | inconclusive |
| AC-5 | Malformed sequence | invalid residue → excluded at preflight (non-blocking) |
| AC-6 | Duplicate of AC-1 | byte-identical → collapsed once (non-blocking) |
| AC-7, AC-8 | Filler valid binders | deselected in budget remediation; do not enter results |

A control-fail or non-finite/negative-KD variant (used only in tests) yields `qcStatus:'fail'` — demonstrating that **data quality is separate from binding outcome**.

**Demo QC Policy v1** (`demo-qc-policy@v1`, a demo policy — not Adaptyv production thresholds): `fit.rmseMaxPct = 15`; `replicate.cvMax = 0.20`; `binding.kdMaxBinderM = 1e-6`. Order: (data quality) control fail or non-finite/negative KD → `qcStatus:'fail'`; (binding outcome) KD not determinable → `no_detectable_binding`; CV > cvMax → `inconclusive_replicate_inconsistent`; rmse > rmseMaxPct or fit `poor` → `apparent_binder_poor_fit`; kd_mean ≤ kdMaxBinderM → `confirmed_binder`; else `non_binder`. `recommendation`: `qcStatus:'fail'`→`drop`; else confirmed→follow_up, apparent/inconsistent→inconclusive, else drop.

**Material intake ambiguity (retained):** EGFR resolves to two constructs (human ECD vs ectodomain-Fc) — one dropdown decision.

## 13. Observability, logging, secrets

Structured logs over an allowlisted field set (never raw bodies/headers/SDK errors); redact tokens, keys, raw sequences, customer contact info, file contents. Secrets server-side only; no `NEXT_PUBLIC_` secret; a CI step greps the built client bundle; `gitleaks` runs **without a `|| true` bypass**. The SQLite file lives outside any served/static directory. Mutations are POST server actions.

## 14. Testing, evals, release gates

**Golden/adversarial suite (explicit cases, no placeholders):** must-not-invent absent budget; **unknown stub → `NO_STUB_FIXTURE`**; unsupported experiment type blocked; target ambiguity blocks; over-budget block + remediation math; canonical-hash stability + sensitivity (incl. payloadVersion + canonicalizerVersion); approval consume single-row; update signature verify + header/body cross-check; update dedup once; each QC class AC-1..AC-4 at Demo QC Policy v1; data-quality vs binding-outcome separation (control-fail → `qcStatus:'fail'`; AC-3 → `qcStatus:'pass'`, `no_detectable_binding`); fail-closed draft (text digit, prefix/suffix digit, missing evidence, claimType/kind mismatch). Every LLM-touching case runs on `DeterministicLlmAdapter`.

**Runtime database:** unit/integration tests use `:memory:` (one shared connection per test); `npm run demo` uses `./data/foundryops.db`; **Playwright uses a separate `./data/e2e.db`, deleted before the run**; server actions share persisted state through a single shared file connection (WAL).

**CI:** network guard throws on any non-loopback socket; env `LLM_PROVIDER=stub`, `FOUNDRY_MODE=mock`. Jobs: A unit, B integration (in-mem SQLite + Mock + stub), C e2e (Playwright §11 from clean checkout, with a **separate fail-closed draft test** that does not corrupt the happy path), D contract mapper tests (SHOULD). `demo-ready` = A+B+C green · contract mapper tests green (SHOULD) · eval suite green · `gitleaks` clean (no bypass) · client-bundle grep clean · `npm run demo` boots.

**Dependencies:** do **not** pin Next.js `15.1.0`. Resolve current supported stable versions at implementation time, install with `--save-exact`, commit the lockfile, and run `typecheck`, `test`, `build`, and `npm audit` before continuing.

**Three most load-bearing evals:** fail-closed draft; approval hash stability/sensitivity + update dedup + single-row consume; QC classification + data-quality/outcome separation.

## 15. Threat model

As R2, with the corrected update model: prompt injection re-derived deterministically; hallucinated measurement blocked (LLM emits no numbers; renderer inserts; text/prefix/suffix digit + claimType checks); stale approval bound to hash+version+requestId+op+env+**costSnapshotMinor**+status+expiry with single-row consume; replay/duplicate update dedup by signed `delivery_id` + header/body cross-check; accidental live mutation (non-constructable without token; demo env has no token); secret leakage (allowlist logging, `server-only`, CI bundle grep, gitleaks no bypass); cost arithmetic (integer minor units, in-hash zero tolerance); provider outage (deterministic default); malicious file content (size caps, residue allowlist, React escaping); dependency/deployment (`npm audit`, DB outside served dir, no debug routes).

## 16. Deployment, secrets, no-network fallback

`npm run demo` (`./data/foundryops.db`) boots the scripted demo in mock mode from a clean checkout — no credentials, no network — the acceptance baseline. Optional single container carries no live token and defaults to mock+stub. Deterministic adapter + mock client are the no-network fallback; a prerecorded Loom clip is the ultimate fallback.

## 17. Implementation slices (6 vertical, each leaves a runnable state)

| Slice | Deliverable | Runnable end state |
|---|---|---|
| **0** | Executable shell + canonical fixtures (scaffold with resolved-stable deps, env, network guard, schemas/constants, request/FASTA/target/result/signed-update fixtures, pinned OpenAPI snapshot) | app boots to an empty workspace; schema + fixture tests green; `typecheck/test/build/npm audit` green |
| **1** | Intake + preflight + target/budget remediation + UI | paste → remediated, target-selected, AC-1..AC-4 selected, within budget |
| **2** | Approval + idempotent mock draft + UI (persisted payload + approval; server-authoritative actions; injected DraftIdGenerator; READY_FOR_APPROVAL gate; single-row consume) | approve exact payload → deterministic mock draft; edit invalidates; reissue works |
| **3** | Signed `experiment_update` timeline ingest + separate status tracking + timeline/audit UI (header/body cross-check; local replay; getExperimentStatus + mapWireStatus + transition) | replay valid/duplicate/invalid updates; dedupe once; invalid only in audit; status advances via getExperimentStatus |
| **4** | Results QC + EvidenceBundle + customer draft + polished UI (qcStatus vs bindingClass; numeric+categorical evidence; structured segments; validate incl. prefix/suffix + claimType; render) | review AC-1..AC-4; generate evidence-backed draft, all numbers renderer-inserted |
| **5** | Playwright + eval suite + README + Loom hardening; Task 5.3 contract mappers (SHOULD, after offline green) | `demo-ready` gate green |
| Stretch | GeminiLlmAdapter + executable live FoundryHttpClient | opt-in, non-blocking |

## 18. ADRs to record (as their decisions are first implemented)

| ADR | Decision | Alternative rejected |
|---|---|---|
| 0001 | Layered TS; framework-independent domain; `application/` never imports `adapters/foundry/*` (DraftIdGenerator port) | Next.js-centric logic; direct adapter imports |
| 0002 | Narrow deterministic-default LLM; Raw/Validated intent split; unknown → NO_STUB_FIXTURE; segments not prose-numbers; Gemini stretch | LLM in the loop; silent affinity default; LLM writing numbers |
| 0003 | Canonical hash = approval binding; exhaustive classification; code-unit ordering; integer money; canonicalizerVersion + payloadVersion validated | random idempotency key; localeCompare |
| 0004 | Mock default; real client = pinned OpenAPI snapshot + contract schemas + mappers (live HTTP stretch); operationKey idempotency, no assumed Idempotency-Key; not atomic with SQLite | building against live; assuming provider idempotency; claiming atomicity |
| 0005 | Official `experiment_update` webhook = signed timeline message (no status), header/body cross-check, delivery-id dedup, local replay only; status obtained separately via getExperimentStatus with wire→domain mapping before transition policy | synthetic contract; deriving status from the webhook; public route |

## 19. Open questions (`docs/OPEN_QUESTIONS.md`; non-blocking)

- **[Q]** Exact lower_snake_case wire strings of the Foundry status enum and the exact `experiment_update` `data` field types — confirmed from the pinned OpenAPI snapshot; the mapper bridges wire → domain.
- **[Q]** Whether `POST /experiments` offers any idempotency guarantee — deferred to the stretch HTTP client.
- **[Q]** Production base URL and token scope — config, pinned.
- **[Q]** Sandbox token availability (gates the stretch smoke test).
- **[Q]** `@google/genai` current stable version + `gemini-3.6-flash` availability — verify at implementation.

## 20. Approved elements retained

One BLI affinity / EGFR story; request + FASTA only; offline deterministic mode as the required path; four final candidates AC-1..AC-4; renderer-inserted numbers; three-layer Measured / Deterministic QC / Model Commentary UX; visible environment and mutation locks; human approval; evidence-backed communications; Gemini and executable live Foundry HTTP as stretch; Task 5.3 contract mappers as SHOULD after the offline path is green.

## 21. R2.1 change log (corrections → sections)

| Item | Change | Sections |
|---|---|---|
| 1 | Canonical sources: spec + plan updated together; CSV scope removed (request + FASTA only, positively stated); old synthetic webhook model + public route removed; `docs/planning/*` marked non-authoritative | header, §2, §3, §5–10 |
| 2 | Official `experiment_update` envelope with exact fields (`data.type/experiment_id/experiment_code/organization_id/update_id/name/description/update_type/eta/created_at`); no invented status/title/content; header/body cross-check; webhook `api_version` (e.g. `2026-02`) kept separate from OpenAPI doc version `0.0.2`; accepted update stored as a timeline message; status obtained separately via `getExperimentStatus` with lower_snake_case wire → domain mapping before transition policy | §6, §7a, §8, §10, ADR-0005 |
| 3 | Persist current `DraftPayload` on the request (`payload_json/hash/version/state`) and every `Approval` field (`+consumed_at`); `approvalStatusFor` checks status=valid + requestId + operation + environment + payloadVersion + payloadHash + costSnapshotMinor + expiry; consume `WHERE id=? AND status='valid'` asserting one row; server-authoritative `requestApprovalAction(requestId)` / `createDraftAction(requestId,approvalId)`; `application/` never imports `adapters/foundry/*` (DraftIdGenerator port); live HTTP not atomic with SQLite | §6, §7b, §8, §10, ADR-0001/0004 |
| 4 | Runtime DB: tests `:memory:`; demo `./data/foundryops.db`; Playwright `./data/e2e.db` deleted before run; server actions share a single file connection | §14, §16 |
| 5 | Approval demo/Playwright order (request → capture hash → edit replicates before draft → invalidated → reissue → exactly one draft); explicit replay of valid + duplicate + invalid-signature; assertions (valid in timeline, duplicate once, invalid audit-only); separate fail-closed draft test | §11b, §14 |
| 6 | Do not install Next.js 15.1.0; resolve current stable at implementation, `--save-exact`, commit lockfile, run typecheck/test/build/npm audit | §14, §17 |
| 7 | Unknown stub → `NO_STUB_FIXTURE`; auto-excluded candidates non-blocking; validate digits in evidence prefix/suffix + text; validate claimType against evidence kind; validate `canonicalizerVersion`; triplicate everywhere; contract-faithful affinity fields (label any non-contract metric synthetic; none used); separate data quality (`qcStatus`) from binding outcome (`bindingClass`) — no detectable binding ≠ failed assay | §6, §7c, §8, §9, §11a, §12 |

---

*This R2.1 spec is the single canonical design source of truth. Its only companion is the implementation plan. `docs/planning/*` are non-authoritative.*
