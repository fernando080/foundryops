export type StepStatus = 'locked' | 'active' | 'complete'

export interface StepNode {
  id: string
  label: string
  status: StepStatus
}

const ICON: Record<StepStatus, string> = {
  locked: '🔒',
  active: '●',
  complete: '✓',
}

export function Stepper({ nodes }: { nodes: StepNode[] }) {
  return (
    <ol className="stepper" data-testid="stepper">
      {nodes.map((n) => (
        <li key={n.id} className={`stepper-node stepper-node-${n.status}`} data-testid={`stepper-node-${n.id}`} data-status={n.status}>
          <span className="stepper-icon" aria-hidden="true">
            {ICON[n.status]}
          </span>
          <span className="stepper-label">{n.label}</span>
        </li>
      ))}
    </ol>
  )
}
