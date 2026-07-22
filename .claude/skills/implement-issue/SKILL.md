---
name: implement-issue
description: Execute one approved FoundryOps issue by delegating design, planning, worktree, TDD, review, verification, and branch completion to the corresponding Superpowers workflows.
disable-model-invocation: true
argument-hint: [issue-number-or-url]
---
Implement exactly one approved issue: `$ARGUMENTS`.

This command supplies FoundryOps-specific boundaries. Superpowers remains authoritative for the development process.

## Before editing

1. Read `CLAUDE.md`, the full issue, its referenced approved spec/plan sections, relevant ADRs, and resolved dependencies.
2. Restate scope, non-goals, acceptance criteria, security implications, test/eval obligations, and likely files.
3. If the issue introduces behavior not covered by the approved spec, **REQUIRED SUB-SKILL:** use `superpowers:brainstorming` and obtain approval before continuing.
4. If the referenced implementation-plan section is absent or materially stale, **REQUIRED SUB-SKILL:** use `superpowers:writing-plans` before touching code.
5. Do not broaden the issue silently; propose a follow-up issue for unrelated work.

## Isolated execution

- **REQUIRED SUB-SKILL:** use `superpowers:using-git-worktrees` before implementation, unless already in a verified isolated worktree for this issue.
- Execute the applicable approved plan tasks with `superpowers:subagent-driven-development`; use `superpowers:executing-plans` only when the user intentionally chooses a separate execution session.
- Implementers must use `superpowers:test-driven-development` for behavior changes.
- Preserve the contract-faithful mock path and keep live mutation disabled by default.

## FoundryOps verification

Run formatting, linting, type checking, unit/integration/contract tests, relevant agent evals, and the affected mock-mode end-to-end path. Compare the final diff against every acceptance criterion. Scan for credentials, real sequences, customer data, unsupported API fields, stale approvals, and accidental live-mode defaults.

Before any completion claim, **REQUIRED SUB-SKILL:** use `superpowers:verification-before-completion`. Then use `superpowers:finishing-a-development-branch` for the branch/PR decision. Do not merge unless explicitly instructed.
