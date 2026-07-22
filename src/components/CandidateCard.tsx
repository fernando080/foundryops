'use client'
import type { ResultRecord, QCResult, EvidenceBundle, CustomerDraft } from '@/domain/schemas'
import { EvidenceChip } from './EvidenceChip'
import { formatNullableNumber, formatMolarAsNm, formatReplicateKdsNm } from './format'

// Shared with DraftStage — the exact shape draftCustomerUpdate resolves to
// (see src/application/draftComms.ts). Structural, not imported from the
// server action module, so this stays a plain client component.
export type DraftResult = {
  ok: boolean
  draft?: CustomerDraft
  rendered?: string
  errors?: { code: string; detail: string }[]
}

function humanize(s: string): string {
  const spaced = s.replace(/_/g, ' ').toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

// Layer C shows this candidate's own line from the rendered draft — split
// on newline and matched by candidate id, never re-derived or summarized.
function commentaryLine(draft: DraftResult, candidateId: string): string {
  if (draft.ok && draft.rendered) {
    const line = draft.rendered.split('\n').find((l) => l.includes(candidateId))
    if (line) return line
  }
  return 'Model commentary unavailable — deterministic results unaffected'
}

const hasEvidence = (bundle: EvidenceBundle, id: string) => bundle.records.some((r) => r.id === id)

export function CandidateCard({
  pair,
  bundle,
  draft,
}: {
  pair: { record: ResultRecord; qc: QCResult }
  bundle: EvidenceBundle
  draft: DraftResult
}) {
  const { record, qc } = pair
  const cid = record.candidateId
  const cvEvidenceId = `ev_${cid}_cv`
  const rmseEvidenceId = `ev_${cid}_rmse`
  const recoEvidenceId = `ev_${cid}_reco`

  // The case the layout exists to make impossible to misread: a candidate
  // that passed QC (assay behaved) but shows no detectable binding (the
  // measured outcome). That is a valid negative, not a failed experiment.
  const validNegative = qc.dataQuality === 'pass' && qc.bindingClass === 'no_detectable_binding'

  const dataQualityLabel = qc.dataQuality === 'pass' ? '✅ Pass' : qc.dataQuality === 'warning' ? '⚠️ Warning' : '❌ Fail'

  return (
    <article className="candidate-card" data-testid={`candidate-card-${cid}`} aria-label={`Candidate ${cid}`}>
      <header className="candidate-card-header">
        <span className="candidate-card-id">{cid}</span>
      </header>

      {/* Layer A — measured, read-only. Contract BLI fields only; no QC
          verdicts and no model text belong in this band. */}
      <div className="layer layer-measured" data-testid={`layer-measured-${cid}`}>
        <p className="layer-header">
          <span aria-hidden="true">🔬</span> Measured · read-only
        </p>
        <dl className="layer-measured-grid">
          <div>
            <dt>Per-replicate Kd</dt>
            <dd>{formatReplicateKdsNm(record.replicateKdsM)}</dd>
          </div>
          <div>
            <dt>kon (per ms)</dt>
            <dd>{formatNullableNumber(record.konPerMs)}</dd>
          </div>
          <div>
            <dt>koff (per s)</dt>
            <dd>{formatNullableNumber(record.koffPerS)}</dd>
          </div>
          <div>
            <dt>Mean Kd</dt>
            <dd>{formatMolarAsNm(record.kdMeanM)}</dd>
          </div>
          <div>
            <dt>RMSE max signal</dt>
            <dd>{record.rmseMaxSignalPct === null ? '—' : `${record.rmseMaxSignalPct}%`}</dd>
          </div>
          <div>
            <dt>Fit quality (reported)</dt>
            <dd>{record.fitQualityReported ?? '—'}</dd>
          </div>
          <div>
            <dt>Confidence</dt>
            <dd>{record.confidence ?? '—'}</dd>
          </div>
          <div>
            <dt>Control outcome</dt>
            <dd>{record.controlOutcome}</dd>
          </div>
        </dl>
        <p className="card-hint">{record.measurements.length} raw concentration × replicate points recorded.</p>
      </div>

      {/* Layer B — deterministic QC. Data quality and binding outcome are
          kept as two separate rows on purpose — see validNegative note. */}
      <div className="layer layer-qc" data-testid={`layer-qc-${cid}`}>
        <p className="layer-header">
          <span aria-hidden="true">🧮</span> Deterministic QC
        </p>
        <span className="qc-policy-badge">Demo QC Policy v1</span>

        <div className="qc-row" data-testid={`qc-data-quality-${cid}`} data-status={qc.dataQuality}>
          <span className="qc-row-label">Data quality</span>
          <span className={`qc-row-value qc-status-${qc.dataQuality}`}>{dataQualityLabel}</span>
        </div>
        <div className="qc-row" data-testid={`qc-binding-outcome-${cid}`} data-binding-class={qc.bindingClass}>
          <span className="qc-row-label">Binding outcome</span>
          <span className="qc-row-value">{humanize(qc.bindingClass)}</span>
        </div>
        {validNegative && (
          <p className="card-hint" data-testid={`qc-valid-negative-${cid}`}>
            Valid negative — the assay passed QC; no detectable binding is a real result, not a failed run.
          </p>
        )}

        <dl className="qc-detail-grid">
          <div>
            <dt>Replicate consistency</dt>
            <dd>
              {qc.replicateConsistency.status === 'not_applicable' ? (
                'N/A'
              ) : (
                <>
                  {hasEvidence(bundle, cvEvidenceId) ? (
                    <EvidenceChip evidenceId={cvEvidenceId} bundle={bundle} />
                  ) : (
                    formatNullableNumber(qc.replicateConsistency.cv)
                  )}{' '}
                  ({qc.replicateConsistency.status})
                </>
              )}
            </dd>
          </div>
          <div>
            <dt>Fit quality (RMSE max signal)</dt>
            <dd>
              {qc.fitQuality.status === 'not_applicable' ? (
                'N/A'
              ) : (
                <>
                  {hasEvidence(bundle, rmseEvidenceId) ? (
                    <EvidenceChip evidenceId={rmseEvidenceId} bundle={bundle} />
                  ) : record.rmseMaxSignalPct === null ? (
                    '—'
                  ) : (
                    `${record.rmseMaxSignalPct}%`
                  )}{' '}
                  ({qc.fitQuality.status})
                </>
              )}
            </dd>
          </div>
          <div>
            <dt>Recommendation</dt>
            <dd>
              {hasEvidence(bundle, recoEvidenceId) ? (
                <EvidenceChip evidenceId={recoEvidenceId} bundle={bundle} />
              ) : (
                humanize(qc.recommendation)
              )}
            </dd>
          </div>
        </dl>

        {qc.warnings.length > 0 && (
          <div className="qc-warnings" data-testid={`qc-warnings-${cid}`}>
            {qc.warnings.map((w) => (
              <span key={w} className="qc-warning-badge">
                {humanize(w)}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Layer C — model commentary, interpretation only. Prose, never a
          source of numbers — the deterministic layers above already hold
          every number this line refers to. */}
      <div className="layer layer-commentary" data-testid={`layer-commentary-${cid}`}>
        <p className="layer-header">
          <span aria-hidden="true">🤖</span> Model commentary · interpretation
        </p>
        <p>{commentaryLine(draft, cid)}</p>
      </div>
    </article>
  )
}
