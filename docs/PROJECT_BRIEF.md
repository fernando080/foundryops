# Project brief

## Working name

**FoundryOps — Experiment Intake & Results Review Agent**

## Opportunity

Adaptyv is building technology that makes proteins easier to engineer and combines software, machine learning, lab automation, and experimental data. The public Foundry API already exposes the experiment lifecycle: targets, experiment creation, sequences, cost estimates, status updates, quotes/invoices, results, and webhooks.

The strongest take-home is therefore not another thin endpoint wrapper. It is the operational layer that turns those capabilities into a safe, reviewable workflow that internal teams could plausibly use.

## Product thesis

A scientist or operator should be able to paste an unstructured request and upload a FASTA, then receive:

1. a structured experiment intent,
2. deterministic input and policy checks,
3. target resolution and a cost estimate,
4. a reviewable draft payload,
5. an explicit approval gate for any mutation,
6. an experiment timeline,
7. structured result QC,
8. an evidence-backed customer update draft.

## Why this demonstrates AI engineering

The demo should show more than prompt engineering:

- typed tool and data contracts,
- orchestration across API capabilities,
- deterministic safeguards around model output,
- human approval and state transitions,
- observability and idempotency,
- evaluation of numerical faithfulness,
- a useful interface and deployable workflow.

## Primary user

An Adaptyv scientist, solutions engineer, or operations teammate preparing and reviewing customer experiments.

## Secondary user

An AI or software engineer extending internal workflows and integrations.

## Submission goal

A live URL or locally reproducible application, a public repository with clear documentation, and a 4–5 minute Loom recording that demonstrates one happy path and at least one safety/QC failure path.

## Success statement

A reviewer should finish the demo thinking:

> Fernando understands that reliable AI products are systems: the model interprets ambiguity, while software enforces truth, permissions, evidence, and state.
