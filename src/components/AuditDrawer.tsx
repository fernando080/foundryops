export interface AuditEntry {
  id: string
  processingStatus: string
  message: string
  at: string
}

// Rejected/untrusted deliveries only. Anything shown here must never also
// appear in the trusted timeline — ingestion already keeps the two separate,
// this component just renders what it is given.
export function AuditDrawer({
  open,
  onClose,
  entries,
}: {
  open: boolean
  onClose: () => void
  entries: AuditEntry[]
}) {
  if (!open) return null
  return (
    <div className="audit-drawer" data-testid="audit-drawer" role="dialog" aria-label="Audit log">
      <div className="audit-drawer-header">
        <h3 className="card-title">Rejected deliveries</h3>
        <button type="button" data-testid="close-audit" className="btn" onClick={onClose}>
          Close
        </button>
      </div>
      {entries.length === 0 && <p className="card-hint">No rejected deliveries yet.</p>}
      <ul className="audit-list">
        {entries.map((e) => (
          <li key={e.id} className="audit-item" data-testid="audit-entry">
            <span className="audit-entry-status">{e.processingStatus}</span>
            <span className="audit-entry-message">{e.message}</span>
            <time className="audit-entry-at" dateTime={e.at}>
              {e.at}
            </time>
          </li>
        ))}
      </ul>
    </div>
  )
}
