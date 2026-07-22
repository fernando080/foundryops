# FoundryOps demo runbook

A ~4–5 minute scripted walkthrough of the offline/mock demo. Everything runs deterministically with `LLM_PROVIDER=stub` and `FOUNDRY_MODE=mock` — no credentials, no network.

## Prerequisites & start

- Node **22.23.1 LTS** (`nvm use` reads `.nvmrc`), then `npm ci`.
- Start the app: `npm run demo` (serves at `http://localhost:3000`).
  - If port 3000 is occupied on your machine, run `npx next dev -p 3200` (or set the port you prefer) with the same env: `cross-env LLM_PROVIDER=stub FOUNDRY_MODE=mock FOUNDRYOPS_DB_PATH=./data/foundryops.db next dev -p 3200`.
- **Reset between takes:** stop the server and delete the local DB: `rm -f data/foundryops.db data/foundryops.db-*` (a fresh DB is created on next boot).

## The verbatim intake request

Paste this exactly (the deterministic stub is keyed to it):

> Prepare a BLI affinity characterization against EGFR using the attached sequences, six-point concentration series in triplicate. Keep it below the customer budget of $8,000, flag anything suspicious, and do not submit without my approval.

Upload the sequence file: **`fixtures/demo.fasta`** (8 candidates AC-1…AC-8).

## Scene-by-scene (~4:50)

1. **Positioning (0:00–0:25).** Show the workspace: the **MOCK** environment badge + the "Live mutations disabled" padlock + the stepper. One line: *"This is the safe operational layer around the Adaptyv Foundry API."*
2. **Intake (0:25–1:05).** Paste the request, upload `fixtures/demo.fasta`, run intake. Point out the extracted intent (target EGFR, method BLI, budget) and the deterministic preflight findings.
3. **Preflight + remediation (1:05–1:45).** Show the two preflight findings (AC-5 invalid residue, AC-6 duplicate of AC-1 — both auto-excluded, non-blocking). Resolve the **target ambiguity** (EGFR → pick *human ECD*). The cost panel is **over budget** ($9,700 vs $8,000); **deselect AC-7 and AC-8** → within budget ($7,300). Only AC-1…AC-4 remain.
4. **Approval boundary (1:45–2:25).** Show the exact payload + hash chip. `Create draft` is enabled; `Confirm & submit to lab` is padlocked. **Edit replicates** → the hash changes and the prior approval shows **INVALIDATED**. **Reissue approval**, then **Create draft** — exactly one deterministic draft is created.
5. **Update timeline + status (2:25–3:05).** Replay a **valid** signed `experiment_update` → it appears in the timeline ("Quote sent"). Replay the **same delivery** → `×2 deliveries · applied once` (state changes once). Replay an **invalid-signature** delivery → it appears **only in the audit drawer**, never the trusted timeline. Click **refresh status** → status chip shows **Done** (obtained separately via `getExperimentStatus`, not from the webhook).
6. **Results QC — the money shot (3:05–4:00).** For AC-1…AC-4, show the three visually distinct layers: **MEASURED** (read-only contract BLI fields), **DETERMINISTIC QC** (Demo QC Policy v1 — *data quality* and *binding outcome* as separate rows; AC-3 is a **valid negative**, not a failed assay), **MODEL COMMENTARY** (interpretation). Expand an **evidence chip** to show provenance.
7. **Evidence-backed draft (4:00–4:35).** Generate the customer draft. Every number is **inserted by the renderer from evidence** — the model never writes a numeric value. Note "Not sent — manual send only". (Fail-closed: a claim citing missing evidence is blocked — covered by the separate fail-closed test.)
8. **Engineering proof (4:35–4:50).** Mention: deterministic offline by default; Gemini + live Foundry HTTP are stretch behind typed interfaces; `npm run verify` is green (typecheck · unit/integration · build · **client‑bundle secret grep** · audit). The full **gitleaks git‑history secret scan runs in `npm run demo-ready`** (not `verify`). Playwright drives this exact flow.

## Recording safeguards

- Use only the synthetic fixtures (no real sequences/customers).
- Hide terminal history and environment variables.
- Record the deterministic path (`LLM_PROVIDER=stub`); Gemini is an optional aside only.
- Keep a prerecorded fallback clip in case a hosted provider is unavailable.
