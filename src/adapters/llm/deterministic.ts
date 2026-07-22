import type { LlmClient } from '@/application/ports'
import type { RawExtractedIntent } from '@/domain/schemas'
import { sha256Hex } from '@/infrastructure/crypto/hash'
import { DEMO_REQUEST_TEXT, DEMO_REQUEST_NO_BUDGET } from '../../../fixtures/request'
import { demoRawIntent, demoRawIntentNoBudget } from '../../../fixtures/intent'
const normalize = (t: string) => t.trim().replace(/\s+/g, ' ').toLowerCase()
const TABLE: Record<string, RawExtractedIntent> = { [sha256Hex(normalize(DEMO_REQUEST_TEXT))]: demoRawIntent, [sha256Hex(normalize(DEMO_REQUEST_NO_BUDGET))]: demoRawIntentNoBudget }
export class DeterministicLlmAdapter implements LlmClient {
  async extractIntent({ requestText }: { requestText: string }) {
    const hit = TABLE[sha256Hex(normalize(requestText))]
    return hit ? { ok: true as const, raw: hit } : { ok: false as const, error: 'NO_STUB_FIXTURE' }
  }
  async draftCustomerUpdate({ evidenceBundle }: { evidenceBundle: import('@/domain/schemas').EvidenceBundle }) {
    const has = (id: string) => evidenceBundle.records.some((r) => r.id === id)
    const segments: import('@/domain/schemas').CustomerDraftSegment[] = []
    for (const cid of ['AC-1', 'AC-2', 'AC-3', 'AC-4']) {
      if (!has(`ev_${cid}_class`)) continue
      segments.push({ kind: 'evidence', evidenceId: `ev_${cid}_name`, claimType: 'confirmed', prefix: '', suffix: '' })
      segments.push({ kind: 'text', text: ' is ' })
      segments.push({ kind: 'evidence', evidenceId: `ev_${cid}_class`, claimType: 'confirmed', prefix: '', suffix: '' })
      if (has(`ev_${cid}_kd`)) { segments.push({ kind: 'text', text: ' with a dissociation constant of ' })
        segments.push({ kind: 'evidence', evidenceId: `ev_${cid}_kd`, claimType: 'confirmed', prefix: '', suffix: '' }) }
      segments.push({ kind: 'text', text: ' and is ' })
      segments.push({ kind: 'evidence', evidenceId: `ev_${cid}_reco`, claimType: 'recommendation', prefix: '', suffix: '.' })
      segments.push({ kind: 'text', text: '\n' })
    }
    return { ok: true as const, draft: { segments, generatedBy: { adapter: 'deterministic', model: 'stub', promptHash: 'fixed' }, status: 'draft' as const } }
  }
}
