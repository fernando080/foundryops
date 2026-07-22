'use client'
import type { CostEstimate, SequenceSet } from '@/domain/schemas'
import { formatMoney } from './format'

export function BudgetPanel({
  sequenceSet,
  selectedCandidateIds,
  onToggle,
  cost,
  costLoading,
}: {
  sequenceSet: SequenceSet
  selectedCandidateIds: ReadonlySet<string>
  onToggle: (id: string) => void
  cost: CostEstimate | null
  costLoading: boolean
}) {
  return (
    <section className="card" aria-label="Budget" data-testid="budget-panel">
      <h2 className="card-title">4. Candidates &amp; budget</h2>
      <p className="card-hint">Deselect candidates to fit the customer budget. Rejected sequences are excluded automatically.</p>

      <ul className="candidate-list">
        {sequenceSet.acceptedIds.map((id) => (
          <li key={id} className="candidate-item">
            <label>
              <input
                type="checkbox"
                data-testid={`candidate-toggle-${id}`}
                checked={selectedCandidateIds.has(id)}
                onChange={() => onToggle(id)}
              />
              {id}
            </label>
          </li>
        ))}
      </ul>

      {cost && (
        <div className="cost-breakdown" data-testid="cost-breakdown">
          <ul className="cost-line-items">
            {cost.lineItems.map((li) => (
              <li key={li.label}>
                <span>{li.label}</span>
                <span>{formatMoney(li.amountMinor, cost.currency)}</span>
              </li>
            ))}
          </ul>
          <div className="cost-total">
            <span>Total</span>
            <span data-testid="cost-total">{formatMoney(cost.totalMinor, cost.currency)}</span>
          </div>
          {!cost.withinBudget && (
            <p data-testid="over-budget" className="over-budget">
              Over budget by {formatMoney(cost.overageMinor, cost.currency)} — deselect AC-7 and AC-8 to fit.
            </p>
          )}
        </div>
      )}
      {costLoading && <p className="card-hint">Recalculating…</p>}
    </section>
  )
}
