'use client'
import { useState } from 'react'
import { resultsAction } from '@/app/actions/results'
import { CandidateCard } from './CandidateCard'
import { DraftStage } from './DraftStage'

type ResultsData = Awaited<ReturnType<typeof resultsAction>>

// Three-layer results screen. Fetched on demand (Foundry results + LLM
// draft) rather than on mount, matching the rest of the workspace's
// explicit-gate style — nothing calls out to an adapter until the operator
// asks for it.
export function ResultsStage({
  experimentId,
  onResultsLoaded,
  onDraftRevealed,
}: {
  experimentId: string
  onResultsLoaded?: () => void
  onDraftRevealed?: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<ResultsData | null>(null)
  const [showDraft, setShowDraft] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGotoResults() {
    setLoading(true)
    setError(null)
    try {
      const r = await resultsAction(experimentId)
      setData(r)
      setShowDraft(false)
      onResultsLoaded?.()
    } catch {
      setError('Could not load results for this experiment.')
    } finally {
      setLoading(false)
    }
  }

  function handleGenerateDraft() {
    setShowDraft(true)
    onDraftRevealed?.()
  }

  return (
    <section className="card" aria-label="Results" data-testid="results-stage">
      <h2 className="card-title">7. Results &amp; evidence</h2>
      <p className="card-hint">
        Measured data, deterministic QC, and model commentary are shown as three separate bands — a candidate that
        passes QC with no detectable binding is a valid negative, not a failed assay.
      </p>

      {!data && (
        <button
          type="button"
          data-testid="goto-results"
          className="btn btn-primary"
          disabled={loading}
          onClick={handleGotoResults}
        >
          {loading ? 'Loading results…' : 'View results & evidence'}
        </button>
      )}

      {error && (
        <p className="card-hint" data-testid="results-error">
          {error}
        </p>
      )}

      {data && (
        <>
          <div className="candidate-grid" data-testid="candidate-grid">
            {data.pairs.map((pair) => (
              <CandidateCard key={pair.record.candidateId} pair={pair} bundle={data.bundle} draft={data.draft} />
            ))}
          </div>

          {!showDraft && (
            <button type="button" data-testid="generate-draft" className="btn btn-primary" onClick={handleGenerateDraft}>
              Generate customer draft
            </button>
          )}

          {showDraft && <DraftStage draft={data.draft} />}
        </>
      )}
    </section>
  )
}
