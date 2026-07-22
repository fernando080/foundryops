export function HashChip({ hash, label }: { hash: string; label?: string }) {
  const short = hash.length > 14 ? `${hash.slice(0, 10)}…${hash.slice(-4)}` : hash
  return (
    <span className="hash-chip" data-testid="hash-chip" title={hash}>
      {label && <span className="hash-chip-label">{label}</span>}
      <code>{short}</code>
    </span>
  )
}
