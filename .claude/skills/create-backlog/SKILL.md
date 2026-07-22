---
name: create-backlog
description: Package an approved FoundryOps Superpowers spec and implementation plan into a small dependency-aware GitHub backlog without creating a competing plan.
disable-model-invocation: true
---
Create a GitHub-facing backlog from the approved design and implementation plan.

## Preconditions

- Read `CLAUDE.md`, the approved design under `docs/superpowers/specs/`, the approved plan or plans under `docs/superpowers/plans/`, relevant ADRs, and product/safety documents.
- Confirm the user has approved both the written spec and the written implementation plan.
- If either gate is missing, stop. Do not infer approval and do not redesign the system inside the backlog.

## Backlog shape

- Derive issues from the plan's independently reviewable deliverables.
- Prefer 5–8 executable vertical-slice issues for this take-home, plus at most 2–3 epics when they materially improve navigation.
- Keep detailed code steps in the Superpowers plan. Link each issue to the exact plan heading instead of duplicating or drifting from it.
- Use stable keys `FOUND-001`, `FOUND-002`, and so on.
- Make dependencies reflect the approved critical path.

Suggested slices, adjusted to the approved plan:

1. foundation, pinned contracts, domain model, and offline adapter,
2. intake and deterministic preflight vertical slice,
3. target/cost resolution and approval-safe draft creation,
4. webhook-driven status timeline and idempotency,
5. result normalization, QC, and evidence provenance,
6. evidence-backed customer draft,
7. observability, eval gates, deployment, and demo polish.

## Every issue body

Write a Markdown file in `planning/issues/` containing:

- stable hidden marker: `<!-- foundryops-key: FOUND-NNN -->`,
- link to the approved spec and exact implementation-plan section,
- context and user value,
- scope and explicit non-goals,
- acceptance criteria as checkboxes,
- tests and evals,
- dependencies/blockers,
- security/data notes,
- demo impact,
- documentation changes,
- definition of done.

## Machine-readable manifest

Write `planning/backlog.json` following `planning/backlog.schema.json`. Set `status: "approved"` only after the user approves the proposed issue map.

First present the issue map, mapping to plan sections, and critical path for review. Do not create GitHub labels, issues, projects, branches, commits, or PRs. Publication remains a separate explicit step.
