# First Claude Code prompt

Use this only if you prefer a natural-language prompt instead of `/architecture-sprint`:

```text
We are in planning phase. Read CLAUDE.md and every document it lists under
"Read first". Do not implement application code.

Run a structured architecture sprint for FoundryOps. Delegate independent
reviews to the solution-architect, product-planner, security-reviewer,
eval-designer, and ux-reviewer subagents. Then synthesize one coherent,
reviewable proposal covering:

- MVP and scope cuts
- architecture and component boundaries
- at least two stack options with a weighted decision matrix
- domain types and state machines
- LLM versus deterministic responsibilities
- Foundry adapter plus contract-faithful mock
- approval, idempotency, webhook, and audit design
- data/evidence model
- interface screens and failure states
- observability, tests, and eval release gates
- deployment and offline/no-credential fallback
- milestones, critical path, risks, ADRs, and decision gates

Clearly mark confirmed facts, assumptions, recommendations, and open
questions. Return the proposal in this conversation first. Do not write files
or create GitHub issues until I approve the decisions.
```
