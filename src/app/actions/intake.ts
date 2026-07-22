'use server'
import { buildFoundryClient } from '@/adapters/foundry/factory'
import { buildLlmClient } from '@/adapters/llm/factory'
import { runIntake } from '@/application/intake'
import { estimate } from '@/application/estimate'

export async function intakeAction(requestText: string, fastaText: string) {
  try {
    const foundry = buildFoundryClient()
    const llm = await buildLlmClient()
    const r = await runIntake(llm, foundry, requestText, fastaText)
    const budgetMinor = r.intentResult.ok ? r.intentResult.intent.budget?.amountMinor ?? null : null
    const cost = await estimate(foundry, r.sequenceSet.acceptedIds.length, budgetMinor)
    return { ok: true as const, intentResult: r.intentResult, findings: r.findings, sequenceSet: r.sequenceSet, resolution: r.resolution, cost, budgetMinor }
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : 'NO_STUB_FIXTURE' }
  }
}

export async function estimateAction(acceptedCount: number, budgetMinor: number | null) {
  return estimate(buildFoundryClient(), acceptedCount, budgetMinor)
}
