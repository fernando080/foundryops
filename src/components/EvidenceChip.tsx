'use client'
import { useState } from 'react'
import type { EvidenceBundle } from '@/domain/schemas'
import { resolveEvidence } from '@/domain/evidence/bundle'

// A single evidence-backed value, rendered as a dotted-underline inline
// control. Click reveals a small provenance popover — evidence id, value
// (+unit, or the categorical value), kind, and sourceRef — resolved from
// the results evidence bundle. Every derived number a reviewer sees in the
// deterministic-QC layer traces back to a specific measurement or
// calculation through this popover.
export function EvidenceChip({ evidenceId, bundle }: { evidenceId: string; bundle: EvidenceBundle }) {
  const [open, setOpen] = useState(false)
  const evidence = resolveEvidence(bundle, evidenceId)

  if (!evidence) {
    return (
      <span className="evidence-chip-missing" data-testid="evidence-chip-missing">
        —
      </span>
    )
  }

  const displayValue =
    evidence.valueKind === 'categorical'
      ? (evidence.categoricalValue ?? evidence.displayLabel)
      : `${evidence.numericValue}${evidence.unit ? ` ${evidence.unit}` : ''}`

  return (
    <span className="evidence-chip-wrap">
      <button
        type="button"
        data-testid="evidence-chip"
        className="evidence-chip"
        aria-expanded={open}
        aria-label={`${evidence.displayLabel}: ${displayValue} — show evidence`}
        onClick={() => setOpen((o) => !o)}
      >
        {displayValue}
      </button>
      {open && (
        <div
          className="evidence-popover"
          data-testid="evidence-popover"
          role="dialog"
          aria-label={`Evidence for ${evidence.displayLabel}`}
        >
          <dl>
            <dt>Evidence ID</dt>
            <dd>{evidence.id}</dd>
            <dt>Value</dt>
            <dd>{displayValue}</dd>
            <dt>Kind</dt>
            <dd>{evidence.kind}</dd>
            <dt>Source</dt>
            <dd>{evidence.sourceRef}</dd>
          </dl>
        </div>
      )}
    </span>
  )
}
