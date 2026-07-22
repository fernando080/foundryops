# Item 3 — Atomic config edit → payload regeneration → approval invalidation

## Status
DONE

## Vulnerability closed
Previously the edit-replicates flow was two independent server actions
(`updateReplicatesAction` then `prepareRequestAction`). Between those two
calls a request could sit in `READY_FOR_APPROVAL` with the OLD payload and a
still-`valid` approval — a stale-approval window an operator (or a second
browser tab) could exploit to create a draft against outdated replicate
counts. There was no server-side atomicity guarantee across the two calls.

## State model settled on for edit → reissue
- `READY_FOR_APPROVAL`: persisted payload has a matching valid approval.
  Reachable via the original estimate/target/candidate flow
  (`prepareRequestAction` → `requestApprovalAction`), or via reissue after a
  `REMEDIATED` edit.
- `REMEDIATED`: persisted payload was atomically regenerated (new version,
  new hash) and every previously-valid approval for the request was flipped
  to `invalidated` in the same transaction. A `REMEDIATED` request has a
  correct, current payload but no usable approval — `createDraftUseCase`
  cannot succeed against it (it requires `READY_FOR_APPROVAL`).
- `DRAFT_CREATED`: terminal for this flow; `requestApprovalAction` explicitly
  excludes it (not in `REISSUABLE_STATES`), so a completed draft can never be
  re-approved or silently reopened.
- Reissue (`requestApprovalAction`) accepts `READY_FOR_APPROVAL` OR
  `REMEDIATED`, and atomically (1) inserts the fresh approval row bound to
  the current payload hash/version, and (2) sets/confirms
  `READY_FOR_APPROVAL` — both in one `db.transaction`. There is no
  intermediate state where a fresh approval exists without the request being
  marked ready, or vice versa.

## Changes
- `src/infrastructure/repositories/index.ts`: added `setRequestIntent`,
  `invalidateApprovals` (bulk `UPDATE approvals SET status='invalidated'
  WHERE request_id=? AND status='valid'`), `getApprovalStatus`.
- `src/application/editConfig.ts` (new): `editReplicatesUseCase` — single
  `db.transaction` that validates `expectedVersion` (optimistic concurrency,
  `STALE_VERSION` on mismatch), validates `newReplicates` (1–10 integer),
  updates the persisted intent (best-effort, only if present), regenerates
  the `DraftPayload` (bumps `version`, recomputes `payloadHash`), persists
  it, invalidates all previously-valid approvals for the request, sets
  `requestState='REMEDIATED'`, and appends a `config_edit` audit event — all
  atomically. An `afterWrites` test hook lets the transaction be forced to
  throw after writes to prove rollback; any thrown error inside the
  transaction is caught and reported as `ROLLED_BACK` with no partial state
  persisted (`better-sqlite3` transactions roll back automatically on throw).
- `src/app/actions/edit.ts`: replaced `updateReplicatesAction` with
  `editReplicatesAction(requestId, expectedVersion, newReplicates)`, a thin
  wrapper over `editReplicatesUseCase(getSharedDb(), ...)`.
- `src/app/actions/approval.ts` (`requestApprovalAction`): broadened the
  readiness check from `requestState !== 'READY_FOR_APPROVAL'` to a
  `REISSUABLE_STATES = new Set(['READY_FOR_APPROVAL', 'REMEDIATED'])`
  membership check, and wrapped `insertApproval` + `setRequestState(...,
  'READY_FOR_APPROVAL')` in one `db.transaction` so the fresh approval row
  and the state transition land together. `DRAFT_CREATED` (and any other
  state) is rejected with `NOT_READY`, unchanged from before.
  `createDraftAction` / `createDraftUseCase` were left untouched — still
  strictly require `READY_FOR_APPROVAL`.
- `src/components/ApprovalStage.tsx`: `handleReplicatesChange` now makes ONE
  call, `editReplicatesAction(requestId, version, next)` (the component's
  `version` state doubles as the tracked `expectedVersion` — it's set from
  every prior approval/edit/reissue result), instead of the previous
  `updateReplicatesAction` → `prepareRequestAction` pair. Removed the now-
  unused `prepareRequestAction` import. All existing `data-testid`s
  (`edit-replicates`, `approval-invalidated`, `reissue-approval`,
  `hash-chip`, `create-draft`, `confirm-submit`, `draft-created`) and the
  invalidated/reissue/create-draft UI logic are unchanged.
- `tests/editConfig.integration.test.ts` (new, verbatim per task spec): 4
  tests — stale version rejected with no side effects, successful edit
  invalidates the old approval and leaves the request unable to draft,
  injected post-write fault rolls back everything, successful edit lands in
  `REMEDIATED` with bumped version.

No changes were needed to `src/application/createDraft.ts`,
`src/app/actions/prepare.ts`, or `src/components/Workspace.tsx` — the
original estimate → target/candidates → `prepareRequestAction` →
`requestApprovalAction` first-approval path is untouched; only the
edit/reissue path changed.

## TDD evidence
- RED: `npx vitest run tests/editConfig.integration.test.ts` before
  `src/application/editConfig.ts` existed → failed to resolve
  `@/application/editConfig` (suite could not even load).
- Implemented repo helpers + `editReplicatesUseCase`.
- GREEN: `npx vitest run tests/editConfig.integration.test.ts` → 4/4 passed.

## Verification
- `npx vitest run tests/editConfig.integration.test.ts tests/createDraft.integration.test.ts tests/repositories.test.ts` → 3 files / 10 tests passed.
- `npm run test` (full suite) → 27 files / 107 tests passed, no regressions.
- `npx tsc --noEmit` → 0 errors.
- `npm run build` → compiled successfully, static pages generated, no lint/type failures.
- `npm run test:e2e` (Playwright, full demo flow including
  request-approval → capture hash → edit-replicates → approval-invalidated
  → reissue-approval → hash changed → create-draft → draft-created, then
  timeline/webhook replay/results/customer-draft) → **1 passed** (57.1s),
  no assertion or wiring changes needed — the existing e2e spec's edit→
  reissue sequence passed unmodified against the new atomic action.

## Concerns
None outstanding. One note for future scope: `editReplicatesUseCase` does
not recompute `costTotalMinor` (cost is a function of selected-candidate
count via `estimate()`, not of `replicates`, in the current domain model),
so cost is carried over unchanged from the prior payload on a replicates-only
edit — this matches the pre-existing cost model and required no behavior
change here.

## Report path
`.superpowers/sdd/item-3-report.md`
