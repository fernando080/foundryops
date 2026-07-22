# Item 6 — Tighten evidence claim semantics

## Status
DONE

## Commit
(recorded below after commit) — feat(evidence): enforce claimType↔classification polarity; render draft as evidence chips

## Changes
- `src/domain/schemas/index.ts`: `EvidenceRecordSchema` gains optional `claimPolarity: z.enum(['confirmed','inconclusive']).nullish()`.
- `src/domain/evidence/bundle.ts`: new `CLASS_POLARITY` map; `ev_${cid}_class` record now carries `claimPolarity` derived from `qc.bindingClass` (confirmed_binder/no_detectable_binding/non_binder → confirmed; apparent_binder_poor_fit/inconclusive_replicate_inconsistent → inconclusive). `ev_${cid}_name` and numeric records unchanged (no polarity).
- `src/domain/comms/compose.ts`: `claimTypeMatchesKind` replaced with `claimTypeMatchesEvidence(claimType, ev)` — enforces polarity for `classification` records, keeps prior recommendation/non-recommendation gate otherwise.
- `src/adapters/llm/deterministic.ts`: `draftCustomerUpdate` looks up each candidate's `ev_${cid}_class` record and sets that segment's `claimType` to its `claimPolarity` (fallback `'confirmed'`); name/kd/reco segments unchanged.
- `src/components/DraftStage.tsx`: renders `draft.draft.segments` directly (text as text, evidence as `EvidenceChip` wrapped in `data-testid="draft-evidence-chip"`) instead of the flat `draft.rendered` string; now takes a `bundle` prop.
- `src/components/ResultsStage.tsx`: passes `bundle={data.bundle}` to `DraftStage`.

## Test summary
- New `src/domain/comms/claimSemantics.test.ts`: RED confirmed first (2/6 failing — cross-polarity cases), then GREEN after changes 1–4 (6/6).
- `npx vitest run src/domain/comms tests/results.integration.test.ts src/adapters/llm/deterministic.test.ts`: 14/14 passed. `results.integration.test.ts` stayed green without weakening — the deterministic adapter's class-segment fix (change 4) made AC-2/AC-4 self-consistent on first try, no fallback needed.
- Full suite: `npx vitest run` → 26 files / 103 tests passed.
- `npx tsc --noEmit` → 0 errors.
- `npm run build` → succeeds (Next.js 15.5.21, static export of `/`).

## DraftStage approach
Inline evidence chips (not the flat-string fallback): each evidence segment renders prefix + `EvidenceChip` (reused as-is, resolving against `bundle`) + suffix inside a `data-testid="draft-evidence-chip"` span; text segments render as plain spans. `data-testid="draft-rendered"` (container), `draft-not-sent-label`, `draft-blocked`, and `generate-draft` testids all preserved. `white-space: pre-wrap` on `.draft-prose` is inherited by child spans, so segment-level `\n` text still breaks lines as before.

## Concerns
None outstanding. Numeric values remain renderer-inserted only (unchanged, per scope).

## Report path
`.superpowers/sdd/item-6-report.md`
