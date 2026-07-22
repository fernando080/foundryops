import type { LlmClient } from './ports'
import type { EvidenceBundle, CustomerDraft } from '@/domain/schemas'
import { validateCustomerDraft, renderCustomerDraft } from '@/domain/comms/compose'
export async function draftCustomerUpdate(llm: LlmClient, bundle: EvidenceBundle): Promise<{ ok: boolean; draft?: CustomerDraft; rendered?: string; errors?: { code: string; detail: string }[] }> {
  const res = await llm.draftCustomerUpdate({ evidenceBundle: bundle })
  if (!res.ok) return { ok: false, errors: [{ code: 'LLM_ERROR', detail: res.error }] }
  const v = validateCustomerDraft(res.draft, bundle)
  if (!v.ok) return { ok: false, draft: res.draft, errors: v.errors }
  return { ok: true, draft: res.draft, rendered: renderCustomerDraft(res.draft, bundle) }
}
