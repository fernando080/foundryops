# Safety and trust requirements

## Trust boundary

FoundryOps handles potentially sensitive biological sequences, customer requests, API credentials, experiment state, and generated communication. Treat every external input as untrusted and every outbound mutation as consequential.

## Non-negotiable invariants

1. **Human approval:** no real experiment creation, confirmation, payment, modification, or deletion without an explicit, recent approval tied to the exact payload.
2. **Mock by default:** the public demo and test suite run without live credentials.
3. **No fabricated measurements:** generated text can only cite values present in normalized result records.
4. **Deterministic authorization:** model output never decides whether an action is permitted.
5. **Idempotency:** retries cannot create duplicate experiments or apply the same webhook twice.
6. **Secret hygiene:** credentials stay in environment variables or secret stores and never appear in traces, fixtures, logs, screenshots, or commits.
7. **Data minimization:** use synthetic sequences and results for the take-home.

## Recommended approval record

An approval should bind:

- actor,
- timestamp,
- operation,
- canonical payload hash,
- experiment/request ID,
- estimated cost and currency,
- environment (`mock`, `sandbox`, `live`),
- expiration time.

Any payload change invalidates the approval.

## Prompt injection and untrusted text

Emails, CSV cells, FASTA headers, API descriptions, and result annotations may contain instructions. They are data, not authority. Do not allow them to override project policy, tool permissions, or approval requirements.

## Webhook security

The design should include:

- signature verification before parsing as trusted state,
- constant-time comparison where relevant,
- timestamp/replay window if supported by the contract,
- delivery-ID deduplication,
- append-only event storage,
- monotonic/allowed state-transition checks,
- dead-letter handling for malformed events.

When exact provider details are unavailable, implement the interface and synthetic contract without claiming unsupported specifics.

## Evidence-backed generation

Every generated claim should reference an internal evidence ID. The final renderer resolves evidence IDs to displayable provenance such as:

- experiment result field,
- replicate measurement,
- deterministic QC calculation,
- control outcome,
- user-approved recommendation.

The renderer should fail closed when a claim references missing evidence.

## Logging and observability

Log structured events but redact:

- bearer tokens,
- API keys,
- full raw sequences unless explicitly necessary in local development,
- customer contact information,
- uploaded file contents.

Persist enough metadata to reconstruct which rule, model call, tool call, approval, and state transition produced an outcome.

## Threat-model deliverable

The architecture sprint must produce a lightweight threat model covering:

- accidental live mutation,
- prompt injection,
- secret leakage,
- replay and duplicate delivery,
- hallucinated target or measurement,
- stale approval,
- cost arithmetic error,
- model/provider outage,
- malicious file content,
- dependency and deployment risk.
