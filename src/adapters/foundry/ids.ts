import type { DraftIdGenerator } from '@/application/ports'
import { sha256Hex } from '@/infrastructure/crypto/hash'

export class MockDraftIdGenerator implements DraftIdGenerator {
  idFor(operationKey: string): string {
    return `exp_${sha256Hex(operationKey).slice(0, 10)}`
  }
}
