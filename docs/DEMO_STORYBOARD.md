# Demo storyboard

Target length: 4–5 minutes.

## Scene 1 — Positioning

Show the application and say:

> Adaptyv already exposes the lab through an API and SDK. I focused on the operational layer needed to make those capabilities safe and useful in an internal workflow.

## Scene 2 — Intake

Paste a realistic request:

> Prepare a BLI affinity characterization against EGFR using the attached sequences. Keep it below the customer budget, flag anything suspicious, and do not submit it without my approval.

Upload the synthetic FASTA fixture.

Expected UI:

- extracted target, method, budget, and approval requirement,
- source highlighting or evidence for extracted fields,
- one unresolved ambiguity only if it materially improves the story.

## Scene 3 — Deterministic preflight

Reveal:

- one invalid residue,
- one duplicate sequence,
- normalized valid count,
- resolved target,
- cost estimate,
- over-budget warning or suggested scope adjustment.

Emphasize that validation and arithmetic are deterministic.

## Scene 4 — Approval boundary

Show the exact draft payload and diff. Demonstrate that:

- live mutation is disabled,
- creating a draft is distinct from confirmation,
- changing the payload invalidates prior approval.

Use the mock adapter or sandbox, never a paid live action for the recording.

## Scene 5 — Status and webhook

Replay a valid completion event and a duplicate delivery. The timeline should update once. Optionally show an invalid-signature event being rejected in an audit view.

## Scene 6 — Results QC

Show synthetic results with:

- strong consistent binder,
- poor-fit apparent binder,
- no detectable binding,
- contradictory replicates.

Make the separation between raw measurements, deterministic flags, and model explanation visually obvious.

## Scene 7 — Evidence-backed customer draft

Generate a concise update. Click or expand evidence behind at least two numerical claims. Show that the draft is not sent automatically.

## Scene 8 — Engineering proof

Briefly show:

- a trace/audit run,
- the approval policy,
- test/eval report,
- adapter swap between mock and Foundry client.

Close with:

> The model handles interpretation and communication; deterministic software handles validation, permissions, numbers, and state.

## Recording safeguards

- Use synthetic names, sequences, results, and email addresses.
- Hide terminal history and environment variables.
- Record from a clean browser profile.
- Verify the live URL does not expose debug endpoints or secrets.
- Keep a prerecorded fallback path if the hosted model provider is unavailable.
