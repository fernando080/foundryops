'use client'
import type { DraftResult } from './CandidateCard'
import type { EvidenceBundle } from '@/domain/schemas'
import { EvidenceChip } from './EvidenceChip'

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

// Presentational only. When ok, every segment of `draft.draft.segments` is
// rendered directly against `bundle`: text segments as plain text, evidence
// segments as an EvidenceChip (the same provenance popover used in the
// results grid) wrapping the prefix/suffix. This component must never
// reformat, round, or recompute a value itself — every number a reviewer
// sees here traces back through the chip to its evidence record.
export function DraftStage({ draft, bundle }: { draft: DraftResult; bundle: EvidenceBundle }) {
  return (
    <section className="card" aria-label="Customer draft" data-testid="draft-stage">
      <h2 className="card-title">8. Customer draft</h2>

      {draft.ok && draft.draft ? (
        <>
          <span className="draft-not-sent-label" data-testid="draft-not-sent-label">
            Not sent — manual send only
          </span>
          <p className="draft-prose" data-testid="draft-rendered">
            {draft.draft.segments.map((s, i) =>
              s.kind === 'text' ? (
                <span key={i}>{s.text}</span>
              ) : (
                <span key={i} data-testid="draft-evidence-chip">
                  {s.prefix}
                  <EvidenceChip evidenceId={s.evidenceId} bundle={bundle} />
                  {s.suffix}
                </span>
              ),
            )}
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
