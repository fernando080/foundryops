export type FoundryMode = 'mock' | 'sandbox' | 'live'
export type LlmProvider = 'stub' | 'gemini'

const read = (n: string, f?: string) => {
  const v = process.env[n]
  return v === undefined || v === '' ? f : v
}

export const env = {
  llmProvider: read('LLM_PROVIDER', 'stub') as LlmProvider,
  foundryMode: read('FOUNDRY_MODE', 'mock') as FoundryMode,
  geminiApiKey: read('GEMINI_API_KEY'),
  foundryToken: read('FOUNDRY_TOKEN'),
  webhookSecret: read('FOUNDRY_WEBHOOK_SECRET', 'demo-secret')!,
  dbPath: read('FOUNDRYOPS_DB_PATH', ':memory:')!,
}

export function assertLiveAllowed(): void {
  if (env.foundryMode === 'live' && !env.foundryToken) {
    throw new Error('FOUNDRY_MODE=live requires FOUNDRY_TOKEN')
  }
}
