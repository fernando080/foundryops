import type { ResultRecord, Measurement } from '@/domain/schemas'
const CONC = [1e-7, 3e-8, 1e-8, 3e-9, 1e-9, 4e-10]
const series = (candidateId: string, scale: number): Measurement[] =>
  CONC.flatMap(c => [0, 1, 2].map(rep => ({ candidateId, concentrationM: c, replicateIndex: rep, responseValue: Number((scale * (1 - Math.exp(-c / 1e-8))).toFixed(4)) })))
const rec = (candidateId: string, over: Partial<ResultRecord>): ResultRecord => ({ experimentId: 'exp-demo', candidateId,
  replicateKdsM: null, konPerMs: null, koffPerS: null, kdMeanM: null, rmseMaxSignalPct: null, fitQualityReported: null, confidence: null, controlOutcome: 'pass', measurements: series(candidateId, 1), ...over })
export const demoResultRecords: ResultRecord[] = [
  rec('AC-1', { replicateKdsM: [2.0e-9, 2.1e-9, 1.95e-9], kdMeanM: 2.02e-9, konPerMs: 3.1e5, koffPerS: 6.3e-4, rmseMaxSignalPct: 4.2, fitQualityReported: 'good', confidence: 'high' }),
  rec('AC-2', { replicateKdsM: [40e-9, 44e-9, 38e-9], kdMeanM: 40.7e-9, konPerMs: 1.2e5, koffPerS: 4.9e-3, rmseMaxSignalPct: 22.5, fitQualityReported: 'poor', confidence: 'low' }),
  rec('AC-3', { replicateKdsM: null, kdMeanM: null, rmseMaxSignalPct: null, fitQualityReported: 'poor', confidence: 'low' }),
  rec('AC-4', { replicateKdsM: [5e-9, 500e-9, 250e-9], kdMeanM: 251.7e-9, rmseMaxSignalPct: 30, fitQualityReported: 'medium', confidence: 'low' }),
]
