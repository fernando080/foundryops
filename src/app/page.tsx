import { env } from '@/infrastructure/config/env'
import { Workspace } from '@/components/Workspace'

export default function HomePage() {
  return <Workspace foundryMode={env.foundryMode} />
}
