---
name: demo-readiness
description: Audit FoundryOps for submission readiness: clean-checkout setup, scripted happy and failure paths, safety invariants, evals, deployment, repository hygiene, and a timed Loom runbook.
disable-model-invocation: true
---
Perform a submission-readiness review. `$ARGUMENTS` may narrow the review, for example `planning-only`.

Review or run, as applicable:

- clean-checkout setup,
- mock-mode end-to-end happy path,
- malformed sequence path,
- over-budget or ambiguous-target path,
- stale approval rejection,
- duplicate/invalid webhook handling,
- inconsistent result QC,
- missing-evidence generation failure,
- model/provider outage fallback,
- unit, integration, contract, and eval suites,
- secret and private-data scan,
- public repository documentation,
- deployment configuration,
- 4–5 minute Loom storyboard.

Return findings ordered by release severity:

- blocker,
- important,
- polish.

For each finding include evidence, impact, exact remediation, and the test that proves closure. Do not declare the demo ready while a safety invariant or clean-checkout path is failing.
