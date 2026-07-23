# Development process

FoundryOps was built with **Claude Code** and the **Superpowers** workflow. The repository started planning‑first — enough product and domain context to design the architecture, stack, UX, safety model, and evaluation strategy **before** any application code — and then implemented that plan with test‑driven development.

## Workflow of record

1. **Discovery & design** — `superpowers:brainstorming` (one question at a time, staged domain‑reviewer agents). The written design is the source of truth under `docs/superpowers/specs/`.
2. **Implementation planning** — `superpowers:writing-plans` produced the task‑by‑task TDD plan under `docs/superpowers/plans/`.
3. **Execution** — `superpowers:subagent-driven-development`: a fresh implementer subagent per task, TDD (red → green → refactor), a task review after each, and a whole‑branch review at the end. Isolated work happened in git worktrees (`superpowers:using-git-worktrees`).
4. **Verification & review** — `superpowers:verification-before-completion`, `superpowers:requesting-code-review` / `superpowers:receiving-code-review`, and `superpowers:finishing-a-development-branch`.

The canonical design + plan are:

- `docs/superpowers/specs/2026-07-22-foundryops-mvp-design.md`
- `docs/superpowers/plans/2026-07-22-foundryops-mvp.md`

Product context lives in `docs/PROJECT_BRIEF.md`, `docs/PRODUCT_SPEC.md`, `docs/SAFETY_AND_TRUST.md`, `docs/DEMO_STORYBOARD.md`, `docs/RESEARCH_NOTES.md`, and `docs/OPEN_QUESTIONS.md`. The templates under `docs/planning/` are **non‑authoritative** human summaries; accepted consequential choices belong in ADRs under `docs/adr/`.

## Runtime & dependency policy

- **Tested & recommended runtime: Node.js 22.23.1 LTS** (pinned in `.nvmrc`); `package.json` `engines` requires `^22.12.0 || ^24.0.0` and `packageManager` is pinned to `npm@10.9.8`.
- The dependency versions and `package-lock.json` are the exact set verified by the gate and are **not** migrated during this take‑home: Next.js 15.5.x (Maintenance LTS), React 19, TypeScript 5.9, Vitest 4 / Vite 6, better‑sqlite3 12.11.x, Zod 4, Drizzle. No migration to Next 16 / TypeScript 7 / Vite 8 / better‑sqlite3 13 — those add no demo value and introduce avoidable ecosystem/native‑addon risk.
- After switching Node: `npm ci` against the committed lockfile — do not regenerate the dependency graph.

## Hard rule

Deterministic code enforces truth, permissions, numbers, and state; the model only interprets and drafts. Unresolved assumptions belong in `docs/OPEN_QUESTIONS.md`; accepted technical choices belong in ADRs.
