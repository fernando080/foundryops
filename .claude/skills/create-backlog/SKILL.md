---
name: create-backlog
description: Convert the approved FoundryOps architecture and delivery plan into small, dependency-aware GitHub issue specifications plus planning/backlog.json. Use after planning documents are approved and before implementation.
disable-model-invocation: true
---
Create the implementation backlog from approved planning artifacts.

## Preconditions

- Read `CLAUDE.md` and all product/planning/ADR documents.
- Confirm architecture, stack, UX, eval strategy, and delivery plan are marked `approved`.
- If they are not approved, stop and report the missing decision gates. Do not infer approval.

## Backlog shape

Use vertical slices and stable keys `FOUND-001`, `FOUND-002`, and so on. Keep each implementation issue small enough for one focused branch and PR. Separate epics from executable tasks.

Recommended phase order, adjusted to the approved architecture:

1. repository/tooling and pinned API contract,
2. domain model and contract-faithful mock,
3. intake plus deterministic preflight vertical slice,
4. target/cost resolution and approval flow,
5. status/webhook/idempotency,
6. result normalization and QC,
7. evidence-backed customer draft,
8. UI trust states and end-to-end polish,
9. observability and eval gates,
10. deployment, documentation, and Loom fixtures.

## Every issue body

Write a Markdown file in `planning/issues/` containing:

- stable hidden marker: `<!-- foundryops-key: FOUND-NNN -->`,
- context and user value,
- scope,
- explicit non-goals,
- acceptance criteria as checkboxes,
- tests and evals,
- dependencies/blockers,
- security/data notes,
- demo impact,
- documentation changes,
- definition of done.

Avoid vague issues such as “build backend” or “add AI.”

## Machine-readable manifest

Write `planning/backlog.json` following `planning/backlog.schema.json`. Include:

- `status: "approved"` only after the user has approved the proposed issue set,
- epics and tasks,
- labels,
- parent keys,
- dependency keys,
- body file paths,
- priority and estimated effort.

First present the issue map and critical path for review. Do not create GitHub labels, issues, projects, branches, commits, or PRs. Publication is a separate explicit step.
