import type { DraftPayload } from '@/domain/schemas'
import { sha256Hex } from '@/infrastructure/crypto/hash'
import { CANONICALIZER_VERSION } from '@/domain/constants'
const FIELD_CLASS = { method: 'semantic', experimentType: 'semantic', targetId: 'semantic', sequences: 'semantic',
  concentrations: 'semantic', replicates: 'semantic', costTotalMinor: 'semantic', currency: 'semantic',
  environment: 'semantic', operation: 'semantic', canonicalizerVersion: 'semantic',
  version: 'volatile', costEstimateRef: 'volatile', requestId: 'volatile', canonicalHash: 'volatile', createdAt: 'volatile',
} satisfies Record<keyof DraftPayload, 'semantic' | 'volatile'>
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const nfc = (s: string) => s.normalize('NFC')
export function canonicalizeDraftPayload(p: DraftPayload): string {
  for (const k of Object.keys(p)) if (!(k in FIELD_CLASS)) throw new Error(`Unclassified payload field: ${k}`)
  if (p.canonicalizerVersion !== CANONICALIZER_VERSION) throw new Error(`unexpected canonicalizerVersion: ${p.canonicalizerVersion}`)
  if (!Number.isInteger(p.costTotalMinor)) throw new Error('costTotalMinor must be an integer (minor units)')
  const sequences = [...p.sequences].map(s => ({ id: nfc(s.id), residues: nfc(s.residues) })).sort((a, b) => cmp(a.id, b.id))
  const concentrations = [...p.concentrations].sort((a, b) => a - b)
  const ordered: [string, unknown][] = [ ['method', p.method], ['experimentType', p.experimentType], ['targetId', nfc(p.targetId)],
    ['sequences', sequences], ['concentrations', concentrations], ['replicates', p.replicates], ['costTotalMinor', p.costTotalMinor],
    ['currency', nfc(p.currency)], ['environment', p.environment], ['operation', p.operation], ['canonicalizerVersion', p.canonicalizerVersion] ]
  return JSON.stringify(ordered)
}
export const hashDraftPayload = (p: DraftPayload) => sha256Hex(canonicalizeDraftPayload(p))
