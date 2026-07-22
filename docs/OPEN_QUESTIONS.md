# Open questions

The architecture sprint should resolve or explicitly defer these. Do not ask the user every question at once; make a recommendation with assumptions where possible.

## Product scope

- Is the MVP centered only on binding screening, or does it support a second experiment type?
- Is draft creation simulated, sandboxed, or both?
- Does the demo need authentication, or is a single-user local experience sufficient?
- Which result fields produce the clearest QC story with synthetic fixtures?

## Stack

- Monorepo or a single Python application with server-rendered UI?
- React/Next.js plus FastAPI, or a faster single-stack alternative?
- SQLite for the demo or PostgreSQL from day one?
- Which model provider and structured-output mechanism minimize demo risk?
- Is MCP a visible deliverable or a small optional interface after the web workflow works?

## API contract

- Which exact Foundry endpoints and SDK methods are needed for the MVP?
- What are the current status values and permitted transitions?
- How are webhook signatures represented and verified?
- Which endpoints are safe in sandbox and which can incur cost?
- What is the exact quote/confirmation lifecycle?

## Data and evals

- What threshold definitions will be used for replicate consistency and fit quality in synthetic data?
- Which claims require direct evidence versus deterministic derived evidence?
- What ten to twenty golden cases best demonstrate reliability?

## Delivery

- Preferred hosting target and its constraints?
- Should the public repo use MIT, Apache-2.0, or no license during the application?
- What private details about the hiring process should remain outside the repository?
- What is the target implementation timebox?
