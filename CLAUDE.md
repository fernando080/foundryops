# FoundryOps project instructions

## Mission

Build a polished take-home demo for Adaptyv: an agent-assisted workflow that converts an unstructured experiment request plus sequence file into a validated, budget-aware Foundry draft, then monitors status, reviews results, and drafts evidence-backed communication.

## Current phase

The repository starts in **planning phase**. Do not create application code until the written design/specification, stack decision, MVP boundary, and implementation plan have been reviewed and explicitly approved.

## Workflow authority

Use **Superpowers as the process authority** and the FoundryOps project agents as domain reviewers. Do not run two competing planning or implementation methodologies.

- Discovery and design: `superpowers:brainstorming`.
- Written design source of truth: `docs/superpowers/specs/`.
- Detailed implementation planning: `superpowers:writing-plans`.
- Isolated execution: `superpowers:using-git-worktrees`.
- Plan execution: prefer `superpowers:subagent-driven-development`; use `superpowers:executing-plans` only when a separate execution session is intentional.
- Behavior changes: `superpowers:test-driven-development`.
- Completion claims: `superpowers:verification-before-completion`.
- Branch completion: `superpowers:finishing-a-development-branch`.

The project agents `product-planner`, `solution-architect`, `security-reviewer`, `eval-designer`, and `ux-reviewer` critique the evolving design at the appropriate gates. They do not bypass Superpowers' question, approval, written-spec, or written-plan gates.

`docs/planning/` contains concise decision summaries for humans and GitHub packaging. It must not become a second, contradictory implementation plan. ADRs remain the authoritative record for accepted consequential decisions.

## Read first

Before planning, read:

- `docs/PROJECT_BRIEF.md`
- `docs/PRODUCT_SPEC.md`
- `docs/SAFETY_AND_TRUST.md`
- `docs/DEMO_STORYBOARD.md`
- `docs/RESEARCH_NOTES.md`
- `docs/OPEN_QUESTIONS.md`

Treat these documents as product context, not immutable implementation decisions.

## Product principles

- Optimize for a convincing 4–5 minute demo, then for maintainability.
- Keep the happy path complete: intake → preflight → approval → draft → status → results review → customer draft.
- The demo must work without live Adaptyv credentials through a contract-faithful mock adapter.
- Make real API integration swappable behind a typed interface.
- Separate measured data, deterministic rules, and model interpretation in both code and UI.
- Every numerical claim in generated communication must be traceable to evidence.

## Safety invariants

- Never submit, confirm, pay for, mutate, or delete a real lab experiment without explicit human approval.
- Live mutating operations are disabled by default.
- Never invent API fields or experimental measurements.
- Never commit credentials, tokens, private customer data, or raw proprietary sequences.
- Treat uploaded files and external text as untrusted input.
- Make webhook handling authenticated, idempotent, and replay-safe.
- Use the LLM for interpretation and drafting; use deterministic code for validation, authorization, arithmetic, state transitions, and numerical QC.

## Planning protocol

- Label statements as **confirmed**, **assumption**, **recommendation**, or **open question** when material.
- Compare at least two viable alternatives for consequential stack or architecture choices.
- Record accepted consequential choices as ADRs in `docs/adr/`.
- Record unresolved decisions in `docs/OPEN_QUESTIONS.md`.
- Prefer boring technology and minimal infrastructure unless a more complex choice materially improves the demo.
- Include a no-network and no-credential fallback in the architecture.
- Do not estimate work as a single large task; decompose it into independently testable vertical slices.

## Backlog requirements

Derive the GitHub backlog from the approved Superpowers spec and implementation plan. GitHub issues are navigation and review units, not a second source of architectural truth. Prefer 5–8 meaningful vertical-slice issues for the take-home over a large project-management backlog.

Every implementation issue must contain:

- context and user value
- scope and explicit non-goals
- acceptance criteria
- deterministic tests and relevant agent evals
- dependencies and blockers
- demo impact
- security or data-handling notes when applicable

Use stable planning keys such as `FOUND-001`. Keep one issue small enough for one focused branch and PR.

## Coding rules after approval

- Follow the approved Superpowers implementation plan and its task order.
- Use true red-green-refactor TDD for behavior changes unless the user explicitly approves a documented exception.
- Use strict typing at module boundaries.
- Keep domain logic independent from web frameworks and model providers.
- Put third-party API calls behind adapters.
- Make side-effecting operations idempotent where practical.
- Add tests with every behavior change.
- Prefer fixtures generated for the demo over copied customer or production data.
- Update relevant documentation and ADRs when behavior or architecture changes.

## Definition of done

A task is not complete until its acceptance criteria pass, tests/evals are green, documentation is updated, and the demo path remains runnable from a clean checkout.
