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
  async draftCustomerUpdate() { return { ok: false as const, error: 'not implemented until slice 4' } }
}
