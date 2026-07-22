// Presentational only — renders whatever status string the server-authoritative
// refreshStatusAction returned. No client-side status logic or mapping lives here.
export function StatusChip({ status }: { status: string | null }) {
  return (
    <span
      className={`status-chip${status ? ` status-chip-${status.toLowerCase()}` : ' status-chip-unknown'}`}
      data-testid="status-chip"
      data-status={status ?? 'unknown'}
    >
      {status ?? 'Unknown'}
    </span>
  )
}
