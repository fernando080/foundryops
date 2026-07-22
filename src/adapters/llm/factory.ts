import type { LlmClient } from '@/application/ports'
import { env } from '@/infrastructure/config/env'
import { DeterministicLlmAdapter } from './deterministic'

export function buildLlmClient(): LlmClient {
  if (env.llmProvider === 'stub') return new DeterministicLlmAdapter()
  throw new Error(`Unsupported LLM_PROVIDER: ${env.llmProvider}`)
}
