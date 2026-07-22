'use client'
import type { TargetResolution } from '@/domain/schemas'

export function TargetPicker({
  resolution,
  selectedTargetId,
  onSelect,
}: {
  resolution: TargetResolution
  selectedTargetId: string | null
  onSelect: (foundryTargetId: string) => void
}) {
  if (resolution.status === 'resolved' && resolution.chosen) {
    const chosen = resolution.chosen
    return (
      <section className="card" aria-label="Target">
        <h2 className="card-title">3. Target</h2>
        <p className="card-hint">
          Resolved target: <strong>{chosen.name}</strong> ({chosen.foundryTargetId}, {chosen.organism})
        </p>
      </section>
    )
  }

  if (resolution.status === 'missing') {
    return (
      <section className="card" aria-label="Target">
        <h2 className="card-title">3. Target</h2>
        <p className="finding-message">No matching Foundry target found for &ldquo;{resolution.query}&rdquo;.</p>
      </section>
    )
  }

  // ambiguous — required radio group
  return (
    <section className="card" aria-label="Target" data-testid="target-picker">
      <h2 className="card-title">3. Target — resolve ambiguity</h2>
      <p className="card-hint">
        &ldquo;{resolution.query}&rdquo; matches more than one Foundry target. Select one to continue.
      </p>
      <div role="radiogroup" aria-required="true" aria-label="Target options" className="radio-group">
        {resolution.alternatives.map((t) => (
          <label key={t.foundryTargetId} className="radio-option">
            <input
              type="radio"
              name="target"
              required
              data-testid={`target-option-${t.foundryTargetId}`}
              value={t.foundryTargetId}
              checked={selectedTargetId === t.foundryTargetId}
              onChange={() => onSelect(t.foundryTargetId)}
            />
            <span>
              <strong>{t.name}</strong> — {t.organism} ({t.uniprotId})
            </span>
          </label>
        ))}
      </div>
    </section>
  )
}
