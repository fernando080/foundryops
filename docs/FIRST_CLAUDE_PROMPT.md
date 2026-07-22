# First Claude Code prompt

Use this only if you prefer a natural-language prompt instead of `/architecture-sprint`:

```text
Invoke the superpowers:brainstorming skill and use it as the authoritative
process for FoundryOps design. Read CLAUDE.md and every document it lists under
"Read first". Treat those documents as informed hypotheses, not immutable
implementation decisions. Do not implement or scaffold application code.

Ask one clarifying question at a time. Once goals, constraints, timebox, and
success criteria are clear, consult the project agents in stages:

1. product-planner and solution-architect,
2. security-reviewer and eval-designer against the emerging design,
3. ux-reviewer once workflow and trust boundaries are stable.

Synthesize one design rather than pasting separate reports. Ensure it covers:
MVP and scope cuts; architecture and stack alternatives; domain types and state
machines; LLM/deterministic boundaries; Foundry adapter and offline mock;
approval, idempotency, webhooks, audit and evidence; UX trust states;
observability, tests/evals, deployment, fixtures, and fallback operation.

Use Pencil only when a visual decision genuinely benefits from a wireframe, and
ask before doing so. Do not use Canva, Gmail, Calendar, or Drive for this task.

Follow Superpowers' written-spec gate. Save the approved design under
docs/superpowers/specs/, commit it, and stop for my review of the actual file.
Do not start writing-plans until I explicitly approve that written spec.
```
