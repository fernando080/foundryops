# FoundryOps MVP — Design specification

- **Status:** proposed — awaiting user review
- **Date:** 2026-07-22
- **Owner:** Fernando
- **Process authority:** `superpowers:brainstorming` (this document is the written-spec gate)
- **Inputs synthesized:** product-planner, solution-architect, security-reviewer, eval-designer, ux-reviewer gate reviews; `docs/PROJECT_BRIEF.md`, `docs/PRODUCT_SPEC.md`, `docs/SAFETY_AND_TRUST.md`, `docs/DEMO_STORYBOARD.md`, `docs/RESEARCH_NOTES.md`, `docs/OPEN_QUESTIONS.md`.

Statements are labelled **[C]** confirmed (locked by the user or the product docs), **[A]** assumption, **[R]** recommendation, **[Q]** open question, where material.

---

## 1. Mission and MVP statement

FoundryOps is the safe operational layer around the Adaptyv Foundry API. The MVP delivers **one reproducible vertical story**, recorded end-to-end in mock mode: an operator pastes an unstructured BLI-vs-EGFR request and uploads a FASTA/CSV, and FoundryOps produces a validated, budget-aware Foundry draft behind a human approval gate, then monitors status, reviews results with deterministic QC, and drafts an evidence-backed customer update — never inventing a measurement, never performing an unapproved mutation.

**One-line thesis the demo must prove:** the model interprets ambiguity; deterministic software enforces truth, permissions, numbers, and state.

## 2. Locked decisions (from the user) — the design operates strictly within these

| Area | Decision |
|---|---|
| **Experiment type** [C] | Single type end-to-end: **affinity characterization via BLI vs EGFR** (`experiment_type=affinity`, `method=bli`, `target=EGFR`). 8 synthetic candidates; multiple concentrations + replicates in fixtures. A light extension seam for future types only — **no generic N-type architecture**. |
| **Vertical path** [C] | request intake → FASTA/CSV preflight → target resolution → cost estimate → approval → mock draft creation → webhook lifecycle → results QC → evidence-backed customer draft. No expression/screening as a second type. |
| **Stack** [C] | Next.js App Router + React + Node runtime + **TypeScript strict** + **Zod** (contracts + runtime validation) + **Drizzle + SQLite** + **Vitest** (unit/integration) + **Playwright** (demo happy path). No FastAPI / no separate Python backend. `@google/genai` used **only** inside the Gemini adapter. |
| **Layering** [C] | Explicit boundaries `domain/ · application/ · adapters/ · infrastructure/ · presentation(app/)`. Next.js route handlers and server actions **only** adapt HTTP/UI to application services; domain logic never lives in Next.js. |
| **LLM** [C] | Provider-neutral typed interface with exactly two MVP adapters: **DeterministicLlmAdapter** (default, `LLM_PROVIDER=stub`, reproducible, no key) and **GeminiLlmAdapter** (`gemini-3.6-flash`, `@google/genai`, Zod-validated structured output, opt-in via `LLM_PROVIDER=gemini` + `GEMINI_API_KEY`). No Anthropic/OpenAI adapters in the MVP. LLM **only** extracts `ExperimentIntent` and drafts the customer update from a validated `EvidenceBundle`. **No raw sequences to the LLM.** |
| **Foundry** [C] | `FoundryClient` interface. **MockFoundryClient** (deterministic IDs, quotes, transitions, webhook deliveries) is the **only** client used in the Loom. **FoundryHttpClient** exists behind the same interface using a **pinned public OpenAPI snapshot** + server-side fetch, **disabled by default**. Live ops require `FOUNDRY_MODE=live` + server-side token + a separate explicit confirmation + a still-valid payload hash/version. Sandbox contract smoke test is an **opt-in stretch goal**, not an acceptance criterion. |
| **Persistence** [C] | SQLite via Drizzle behind repositories. Postgres documented as future evolution, not implemented now. |
| **Runtime posture** [C] | Single-user local app; offline/mock by default; timebox **12–16 focused hours**; complete vertical slice over breadth. |

## 3. Scope, deliberate cuts, and non-goals

### In scope (the recorded story)
The complete happy path across seven scenes, plus the critical failure paths that make the safety story legible: one intake ambiguity, one malformed residue, one duplicate sequence, one over-budget block, one invalidated approval, one duplicate webhook, one invalid-signature rejection, four QC classifications, and one fail-closed customer-draft claim.

### Deliberate scope cuts (protect the timebox and the 4–5 min narrative) [R]
- **Gemini is not in the recorded path.** Record the whole happy path on `DeterministicLlmAdapter` for reproducibility; show Gemini for ~10 s in Scene 8 as "same interface, real model." Removes provider-outage and nondeterminism risk from the take. The demo can switch to deterministic replay without altering the story. [C]
- **No public webhook endpoint in the demo.** Implement HMAC verification + dedup + transition checks behind a local "replay event" control over signed fixtures. Every safety property, zero deployment/exposure surface.
- **FASTA carries sequences; CSV carries assay metadata** (concentration series, replicate count, budget). One sequence-parser surface, not two.
- **Preflight shows exactly two findings on screen** (one invalid residue, one duplicate) even though the engine implements and tests more check codes. The story stays legible.
- **Over-budget yields one deterministic suggestion** ("reduce to N candidates to fit"), not an optimization UI.
- **Terminology fix within the lock:** "non-expressing" does not map to a BLI binding assay. Model expression as an upstream boolean on the candidate fixture; the BLI QC story for that candidate is "no binding / KD non-determinable." Keeps deterministic QC honest.

### Non-goals for the MVP [C]
Training/fine-tuning a protein model; autonomous design; automatic purchase/confirmation of live experiments; production identity/multi-user auth; every Foundry experiment type; sending email/Slack; a documentation chatbot; a second wrapper around every endpoint; a generic N-type framework; PDF/export; dead-letter UI; charting libraries beyond tables + at most one inline sparkline.

## 4. Architecture options considered, and the decision

Consequential choices require ≥2 viable alternatives (CLAUDE.md). The stack is user-locked; this section records why it is defensible against the two credible alternatives.

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **A — TypeScript full-stack (Next.js App Router + Zod + Drizzle/SQLite)** [C, chosen] | Highest product-quality-per-hour for a polished 4–5 min demo; one language; Zod gives runtime-validated typed contracts at every boundary (LLM output, DB, adapters); server actions keep secrets server-side; domain stays framework-independent in `domain/`. | Node lacks first-class bio libraries (mitigated: FASTA parsing is simple and hand-written; no heavy bio math needed for synthetic BLI). | **Chosen.** Best fit for "convincing demo + typed determinism" in the timebox. |
| B — Python full-stack (FastAPI + server-rendered UI) | Affinity with the official Adaptyv Python SDK; strong typing via Pydantic. | The Loom must be **offline/mock**, so SDK affinity is weak for the demo; server-rendered UI is harder to make look like a real product in the timebox. | Rejected: SDK advantage doesn't apply to a mock-only demo; UI polish cost too high. |
| C — React/Next front + FastAPI backend | Clean language-per-tier separation. | Two runtimes, two type systems, cross-boundary integration overhead — expensive in a 12–16 h box. | Rejected: integration tax buys nothing the demo needs. |

**Decision:** Option A. Domain logic lives in pure TypeScript modules; Zod is the single shared contract across LLM structured output, the DB boundary, and the adapter interfaces. → **ADR-0001**.

## 5. Module and layer architecture

```
src/
  domain/            # pure, no framework, no IO
    intent/          # ExperimentIntent shaping (post-extraction, deterministic checks)
    sequence/        # FASTA parse, normalization, hashing
    preflight/       # validation rules + finding codes
    target/          # deterministic target selection over catalog results
    cost/            # deterministic cost arithmetic + budget compare
    payload/         # DraftPayload canonicalization + hash (ADR-0003)
    approval/        # authorization + invalidation rules (pure)
    webhook/         # signature/dedup/transition rules (pure)
    results/qc/      # QC arithmetic + versioned thresholds (qc_thresholds@v1)
    evidence/        # EvidenceRecord/Bundle assembly + resolution
    comms/           # claim -> evidence fail-closed validator (+ prose-number scan)
    schemas/         # Zod contracts shared by adapters, DB boundary, LLM
  application/       # use-cases + transaction boundaries
    intake/ preflight/ resolveTarget/ estimate/
    approval/ createDraft/ ingestWebhook/ reviewResults/ draftComms/
  adapters/
    foundry/         # MockFoundryClient, FoundryHttpClient, contract schemas, fixtures, drift check
    llm/             # DeterministicLlmAdapter, GeminiLlmAdapter
  infrastructure/
    db/              # Drizzle schema + migrations
    repositories/    # interfaces owned by application/domain
    crypto/          # sha256 canonical hash, hmac (constant-time)
    config/          # FOUNDRY_MODE, LLM_PROVIDER, flags, network guard
    logging/         # structured logs + allowlist redaction
  presentation/app/  # Next.js route handlers + server actions = thin HTTP/UI adapters only
    api/webhooks/foundry/route.ts
    actions/*
    components/      # evidence-distinct UI
tests/  evals/  fixtures/
```

Concern → home: **validation** = `domain/preflight` + Zod boundaries · **QC arithmetic** = `domain/results/qc` · **evidence resolution** = `domain/evidence` (+ presentation renderer resolves IDs and fails closed) · **authorization** = `domain/approval` (pure) enforced inside `application/createDraft` · **canonical hashing** = `domain/payload` + `infrastructure/crypto` · **adapters** = `adapters/*` · **repositories** = `infrastructure/repositories`. `application/createDraft` runs consume-approval + insert-draft in **one SQLite transaction** (`BEGIN IMMEDIATE`, WAL).

## 6. Domain model

Class legend: **M** = measured/external (immutable), **D** = deterministic-derived, **X** = model-authored (always re-validated). Fields abbreviated to key ones.

| Type | Key fields (class) | Notes |
|---|---|---|
| `ExperimentIntent` | `experimentType:'affinity'` (X→D-checked), `method:'bli'` (X→D-checked), `targetQuery` (X), `requestedCount` (X), `concentrations[]`/`replicates` (X), `budget{amountMinor:int, currency}` (X), `approvalRequired` (X, default `true` D), `fields: ExtractedField[]`, `ambiguities[]` | Model proposes only. An unsupported type/method becomes a `PreflightFinding`, never a silent coercion. |
| `ExtractedField` | `name`, `value` (X), `confidence` (X), `sourceSpan{start,end}` (X) | Provenance for Scene 2 source highlighting. Absent required fields → `status:'unresolved'`, never a number. |
| `Sequence` | `id` (D), `rawHeader` (M, untrusted), `residues` (D-parsed), `chains[]` (D), `length` (D), `normHash` (D), `sourceLoc{file,lineRange}` (D) | Never sent to the LLM. |
| `SequenceSet` | `sequences[]`, `acceptedIds[]` (D), `rejectedIds[]` (D) | Accept/reject is a preflight output. |
| `PreflightFinding` | `code` (enum), `severity:'error'|'warning'|'info'`, `message` (D-template), `evidenceLocation`, `remediation`, `blocksProgression` (D) | Messages are deterministic templates, not model text. |
| `Target` | `foundryTargetId`, `name`, `aliases[]`, `organism`, `uniprotId` (all M) | From `FoundryClient`. |
| `TargetResolution` | `query`, `chosen: Target|null` (D), `alternatives[]` (M), `status:'resolved'|'ambiguous'|'missing'` (D) | Selection deterministic; `ambiguous`/`missing` block progression. |
| `CostEstimate` | `foundryQuoteRef` (M), `lineItems[]` (M), `totalMinor:int`, `currency` (M), `withinBudget` (D), `overageMinor:int` (D), `maxWithinBudget` (D) | **Money is integer minor units** + ISO currency. Arithmetic never model-authored. |
| `DraftPayload` | `experimentType`, `method`, `targetId`, `sequences[]` (accepted), `concentrations`, `replicates`, `costEstimateRef`, `environment`, `operation`, `canonicalHash` (D), `canonicalizerVersion` (D), `version` (D, monotonic) | The exact outbound object. Hash rule in §7. |
| `Approval` | `id`, `operation:'create_draft'|'confirm_experiment'`, `payloadHash`, `payloadVersion`, `requestId`, `actor`, `issuedAt`, `expiresAt`, `environment:'mock'|'sandbox'|'live'`, `costSnapshotMinor`, `status` | All D; no model input. |
| `WebhookEvent` | `deliveryId` (M, dedup key, **signed**), `signature` (M), `signatureVerified` (D), `providerTs` (M), `eventType`, `experimentId`, `rawPayload` (M, append-only), `targetStatus` (D-parsed), `processingStatus` | Append-only regardless of accept/reject. |
| `Measurement` | `candidateId`, `concentration`, `replicateIndex`, `responseValue`, `kd`, `kon`, `koff`, `fitR2`, `controlType?` (all M) | Synthetic fixture data treated as external truth; never altered. |
| `ResultRecord` | `experimentId`, `candidateId`, `measurements[]` (M), `expressionOutcome` (M) | |
| `QCResult` | `expressionClass` (D), `bindingClass` (D), `affinity{kd,ci}` (D), `replicateConsistency{cv,consistent}` (D), `fitQuality{r2,pass}` (D), `controlOutcome` (D), `recommendation` (D), `appliedThresholds{version,...}` (D), `warnings[]` (D) | Threshold set is **versioned** (`qc_thresholds@v1`) so QC is reproducible. |
| `EvidenceRecord` | `id` (stable, e.g. `ev_qc_AC1_kd`), `kind:'measurement'|'qc_calculation'|'control'|'threshold'|'approved_recommendation'`, `sourceRef`, `value`, `unit`, `displayLabel`, `provenanceChain` (D) | Provenance atom. |
| `EvidenceBundle` | `experimentId`, `records: EvidenceRecord[]`, `summaryStats` (D) | **The only object the drafting LLM sees.** No residues. |
| `CustomerDraft` | `bodyBlocks:[{text (X), claimType:'confirmed'|'recommendation'|'inconclusive', numericClaims:[{value,unit,evidenceId}] (X)}]`, `unresolvedClaims[]` (D), `generatedBy{adapter,model,promptHash}`, `status:'draft'` | Text is X; every numeric claim must resolve to a bundle record **and** value-match (§9). |

## 7. State machines

### 7a. Request lifecycle (internal request, separate from the Foundry status mirror)

| From | To | Trigger | Actor |
|---|---|---|---|
| `INTAKE` | `INTENT_EXTRACTED` | submit text + file | User → LLM extract |
| `INTENT_EXTRACTED` | `PREFLIGHT_FAILED` / `PREFLIGHT_PASSED` | run rules | System (deterministic) |
| `PREFLIGHT_PASSED` | `TARGET_AMBIGUOUS` / `READY_TO_ESTIMATE` | target search | System via FoundryClient |
| `TARGET_AMBIGUOUS` | `READY_TO_ESTIMATE` | pick target | User |
| `READY_TO_ESTIMATE` | `ESTIMATED` | cost estimate | System via FoundryClient |
| `ESTIMATED` | `AWAITING_APPROVAL` | request approval | User |
| `AWAITING_APPROVAL` | `APPROVED` | approve exact payload | User (issues `Approval`) |
| `APPROVED` | `DRAFT_CREATED` | create draft (consumes approval, atomic) | User → FoundryClient |
| `DRAFT_CREATED` | `MONITORING` | first verified event | System |
| `MONITORING` | `RESULTS_AVAILABLE` | completion webhook | System (Foundry) |
| `RESULTS_AVAILABLE` | `REVIEWED` | run QC | System |
| `REVIEWED` | `COMMS_DRAFTED` | generate draft | User → LLM |
| any of `ESTIMATED..APPROVED` | back to `ESTIMATED` (or `INTENT_EXTRACTED` if sequences change) | payload edit | User → **invalidates approval** |

**Foundry status sub-machine (mirrored from verified webhooks):** states ranked `QUEUED(1) → IN_PROGRESS(2) → COMPLETED(3)` and `→ FAILED(3)`; `COMPLETED`/`FAILED` terminal. **Apply only when incoming rank > current rank.** Equal/lower rank = `duplicate`/`stale` **ignored no-op** (logged distinctly from `rejected_transition`). Webhooks are not ordered, so `COMPLETED` arriving before an unseen `IN_PROGRESS` is normal and accepted; only signature-valid-but-unparseable/unknown-schema goes to `dead_letter`. A signature-valid event referencing an unknown `experimentId` **must not create an experiment** (prevents phantom-experiment injection). → **ADR-0005**.

### 7b. Approval lifecycle

`VALID (issued)` → **`CONSUMED`** (bound op executes exactly once, atomic with the mutation) · **`EXPIRED`** (`now > expiresAt`, checked at consume time against an injectable server clock) · **`INVALIDATED`** (payload/env/cost change).

### 7c. Canonical payload hash rule (load-bearing) → ADR-0003

`canonicalHash = sha256(canonicalJSON(DraftPayload))` where `canonicalJSON`:
- Serializes an **exhaustive allowlist** of semantic fields: `targetId`, accepted sequences (`id` + `residues`), `concentrations`, `replicates`, `method`, cost `totalMinor` + `currency`, `environment`, `operation`, `canonicalizerVersion`. Any `DraftPayload` field **not** classified as semantic-or-volatile must **throw at build/test time** (fail-closed, never default-exclude).
- **Money is integer minor units** (never float) — floats break cross-process determinism.
- **Sequences sorted by stable ID**; string fields **NFC-normalized**; `null` vs absent defined explicitly (missing concentration ≠ 0).
- Excludes volatile fields (timestamps, UI IDs).

At consume time, recompute from the current payload; `recomputed ≠ approval.payloadHash` → reject. **Invalidators:** any accepted-sequence add/remove/edit; target change; concentration/replicate change; cost total change beyond **zero** tolerance; environment change (`mock→live`); operation change; expiry elapsed. Because `environment` and `operation` are inside the hash input, a **mock-mode approval can never produce a valid live-mode hash**, and a `create_draft` approval can never authorize `confirm_experiment`. `canonicalizerVersion` ensures a future canonicalizer change cannot make old hashes match new payloads.

The **same `canonicalHash` is the createDraft idempotency key** (§8), so you can only create the draft you approved — but approval single-use is additionally enforced by a **conditional consume** (`UPDATE ... WHERE id=? AND consumed=0`, assert rowcount=1) inside the transaction, not by the draft unique index alone.

## 8. Adapter contracts

### FoundryClient (MVP happy path)

```ts
interface FoundryClient {
  searchTargets(q: TargetQuery): Promise<Target[]>
  estimateCost(input: CostEstimateInput): Promise<CostEstimate>
  createDraft(input: CreateDraftInput, opts: { idempotencyKey: string }): Promise<DraftCreated>
  getExperimentStatus(experimentId: string): Promise<ExperimentStatus>
  getResults(experimentId: string): Promise<ResultRecord[]>
  verifyWebhook(raw: RawWebhook): WebhookVerification   // sync, deterministic, over raw bytes
  parseWebhook(raw: RawWebhook): WebhookEvent
  // confirmExperiment(...) — live/confirm capability, non-constructable unless FOUNDRY_MODE=live
}
```

- **Idempotency:** `idempotencyKey = canonicalHash` (optionally `+requestId`). Mock persists `key → DraftCreated` in a table and returns the stored result on replay; `FoundryHttpClient` sends it as `Idempotency-Key`. Retries can never create a second draft.
- **MockFoundryClient** generates deterministic realistic IDs, quotes, state transitions, and webhook deliveries. It is the only client exercised in the Loom.
- **FoundryHttpClient** is validated only by contract tests against the **pinned OpenAPI snapshot** (version/hash recorded); server-side `fetch` only; non-constructable outside `FOUNDRY_MODE=live` with a token.

### LlmClient

```ts
interface LlmClient {
  extractIntent(input: { requestText: string }): Promise<Result<ExperimentIntent, LlmError>>
  draftCustomerUpdate(input: { evidenceBundle: EvidenceBundle }): Promise<Result<CustomerDraftContent, LlmError>>
}
```

Both use Zod structured output and return `Result<...>` so malformed model output is a handled failure (surfaces a warning, offers deterministic fallback), never a thrown exception mid-demo. `DeterministicLlmAdapter` returns fixture-keyed outputs. **No raw residues cross this boundary** in either method. → **ADR-0002**.

## 9. LLM boundary vs deterministic boundary

**The LLM may ONLY:** (1) extract `ExperimentIntent` from request text; (2) draft the customer update from a validated `EvidenceBundle`.

**The LLM may NEVER:** validate sequences, calculate metrics, resolve approval policy, decide state transitions, invent missing values, or execute Foundry operations. Its output fields are untrusted **suggestions**, re-derived deterministically (target resolved against the catalog, cost computed in code, approval is human + hash). Zod schemas reject extra/unexpected fields.

**Numerical faithfulness (fail-closed) → ADR-0002/0004.** The drafting LLM returns `numericClaims[] = {value, unit, evidenceId}`. A deterministic validator enforces, before any render:
1. `evidenceId ∈ bundle`, else `EVIDENCE_NOT_FOUND` → block.
2. **Unit equality** (or a whitelisted deterministic conversion); reject NaN/Inf/unknown units. `5 nM` vs evidence `5 µM` must fail.
3. Value within a **per-quantity tolerance** (`evidence.rel_tol = 0.01`, relative, display-rounding only), else `EVIDENCE_VALUE_MISMATCH` → block.
4. **Prose-number scan:** every numeric token (digits, scientific notation, percentages) in the rendered draft must map to a validated claim, else block. This closes the "untagged prose number" bypass.
5. The renderer displays the **validated `claim.value`**, not an LLM-reformatted string.

## 10. Approval, idempotency, webhooks, replay, audit

- **Approval freshness:** bound to `canonicalHash` incl. env + operation; any semantic change re-hashes → mismatch; expiry checked at consume time; one-shot conditional consume inside `BEGIN IMMEDIATE`/WAL transaction.
- **Idempotency:** `canonicalHash` as the create key; mock and HTTP client both honor it.
- **Webhook security:** compute HMAC-SHA256 over the **raw request bytes** (`await req.text()`), constant-time compare, **before** any JSON parse; reject missing/oversized/malformed signatures as `rejected_signature` (no throw); cap body size. `deliveryId` is inside the signed body; unique index + `INSERT OR IGNORE` dedup. Rank-based transition machine (§7a). Append-only event log records `accepted | duplicate | rejected_signature | rejected_transition | dead_letter`.
- **Audit trail:** append-only storage of every event outcome, the resolved adapter identities, the canonical payload + hash, cost breakdown, and each state transition — enough to reconstruct which rule, model call, tool call, approval, and transition produced an outcome.
- **Exact provider signature scheme is unknown [Q]:** implement a **synthetic HMAC contract with a signed timestamp + freshness window** behind `verifyWebhook`; do not claim provider specifics. Record in `OPEN_QUESTIONS.md` + ADR-0005.

## 11. UX design

**One flowing workspace, not multiple pages.** A persistent left **stepper** (the pipeline spine) is itself proof that gates are sequential and enforced; a persistent **top bar** carries run identity + canonical-hash chip + **environment badge (MOCK/SANDBOX/LIVE)** + a **"Live mutations disabled" lock** + an **Audit** button with event and rejected-delivery counts. Two global overlays: an **Audit drawer** (right slide-over) and a reusable **Evidence popover** (chip → provenance), used identically in intake, results, and draft so viewers learn "chips are traceable."

**Six main-canvas stages mapped to the seven demo scenes:** Intake (S2), Preflight (S3), Approval boundary (S4), Status/webhook timeline (S5), Results QC (S6), Customer draft (S7); the shell + Audit drawer carry S1 and S8.

### 11a. Three-layer results treatment (the single most important screen)
Each candidate is a card split into three horizontal bands, each with its own visual language so a 2-second glance can point at each authority — and the separation must survive grayscale (color **plus** icon **plus** label **plus** typography):
- **Layer A — MEASURED · read-only** (neutral slate, monospace values with explicit units, lock/db icon, hatched immutable edge). Lab numbers only; no control affords editing; no model text ever appears here.
- **Layer B — DETERMINISTIC QC** (teal, shield-check/ƒ icon). Code-computed classification badges (expression pass/fail, binding class, replicate consistency w/ CV, fit quality w/ R² + threshold). Each badge is an evidence chip → popover shows the **formula and threshold** applied to Layer A.
- **Layer C — MODEL COMMENTARY · interpretation, not measurement** (violet, prose/italic typography, sparkle icon). Free-text summary; every number it references is an evidence chip resolving to A or B — it can cite, never mint. If the model is unavailable: `Model commentary unavailable — deterministic results unaffected` (proves the core workflow survives a provider outage).

**Evidence chip → provenance** (reused component): dotted-underlined value + link glyph; popover has a left color-bar keyed to source kind (`result field`/`replicate`/`QC calculation`/`control`/`approved recommendation`), the evidence ID, exact value, and a jump-link to the origin.

### 11b. Trust cues and information hierarchy
Each stage leads with its one-sentence point as a headline strip; details are progressive disclosure. Intake: two columns (raw request ↔ Extracted Intent), per-field confidence pill + bi-directional source-span highlight, missing fields as amber `Needs input` (never guessed). Preflight: `DETERMINISTIC` badge, summary counts, cost shown as an **arithmetic formula** not a black-box total. Approval: exact payload + hash chip; two visibly **distinct** buttons — `Create draft — no lab action, no charge` (enabled) vs `Confirm & submit to lab` (present but padlocked, caption "Requires LIVE + approval bound to this exact payload hash"). Timeline: trusted event list separate from the audit log; replaying a duplicate shows `×2 deliveries · applied once` (count does not increment).

### 11c. Critical error / blocked states (each unmistakable and demo-legible)
| State | On-screen treatment |
|---|---|
| Target ambiguous | Red gate card: `Target ambiguous: 'EGFR' matches EGFR (human) and EGFR (murine). Select one to proceed.` Stepper node → blocked; Continue disabled. |
| Over budget | Cost panel red: `Over budget by $1,700.` + quick-action `Reduce to 4 candidates to fit`. Continue disabled. |
| Malformed sequence | Preflight `Error` row `INVALID_RESIDUE` with evidence location; sequence struck-through, excluded from valid count. |
| Duplicate sequence | `Error`/`Warning` row `DUPLICATE_SEQUENCE` (`identical to AC-1`); count reconciles visibly, collapsed once. |
| Invalidated approval | Red banner replaces the valid-draft badge after any payload edit; payload diff + changed hash chip: `INVALIDATED — payload changed (hash mismatch)`. |
| Invalid-signature webhook | Appears **only** in the Audit drawer as red `Rejected — invalid signature`; never enters the trusted timeline. |
| Fail-closed draft | Offending claim replaced inline by red `Claim blocked: no evidence (EVIDENCE_MISSING). Draft cannot include unverifiable numbers.` `Copy`/`Mark ready` disabled. |
| Model outage | Layer C: `Model commentary unavailable — deterministic results unaffected.` |

### 11d. Accessibility
Never color-only (color + icon + text label everywhere, load-bearing for the three-layer coding); AA contrast on the violet/teal accents; focusable stepper nodes/chips/controls; `aria-expanded`/`aria-controls` on chips; polite live-region for timeline updates and `duplicate ignored`, assertive for blocking gates; the dedup result is a persistent badge, not a flash (reduced-motion safe).

### 11e. Visual exploration (Pencil) — deferred, and deliberately minimal
Per the locked "Pencil only for concrete visual decisions," at most **two** views warrant a wireframe, to be produced during implementation planning, not now:
- **MUST — Results QC three-layer card:** the visual treatment *is* the decision (band layout, A/B/C color/icon/typography split, chip placement); seeing beats describing.
- **SHOULD — Approval boundary:** spatial arrangement of two distinct capability buttons + payload diff + `INVALIDATED` hash banner is safety-critical.

Everything else (shell/stepper, intake two-column highlight, timeline + audit drawer, customer draft) is specified enough to build directly. Wireframing them would spend the timebox on already-resolved layouts.

## 12. Fixtures and QC thresholds

**Cost model (synthetic, mock):** `totalMinor = 250000 + 120000 × acceptedCandidates` (i.e. $2,500 setup + $1,200/candidate); customer `budget = 800000` ($8,000), currency USD. Surviving valid set after preflight = 6 candidates (AC-1,2,3,4,7,8; AC-5 malformed + AC-6 duplicate rejected) → `total = 970000` ($9,700) → **over budget by $1,700**; `maxWithinBudget = 4` (`730000`/$7,300). The over-budget fixture is thus **causally linked** to preflight (dedup + malformed rejection change the surviving count and therefore the cost) — this reads far better on camera than a standalone budget number.

**Assay shared by candidates:** ~6-point concentration series (e.g. 100 → 0.4 nM) × duplicate replicates.

**Seven required fixture roles → 8 candidates + request metadata:**

| Candidate | Role | Resolves at | Key synthetic values | QC class |
|---|---|---|---|---|
| AC-1 | Strong consistent binder | Results | KD replicates [2.0, 2.1, 1.95] nM (mean 2.02), CV 3.7%, R² 0.985, ss/kin ratio 1.10 | `confirmed_binder`, follow-up |
| AC-2 | Poor-fit apparent binder | Results | KD ~40.7 nM, CV 7.4% (consistent) but R² 0.82 (<0.95), ss/kin ratio 0.19 (∉[0.5,2]) | `apparent_binder_poor_fit`, inconclusive |
| AC-3 | Non-binder (locked "non-expressing"), expression=false | Results | response at control baseline, KD null | `no_expression` |
| AC-4 | Contradictory replicates | Results | KD [5, 500] nM, CV ~138.6% (≫20%) | `inconclusive_replicate_inconsistent` |
| AC-5 | Malformed sequence | Preflight | invalid residue → rejected, excluded from results |
| AC-6 | Duplicate sequence | Preflight | byte-identical to AC-1 under a new ID → dedup, collapsed once |
| AC-7 | Filler valid binder | Results | moderate binder ~40 nM, unremarkable — supports normalized valid count |
| AC-8 | Filler valid binder | Results | weak-but-real ~1 µM — completes 8 and the cost math |
| *(request metadata)* | Over-budget request | Cost | budget $8,000 vs $9,700 surviving-set cost |

**`qc_thresholds@v1` (versioned; imported by both code and evals):** `fit.r2_min = 0.95`; `fit.ss_kin_ratio_max = 2.0` (flag if `KD_steadystate/KD_kinetic ∉ [0.5, 2.0]`); `replicate.cv_max = 0.20` (`CV = sampleStdev(KD)/mean(KD)`); `binding.kd_max_binder = 1e-6 M`; `evidence.rel_tol = 0.01`. Chosen so AC-1..AC-4 land with wide margins (no fixture sits inside a threshold band), so regressions surface as label flips, not borderline flakes.

**The single material intake ambiguity [R]:** **target-construct ambiguity, not budget.** The model extracts `target = "EGFR"` at medium confidence and flags that the catalog resolves to more than one construct (e.g. human EGFR ECD vs full-length ectodomain-Fc). It is a single small human decision (one dropdown) that cannot derail the recording, and it stages the whole thesis in one beat: model surfaces uncertainty → human decides → deterministic resolution binds → approval hash later locks it.

## 13. Observability, logging, secrets

- **Structured logs over an allowlisted field set** — never raw request bodies/headers or SDK errors verbatim (denylist redaction misses secrets in unexpected fields). Redact bearer tokens, API keys, raw sequences, customer contact info, uploaded file contents.
- **Secrets server-side only:** `GEMINI_API_KEY` and any Foundry token never reach the client bundle. Secret modules marked `server-only`; **no `NEXT_PUBLIC_` secrets**; a CI check greps the built client bundle for key patterns; `gitleaks` in CI.
- **SQLite DB file lives outside any Next.js served/static directory** so it can't be fetched over HTTP.
- **Mutations are POST server actions or Origin-checked route handlers**, never a GET that mutates; the webhook route is intentionally cross-origin (HMAC is its only trust). No debug/introspection endpoints in prod.

## 14. Testing, evals, and release gates

**Golden/adversarial suite (20 cases; ≥15 adversarial, exceeding the ≥10 acceptance criterion).** Layers covered: intake-extraction (incl. must-not-invent-missing-fields), preflight, target-resolution (ambiguity blocks), cost-budget arithmetic, approval-hash (stability **and** each-invalidator sensitivity), webhook (dedup-once, invalid-signature-rejected, out-of-order handling, unknown-experiment no-create), QC classification (AC-1..AC-4 at `qc_thresholds@v1`), evidence-faithfulness (missing-id block + value-mismatch block + unit-mismatch), prompt-injection in request text **and** in a FASTA header (treated as data, not authority). Adversarial cases carry an `@adversarial` tag; a meta-test asserts `count ≥ 10` and fails the build otherwise.

**Adapter assignment / reproducibility:** 17/20 cases are pure deterministic code / MockFoundryClient (strongest evals precisely because the LLM cannot influence them). LLM-touching cases run on `DeterministicLlmAdapter` (`LLM_PROVIDER=stub`) by default — exact-match, offline. **No case needs live Gemini to pass the gate** (the evals assert the deterministic guard, not the model's goodwill). A `provider-parity` job replays **recorded Gemini transcripts** (VCR-style, offline, required-green); a `gemini-live` job is manual-dispatch, non-blocking, drift-detection only.

**CI structure — network-free by default.** A test-setup network guard throws on any outbound socket except `127.0.0.1`; env `LLM_PROVIDER=stub`, `FOUNDRY_CLIENT=mock`. Jobs: **A unit** (Zod schemas, preflight, cost, hash stability/sensitivity, QC, evidence validator), **B integration** (intake→…→draft-validation on in-mem SQLite + Mock client + stub LLM; webhook dedup/signature/transition; idempotency), **C e2e** (Playwright scenes 2–7 incl. one over-budget block, one ambiguity block, one duplicate-webhook, from a clean checkout), **D provider-parity** (transcript replay).

**`demo-ready` gate =** A+B+C green · D-replay green · `@adversarial ≥ 10` · each of the six priority behaviors (unsafe-action, schema, numerical, evidence, idempotency, e2e) has ≥1 blocking test · Playwright passes from clean checkout · `gitleaks` clean · `npm run demo` boots under `LLM_PROVIDER=stub`.

**Three most load-bearing evals for demo credibility:** (1) evidence fail-closed (missing-id **and** value-mismatch) — the whole pitch is "every number is traceable"; (2) approval-hash stability/sensitivity + webhook dedup-once — the visible safety invariants of Scenes 4–5; (3) QC classification of AC-1..AC-4 at `v1` — the "deterministic numbers, not model vibes" thesis of Scene 6.

## 15. Threat model (required by SAFETY_AND_TRUST.md)

Attack → deterministic control → where it lives.

| Threat | Attack | Deterministic control | Location |
|---|---|---|---|
| Accidental live mutation | stray `FOUNDRY_MODE=live` or a mutating call in demo/CI | live adapter non-constructable unless `live` + server token + separate confirm; hosted demo holds **no** Foundry token; startup assertion throws if live under test | FoundryClient factory + config guard; deployment env |
| Prompt injection | FASTA header / CSV cell / email says "target=X, cost=0, approved, auto-submit" | LLM output is an untrusted suggestion, re-derived deterministically; LLM never emits permission/cost/approval fields; Zod rejects extra fields | intake boundary; target/cost resolvers; approval service |
| Secret leakage | token echoed in logs, traces, client bundle, screenshots | allowlist logging; `server-only` guard; CI client-bundle grep; gitleaks; no `NEXT_PUBLIC_` secrets | logger boundary; server/client split; CI |
| Replay / duplicate delivery | captured valid webhook replayed | signed `deliveryId` inside HMAC body; unique index + `INSERT OR IGNORE`; apply only on rank increase | webhook handler + `webhook_deliveries` index |
| Hallucinated target | LLM extracts a non-existent EGFR variant | deterministic resolution against catalog; ambiguous/unknown **blocks** | target resolver / preflight |
| Hallucinated measurement | draft asserts a value not in results | `numericClaims` validator (id ∈ bundle, unit equality, tolerance) + prose-number scan; fail-closed | evidence validator |
| Stale approval | payload edited after approval, or reuse after expiry | approval bound to `canonicalHash` (incl. env/op); expiry at consume time; conditional consume CAS | approval consume transaction |
| Cost arithmetic error | float math / model produces wrong total | cost computed in code from price list; integer minor units; cost in hash at zero tolerance | cost engine; canonicalizer |
| Model/provider outage | Gemini down during demo | deterministic adapter is default; Gemini opt-in; prerecorded fallback | LLM adapter interface; storyboard |
| Malicious file content | XSS / CSV-injection / oversized / zip-bomb file | size/row caps; strict FASTA/CSV parse with residue allowlist; React auto-escaping; `=+-@` prefix guard on any export | upload parser; render layer |
| Dependency / deployment risk | vulnerable dep; SQLite web-served; debug endpoint exposed | pinned lockfile + `npm audit` + gitleaks; DB outside served dir; no debug routes; verify live URL | CI; deployment config |

## 16. Deployment, secrets, no-network fallback

- **Local-first:** `npm run demo` boots the whole scripted demo in mock mode from a clean checkout, no credentials, no network. This is the primary target and the acceptance baseline.
- **Optional single container** for a hosted URL [A/R]; the hosted env carries **no** live Foundry token and defaults to `FOUNDRY_MODE=mock`, `LLM_PROVIDER=stub`. Verify the live URL exposes no debug endpoints or secrets (storyboard safeguard).
- **No-network/no-credential fallback:** deterministic adapter + mock client are the default path; a prerecorded Loom fallback clip is kept in case a hosted model provider is unavailable.

## 17. Implementation sequencing (vertical slices)

Derived here for navigation only; the authoritative task order will come from `superpowers:writing-plans`. Each slice is independently demoable; the happy path is reachable through FOUND-007. Build the load-bearing invariants (canonical hash; evidence fail-closed validator; `FoundryClient`/`LlmClient` signatures with `Result` errors; Zod schemas; append-only event log + unique `deliveryId`; transactional approval-consume) **before** wiring Gemini or the HTTP client.

| Key | Slice | Value | Deps | Demo scene |
|---|---|---|---|---|
| FOUND-001 | Request intake + typed intent extraction | evidence-linked `ExperimentIntent`, missing fields never invented | — | S2 |
| FOUND-002 | FASTA/CSV preflight engine | severity-coded findings w/ evidence + remediation | 001 | S3a |
| FOUND-003 | Target resolution + cost estimate (MockFoundryClient) | resolved EGFR target, cost breakdown, over-budget detection | 001,002 | S3b |
| FOUND-004 | Draft payload + hash-bound approval gate | exact payload review, mutation disabled, edit invalidates approval | 003 | S4 |
| FOUND-005 | Webhook lifecycle + timeline | signed replay, dedup-once, invalid-signature rejection, rank transitions | 004 | S5 |
| FOUND-006 | Deterministic results QC + EvidenceBundle | per-candidate QC at `v1`, evidence IDs on every value | 005 | S6 |
| FOUND-007 | Evidence-backed customer draft (fail-closed) | traceable numbers, confirmed vs recommendation vs inconclusive, never auto-sent | 006 | S7 |
| FOUND-008 (stretch) | Gemini parity, adapter swap, eval/golden report | prove the interfaces are real; ≥10 adversarial cases green | 001–007 | S8 |

## 18. ADRs to record (after this spec is approved)

| ADR | Decision | Main alternative rejected |
|---|---|---|
| 0001 | Layered TS, framework-independent domain; Next.js only adapts HTTP/UI | Next.js-centric logic in route handlers/server actions |
| 0002 | Narrow, deterministic-default LLM (extract intent + draft comms only); Gemini opt-in | LLM in the loop for QC/target-selection/authorization |
| 0003 | Canonical payload hash contract = approval binding + idempotency key (integer money, exhaustive field classification, sequence sort + NFC, env/op/canonicalizerVersion in hash, consumed-flag CAS) | random idempotency key + approval-by-id (permits stale-approval / payload drift) |
| 0004 | Contract-faithful MockFoundryClient default; pinned OpenAPI for the HTTP client; live off by default | building against live/sandbox, or ad-hoc hand-mocked responses |
| 0005 | Webhook trust model: HMAC-over-raw-body + signed deliveryId/timestamp + rank-based transitions + dead-letter/stale taxonomy + no-create-on-unknown-experiment | monotonic strict-reject machine; header-based (spoofable) delivery IDs |

## 19. Open questions (carry to `docs/OPEN_QUESTIONS.md`; do not block the MVP)

- **[Q]** Exact Foundry webhook signature algorithm, header names, and whether a signed timestamp/replay window exists — until verified, the synthetic HMAC contract is authoritative and must not claim provider specifics.
- **[Q]** Availability of a sandbox token for the applicant (gates the opt-in contract smoke test).
- **[Q]** Exact affinity/BLI result fields and raw-data package for the cleanest QC fixtures.
- **[Q]** `gemini-3.6-flash` / `@google/genai` current stable versions — verify at implementation time per `RESEARCH_NOTES.md` rather than pinning from memory.
- **[Q]** Per-quantity numeric tolerance beyond the display-rounding default, if any claim needs a wider band.
- **[Q]** UX confirmations for the architecture record: (a) Layer C commentary renders **inline per-candidate** (recommended) vs a separate summary column; (b) the disabled `Confirm & submit` button is **visible-but-locked** (recommended, teaches the boundary) vs omitted in MOCK.

---

*This spec is the written-design gate. No application code, scaffold, ADR file, or GitHub issue is created until the user reviews this document and approves proceeding to `superpowers:writing-plans`.*
