# Item 2 — Webhook envelope validation

## Status
DONE

## Commit
2007be0d1b46a651fd47920b01bf2ef82ecd60ee — feat(webhook): validate complete experiment_update envelope with Zod wire schema (remove any)

## Changes
- `src/domain/webhook/wire.ts` (new): `FoundryUpdateWireSchema` (Zod), exact match to spec.
- `src/domain/webhook/envelope.ts`: `crossCheckHeaders` now checks only header/body agreement (event-literal check moved to schema).
- `src/application/ingestUpdate.ts`: rewritten — verify HMAC over raw bytes → JSON.parse → cross-check headers → full Zod envelope validation → map wire→domain → dedup + persist. No `any`.
- `tests/ingestUpdateEnvelope.integration.test.ts` (new): 8 tests covering accept, dedup, wrong event, wrong data.type, missing identifiers, malformed timestamp/api_version, header mismatch, signed-but-schema-invalid audit-only.

## TDD evidence
- RED: initial run of new test file → 5/8 failing (as expected, pre-rewrite).
- GREEN: `ingestUpdateEnvelope.integration.test.ts` + `ingestUpdate.integration.test.ts` + `webhook.test.ts` → 15/15 passed, no regressions.
- Full suite: 97/97 tests passed across 25 files.
- `npx tsc --noEmit` → 0 errors.
- `grep -n ': any\|as any\| any>' src/application/ingestUpdate.ts` → no matches.

## Conflicts
None. Existing `ingestUpdate.integration.test.ts` header-mismatch case already used a delivery-id mismatch (not the event field), so the narrowed `crossCheckHeaders` required no test weakening.

## Concerns
None outstanding.
