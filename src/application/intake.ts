import type { FoundryClient, LlmClient } from './ports'
import { validateIntent } from '@/domain/intent/validate'
import { parseFasta } from '@/domain/sequence/fasta'
import { runPreflight } from '@/domain/preflight/engine'
import { resolveTarget } from '@/domain/target/resolve'

export async function runIntake(llm: LlmClient, foundry: FoundryClient, requestText: string, fastaText: string) {
  const extracted = await llm.extractIntent({ requestText })
  if (!extracted.ok) throw new Error(`extraction failed: ${extracted.error}`)
  const intentResult = validateIntent(extracted.raw)
  const sequences = parseFasta(fastaText, 'upload.fasta')
  const requestedCount = intentResult.ok ? intentResult.intent.requestedCount : null
  const { findings, sequenceSet } = runPreflight({ sequences, requestedCount })
  const query = intentResult.ok ? intentResult.intent.targetQuery : null
  const targets = query ? await foundry.searchTargets({ query }) : []
  const resolution = resolveTarget(query, targets)
  return { rawIntent: extracted.raw, intentResult, sequenceSet, findings, resolution }
}
