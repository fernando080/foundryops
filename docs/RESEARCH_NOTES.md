# Research notes and source map

These links are starting points for Claude Code. Re-check current contracts before implementation. Do not copy assumptions from summaries into code without inspecting the source or OpenAPI schema.

## Adaptyv

- Company mission and careers: https://www.adaptyvbio.com/careers
- Foundry API overview: https://docs.adaptyvbio.com/api-reference
- Public OpenAPI schema: https://foundry-api-public.adaptyvbio.com/api/v1/openapi.json
- Foundry MCP documentation: https://docs.adaptyvbio.com/api-reference/mcp-server
- Official Python SDK: https://github.com/adaptyvbio/adaptyv-sdk
- Protein design skills: https://github.com/adaptyvbio/protein-design-skills
- Proteinbase article: https://www.adaptyvbio.com/blog/proteinbase
- Agents versus humans case study: https://www.adaptyvbio.com/blog/agents-vs-humans

## Confirmed public capabilities to verify against the latest schema

The public documentation describes:

- target discovery and search,
- experiment creation and lifecycle tracking,
- sequence submission, including multi-chain notation,
- screening, affinity, thermostability, fluorescence, and expression experiment types,
- pre-creation cost estimates,
- quotes and invoices,
- results retrieval,
- webhook-driven status updates,
- bearer-token authentication,
- an official Python SDK generated/aligned with the OpenAPI contract.

## Important implication

Because Adaptyv already publishes an API, Python SDK, MCP access, and Claude Code protein-design skills, the take-home should add value above endpoint exposure. Focus on workflow composition, safe mutations, human approval, operational UX, observability, QC, and evals.

## Research protocol

Before writing an adapter:

1. Download and pin the current OpenAPI document.
2. Record its version/hash.
3. Identify exact request/response schemas used by the MVP.
4. Generate or hand-write only the minimal typed surface required.
5. Add contract fixtures and drift checks.
6. Keep network-dependent contract tests separate from offline CI.

## Claims that remain assumptions until verified

- Availability and exact behavior of a sandbox token for the applicant.
- Exact webhook signature algorithm and headers.
- Exact result fields and raw data package available for every experiment type.
- Whether draft creation can be safely demonstrated against a shared environment.

Put verified answers in an ADR or adapter contract; keep unknowns in `docs/OPEN_QUESTIONS.md`.
