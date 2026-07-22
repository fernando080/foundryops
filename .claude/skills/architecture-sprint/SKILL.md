---
name: architecture-sprint
description: Run the FoundryOps planning sprint before implementation. Produces a reviewable architecture, stack comparison, UX plan, safety model, eval strategy, delivery plan, ADR list, and explicit decision gates.
disable-model-invocation: true
---
Run a planning-only architecture sprint for FoundryOps.

## Inputs

Read all files listed under **Read first** in `CLAUDE.md`, plus every existing file in `docs/planning/` and `docs/adr/`.

## Delegation

Use the project subagents in parallel where useful:

- `solution-architect`
- `product-planner`
- `security-reviewer`
- `eval-designer`
- `ux-reviewer`

Keep raw exploration in subagent contexts and synthesize one coherent recommendation.

## Required proposal

Return a reviewable proposal in the conversation before implementation work. Cover:

1. product/MVP boundary and explicit scope cuts,
2. system context and component architecture,
3. two or more viable stack options with a weighted decision matrix,
4. selected stack and rationale,
5. core domain types and state machines,
6. exact LLM responsibilities and deterministic boundaries,
7. Foundry API/SDK adapter and contract-faithful mock,
8. approval, idempotency, webhook, and audit design,
9. persistence and evidence model,
10. UI screens, states, and trust cues,
11. observability, tests, and eval release gates,
12. deployment, secrets, and offline/no-provider fallback,
13. critical path, milestone order, and scope cuts,
14. risks, assumptions, and open questions,
15. ADRs that should be created.

Use Mermaid diagrams where they improve clarity.

## Decision gates

End the proposal with a compact list of decisions that require human acceptance. Do not write application code. In plan mode, do not claim files were changed.

After explicit approval and file-write permission, persist the accepted plan into:

- `docs/planning/ARCHITECTURE.md`
- `docs/planning/STACK_DECISION.md`
- `docs/planning/UX_SPEC.md`
- `docs/planning/EVAL_STRATEGY.md`
- `docs/planning/DELIVERY_PLAN.md`
- new ADR files under `docs/adr/`
- `docs/OPEN_QUESTIONS.md`

Set each approved planning document status to `approved` and include the approval date. Do not start implementation automatically.
