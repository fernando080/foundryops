# Product specification

## MVP user story

As an experiment operator, I can paste a natural-language request and upload a FASTA so that FoundryOps produces a validated, budget-aware Foundry draft and later helps me review results without making unsupported claims or performing unapproved actions.

## Core workflow

### 1. Intake

Input:

- unstructured email or Slack-style request,
- FASTA sequence file,
- optional customer and budget metadata.

Output:

- typed `ExperimentIntent`,
- extracted requirements with confidence and source spans,
- unresolved ambiguities that require human input.

The extraction layer must never silently invent missing required fields.

### 2. Deterministic preflight

Minimum checks:

- empty or malformed input,
- invalid amino-acid characters,
- duplicate identifiers,
- duplicate sequences,
- inconsistent requested and uploaded sequence counts,
- malformed multi-chain separators,
- unsupported experiment type or method,
- ambiguous or missing target,
- missing required configuration,
- cost above budget,
- duplicate prior request or retry.

Each finding has severity, code, human-readable explanation, evidence location, and remediation.

### 3. Target and cost resolution

The system queries a `FoundryClient` interface that can be backed by:

- a contract-faithful mock for the demo,
- the official SDK or direct API client for sandbox/live use.

It shows the chosen target, alternatives, and cost breakdown. Target ambiguity blocks progression.

### 4. Review and approval

The UI shows:

- normalized request,
- accepted/rejected sequences,
- exact outbound payload,
- policy findings,
- estimated cost,
- an audit timeline.

Creating a draft and confirming/submitting an experiment are separate capabilities. Any real mutation requires an explicit approval action and is disabled in public demo mode.

### 5. Status tracking

The system ingests signed webhook events or deterministic mock events and displays an experiment timeline. Delivery IDs are deduplicated and invalid signatures are rejected.

### 6. Result review

For synthetic result fixtures, calculate and display:

- binding outcome (including "no detectable binding" as a valid negative),
- data quality (pass / warning / fail), kept separate from the binding outcome,
- binding classification,
- affinity/kinetic measurements where present,
- replicate consistency,
- fit-quality warnings,
- control outcomes,
- candidates recommended for follow-up,
- candidates that remain inconclusive.

Numerical QC is deterministic. The model may explain or summarize the results but cannot alter calculated values.

### 7. Customer update draft

Generate a message draft that:

- cites every numerical claim to an evidence record,
- distinguishes confirmed findings from recommendations,
- flags inconclusive candidates,
- is never sent automatically.

## Demo fixtures

Include at least:

- one strong, consistent binder,
- one apparent binder with poor fit quality,
- one candidate with no detectable binding,
- one candidate with contradictory replicates,
- one malformed uploaded sequence,
- one duplicate sequence under another ID,
- one over-budget request.

## Non-goals for the MVP

- training or fine-tuning a protein model,
- autonomous protein design,
- automatic purchase or confirmation of live experiments,
- production-grade identity management,
- complete support for every Foundry experiment type,
- sending emails or Slack messages,
- a generic documentation chatbot,
- a second wrapper around every Foundry endpoint.

## MVP acceptance criteria

- A clean checkout runs the entire scripted demo in mock mode.
- The happy path completes from intake through customer draft.
- Invalid data and target ambiguity block progression.
- No live mutation can occur in mock mode or without explicit approval.
- Duplicate webhook delivery changes state only once.
- The results screen makes measured data, deterministic QC, and model commentary visually distinct.
- Every number in the generated customer draft maps to stored evidence.
- Automated tests cover core domain rules and at least ten adversarial/evaluation cases.
