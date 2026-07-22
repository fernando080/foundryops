'use client'
import type { ChangeEvent } from 'react'

export function IntakeStage({
  requestText,
  onRequestTextChange,
  fastaFileName,
  onFastaLoaded,
  onRunIntake,
  loading,
  canRun,
}: {
  requestText: string
  onRequestTextChange: (v: string) => void
  fastaFileName: string | null
  onFastaLoaded: (text: string, fileName: string) => void
  onRunIntake: () => void
  loading: boolean
  canRun: boolean
}) {
  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    onFastaLoaded(text, file.name)
  }

  return (
    <section className="card" aria-label="Intake">
      <h2 className="card-title">1. Intake</h2>
      <p className="card-hint">Paste the unstructured experiment request and attach the sequence FASTA.</p>

      <div className="field">
        <label htmlFor="request-input">Experiment request</label>
        <textarea
          id="request-input"
          data-testid="request-input"
          rows={6}
          value={requestText}
          placeholder="e.g. Prepare a BLI affinity characterization against EGFR using the attached sequences…"
          onChange={(e) => onRequestTextChange(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="fasta-input">Sequence file (FASTA)</label>
        <input id="fasta-input" data-testid="fasta-input" type="file" accept=".fasta,.fa,.txt" onChange={handleFileChange} />
        {fastaFileName && (
          <p className="file-name" data-testid="fasta-file-name">
            Loaded: {fastaFileName}
          </p>
        )}
      </div>

      <button type="button" data-testid="run-intake" className="btn btn-primary" disabled={!canRun || loading} onClick={onRunIntake}>
        {loading ? 'Running intake…' : 'Run intake'}
      </button>
    </section>
  )
}
