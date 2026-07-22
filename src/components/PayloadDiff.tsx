import { formatMoney } from './format'

export interface PayloadSnapshot {
  version: number
  replicates: number
  totalMinor: number
  payloadHash: string
}

function shortHash(hash: string): string {
  return hash.length > 14 ? `${hash.slice(0, 10)}…${hash.slice(-4)}` : hash
}

export function PayloadDiff({ before, after, currency }: { before: PayloadSnapshot; after: PayloadSnapshot; currency: string }) {
  const rows: Array<{ label: string; before: string; after: string; changed: boolean }> = [
    { label: 'Version', before: String(before.version), after: String(after.version), changed: before.version !== after.version },
    { label: 'Replicates', before: String(before.replicates), after: String(after.replicates), changed: before.replicates !== after.replicates },
    {
      label: 'Total cost',
      before: formatMoney(before.totalMinor, currency),
      after: formatMoney(after.totalMinor, currency),
      changed: before.totalMinor !== after.totalMinor,
    },
    { label: 'Payload hash', before: shortHash(before.payloadHash), after: shortHash(after.payloadHash), changed: before.payloadHash !== after.payloadHash },
  ]

  return (
    <table className="payload-diff" data-testid="payload-diff">
      <thead>
        <tr>
          <th>Field</th>
          <th>Before</th>
          <th>After</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className={r.changed ? 'payload-diff-changed' : undefined}>
            <td>{r.label}</td>
            <td>{r.before}</td>
            <td>{r.after}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
