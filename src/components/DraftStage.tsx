'use client'
import type { DraftResult } from './CandidateCard'

const ERROR_LABEL: Record<string, string> = {
  LLM_ERROR: 'model error',
  TEXT_SEGMENT_HAS_NUMBER: 'a number appeared outside an evidence-backed segment',
  EVIDENCE_NOT_FOUND: 'evidence missing',
  CLAIMTYPE_EVIDENCE_MISMATCH: 'claim type does not match the underlying evidence',
}

function formatDraftError(err: { code: string; detail: string }): string {
  const label = ERROR_LABEL[err.code] ?? err.code
  return `Claim blocked: ${label} (${err.detail})`
}

// Presentational only. When ok, `draft.rendered` already has every number
// inserted by renderCustomerDraft against the evidence bundle — this
// component must never reformat, round, or recompute anything in it.
export function DraftStage({ draft }: { draft: DraftResult }) {
  return (
    <section className="card" aria-label="Customer draft" data-testid="draft-stage">
      <h2 className="card-title">8. Customer draft</h2>

      {draft.ok && draft.rendered ? (
        <>
          <span className="draft-not-sent-label" data-testid="draft-not-sent-label">
            Not sent — manual send only
          </span>
          <p className="draft-prose" data-testid="draft-rendered">
            {draft.rendered}
          </p>
        </>
      ) : (
        <div className="banner banner-error" data-testid="draft-blocked">
          <p className="banner-title">Draft blocked — no sendable customer update</p>
          <ul className="draft-blocked-list">
            {(draft.errors ?? []).map((e, i) => (
              <li key={`${e.code}-${i}`}>{formatDraftError(e)}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
