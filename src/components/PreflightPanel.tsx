import type { PreflightFinding, ValidatedAffinityIntent } from '@/domain/schemas'

export type IntentValidationResult = { ok: true; intent: ValidatedAffinityIntent } | { ok: false; finding: PreflightFinding }

const SEVERITY_LABEL: Record<PreflightFinding['severity'], string> = {
  error: 'Error',
  warning: 'Warning',
  info: 'Info',
}

export function PreflightPanel({
  intentResult,
  findings,
}: {
  intentResult: IntentValidationResult
  findings: PreflightFinding[]
}) {
  const combined: PreflightFinding[] = intentResult.ok ? findings : [intentResult.finding, ...findings]

  return (
    <section className="card" aria-label="Preflight" data-testid="preflight-panel">
      <h2 className="card-title">2. Preflight</h2>
      {combined.length === 0 ? (
        <p className="card-hint">No preflight issues — all sequences accepted.</p>
      ) : (
        <ul className="findings-list">
          {combined.map((f, i) => (
            <li
              key={`${f.code}-${f.evidenceLocation.sequenceId ?? 'none'}-${i}`}
              data-testid={`finding-${f.code}`}
              className={`finding finding-${f.severity}`}
            >
              <span className={`finding-severity finding-severity-${f.severity}`}>{SEVERITY_LABEL[f.severity]}</span>
              <div className="finding-body">
                <p className="finding-message">{f.message}</p>
                <p className="finding-remediation">Remediation: {f.remediation}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
