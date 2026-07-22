---
name: implement-issue
description: Plan and implement exactly one approved GitHub issue for FoundryOps with a linked branch, tests/evals, documentation, and a reviewable PR. Use with an issue number or URL after the backlog is published.
disable-model-invocation: true
argument-hint: [issue-number-or-url]
---
Implement exactly one issue: `$ARGUMENTS`.

## Before editing

1. Read `CLAUDE.md`, relevant planning documents, ADRs, and the full issue.
2. Inspect dependencies and confirm blockers are resolved.
3. Restate:
   - scope,
   - non-goals,
   - acceptance criteria,
   - architectural boundaries,
   - security implications,
   - test/eval plan,
   - files likely to change.
4. Start in plan mode or present a plan before edits.
5. Do not broaden the issue silently. Open or propose a follow-up issue for unrelated work.

## Branch and implementation

When approved, use a linked branch where available:

```bash
gh issue develop ISSUE_NUMBER --checkout
```

Implement the smallest complete vertical behavior. Keep third-party calls behind approved adapters and preserve mock-mode reproducibility.

## Verification

- Run formatting, linting, type checking, unit tests, relevant evals, and the affected end-to-end path.
- Update documentation and ADRs when needed.
- Compare the final diff with every acceptance criterion.
- Scan for credentials, real sequences, customer data, and accidental live-mode defaults.

## Completion

Summarize changes, commands run, test/eval results, residual risks, and any follow-up issues. Do not merge your own PR unless explicitly instructed.
