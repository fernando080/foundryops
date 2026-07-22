# Evaluation strategy

**Status:** draft

## Evaluation layers

1. Unit tests for deterministic domain logic.
2. Contract tests for adapters and serialized schemas.
3. Golden tests for structured intent extraction.
4. Policy tests for prohibited mutations and stale approvals.
5. Numerical-faithfulness tests for generated claims.
6. End-to-end scripted demo tests in mock mode.
7. Optional online/provider tests separated from offline CI.

## Initial cases

- invalid amino-acid character,
- duplicate IDs,
- duplicate sequences,
- ambiguous target,
- requested/uploaded count mismatch,
- budget exceeded,
- stale approval after payload edit,
- duplicate webhook delivery,
- invalid webhook signature,
- out-of-order status transition,
- inconsistent replicates,
- poor fit quality,
- missing evidence for generated claim,
- model returns malformed structured output,
- model/provider unavailable,
- Foundry adapter timeout or rate limit.

## Metrics

Define metrics only when they map to a user or safety outcome. Candidate metrics:

- schema-valid extraction rate,
- required-field accuracy,
- unsafe-action prevention rate,
- numerical claim precision,
- evidence coverage,
- webhook deduplication rate,
- end-to-end demo success rate,
- median planning and execution latency.

## Release gate

Specify which failures block the demo and which produce warnings.
