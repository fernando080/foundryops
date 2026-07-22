import type { FoundryMode } from '@/infrastructure/config/env'

export function EnvBadge({ mode }: { mode: FoundryMode }) {
  return (
    <span className={`env-badge env-badge-${mode}`} data-testid="env-badge" data-mode={mode}>
      {mode.toUpperCase()}
    </span>
  )
}
