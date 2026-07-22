---
name: architecture-sprint
description: Start the FoundryOps design workflow through Superpowers brainstorming, with staged reviews by the project product, architecture, security, evaluation, and UX agents.
disable-model-invocation: true
---
Start the FoundryOps design workflow. This command is a project-specific entrypoint, not a competing planning methodology.

## Required process

1. **REQUIRED SUB-SKILL:** Invoke `superpowers:brainstorming` before producing a design or implementation plan.
2. Read `CLAUDE.md`, all files under its **Read first** section, existing ADRs, and relevant recent commits.
3. Treat the existing product documents as informed hypotheses. Ask one clarifying question at a time and preserve Superpowers' approval gates.
4. During brainstorming, use the project agents as staged critics:
   - consult `product-planner` and `solution-architect` after the goals, constraints, and success criteria are clear;
   - consult `security-reviewer` and `eval-designer` against the proposed architecture before final design approval;
   - consult `ux-reviewer` once the workflow and trust boundaries are stable.
5. Synthesize their findings; do not paste five disconnected reports to the user.
6. Ensure the design covers the FoundryOps domain checklist below.
7. Save the approved written design under `docs/superpowers/specs/` and stop for the user's review of the actual file.
8. Only after that written-spec review is approved, continue with `superpowers:writing-plans`.

## FoundryOps design checklist

- convincing 4–5 minute MVP and explicit scope cuts,
- complete happy path plus critical failure paths,
- two or more viable stack/architecture options,
- domain types and experiment/approval state machines,
- LLM responsibilities versus deterministic boundaries,
- Foundry adapter plus contract-faithful offline mock,
- approval freshness, idempotency, signed webhooks, replay safety, and audit trail,
- evidence provenance and numerical-faithfulness rules,
- screens, trust cues, and optional visual exploration,
- observability, deterministic tests, agent evals, and release gates,
- deployment, secrets, fixtures, and no-network/no-credential fallback,
- ADRs and unresolved questions.

Do not independently generate a second architecture proposal in `docs/planning/`, write application code, scaffold the stack, publish GitHub issues, or skip directly to implementation.
