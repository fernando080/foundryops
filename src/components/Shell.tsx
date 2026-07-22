import type { ReactNode } from 'react'
import type { FoundryMode } from '@/infrastructure/config/env'
import { EnvBadge } from './EnvBadge'
import { Stepper, type StepNode } from './Stepper'

export function Shell({
  foundryMode,
  stageNodes,
  children,
}: {
  foundryMode: FoundryMode
  stageNodes: StepNode[]
  children: ReactNode
}) {
  const liveMutationsDisabled = foundryMode !== 'live'
  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-brand">
          <span className="topbar-title">FoundryOps</span>
          <span className="topbar-subtitle">Foundry experiment workspace</span>
        </div>
        <div className="topbar-right">
          {liveMutationsDisabled && (
            <span className="lock-badge" data-testid="live-mutations-lock" title="Live mutations are disabled in this environment">
              <span aria-hidden="true">🔒</span> Live mutations disabled
            </span>
          )}
          <EnvBadge mode={foundryMode} />
        </div>
      </header>
      <div className="shell-body">
        <nav className="shell-rail" aria-label="Workflow stages">
          <Stepper nodes={stageNodes} />
        </nav>
        <main className="shell-content">{children}</main>
      </div>
    </div>
  )
}
