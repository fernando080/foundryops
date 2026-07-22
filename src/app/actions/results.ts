'use server'
import { buildFoundryClient } from '@/adapters/foundry/factory'
import { buildLlmClient } from '@/adapters/llm/factory'
import { reviewResults } from '@/application/reviewResults'
import { draftCustomerUpdate } from '@/application/draftComms'
export async function resultsAction(experimentId: string) {
  const foundry = buildFoundryClient()
  const { pairs, bundle } = await reviewResults(foundry, experimentId)
  const llm = await buildLlmClient()
  const draft = await draftCustomerUpdate(llm, bundle)
  return { pairs, bundle, draft }
}
