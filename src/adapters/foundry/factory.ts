import type { FoundryClient } from '@/application/ports'
import { MockFoundryClient } from './mock'
import { MockDraftIdGenerator } from './ids'
import { env, assertLiveAllowed } from '@/infrastructure/config/env'

export function buildFoundryClient(): FoundryClient {
  if (env.foundryMode === 'mock') return new MockFoundryClient()
  assertLiveAllowed()
  throw new Error('FoundryHttpClient is stretch-only; set FOUNDRY_MODE=mock for the demo')
}

export function buildDraftIdGenerator(): import('@/application/ports').DraftIdGenerator {
  return new MockDraftIdGenerator()
}
