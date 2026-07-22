import type { RawExtractedIntent, EvidenceBundle, CustomerDraft, Target, CostEstimate, DraftPayload, ResultRecord } from '@/domain/schemas'
export interface FoundryClient {
  searchTargets(q: { query: string }): Promise<Target[]>
  estimateCost(input: { acceptedCount: number; budgetMinor: number | null }): Promise<CostEstimate>
  createDraft(input: DraftPayload, opts: { operationKey: string }): Promise<{ experimentId: string; draftId: string }>
  getExperimentStatus(experimentId: string): Promise<{ statusWire: string }>
  getResults(experimentId: string): Promise<ResultRecord[]>
}
export interface DraftIdGenerator { idFor(operationKey: string): string }
export interface LlmClient {
  extractIntent(input: { requestText: string }): Promise<{ ok: true; raw: RawExtractedIntent } | { ok: false; error: string }>
  draftCustomerUpdate(input: { evidenceBundle: EvidenceBundle }): Promise<{ ok: true; draft: CustomerDraft } | { ok: false; error: string }>
}
