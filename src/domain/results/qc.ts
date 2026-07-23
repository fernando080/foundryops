import type { ResultRecord, QCResult } from '@/domain/schemas'
import { demoQcPolicyV1 as P } from '@/domain/constants'
export function coefficientOfVariation(values: number[]): number { const n = values.length; if (n < 2) return 0
  const mean = values.reduce((a, b) => a + b, 0) / n; return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) / mean }
export function classifyCandidate(rec: ResultRecord): QCResult {
  const warnings: string[] = []
  const kds = rec.replicateKdsM ?? []
  const cv = kds.length ? coefficientOfVariation(kds) : null
  const meanKd = rec.kdMeanM
  const controlFail = rec.controlOutcome === 'fail'
  const kdInvalid = meanKd !== null && (!Number.isFinite(meanKd) || meanKd <= 0)
  const determinable = meanKd !== null && Number.isFinite(meanKd) && meanKd > 0
  if (controlFail) warnings.push('CONTROL_FAILED')
  if (kdInvalid) warnings.push('INVALID_KD')
  const consistent = cv !== null && cv <= P.replicate.cvMax
  const repStatus: 'consistent' | 'inconsistent' | 'not_applicable' = !determinable || cv === null ? 'not_applicable' : consistent ? 'consistent' : 'inconsistent'
  const fitPass = rec.rmseMaxSignalPct !== null && rec.rmseMaxSignalPct <= P.fit.rmseMaxPct && rec.fitQualityReported !== 'poor'
  const fitStatus: 'pass' | 'fail' | 'not_applicable' = !determinable || rec.rmseMaxSignalPct === null ? 'not_applicable' : fitPass ? 'pass' : 'fail'
  let bindingClass: QCResult['bindingClass']
  if (!determinable) { bindingClass = 'no_detectable_binding'; if (meanKd === null) warnings.push('KD_NOT_DETERMINABLE') }
  else if (repStatus === 'inconsistent') { bindingClass = 'inconclusive_replicate_inconsistent'; warnings.push('REPLICATE_CV_EXCEEDED') }
  else if (fitStatus === 'fail') { bindingClass = 'apparent_binder_poor_fit'; warnings.push('LOW_FIT') }
  else if (meanKd <= P.binding.kdMaxBinderM) bindingClass = 'confirmed_binder'
  else bindingClass = 'non_binder'
  const dataQuality: 'pass' | 'warning' | 'fail' = controlFail || kdInvalid ? 'fail' : repStatus === 'inconsistent' || fitStatus === 'fail' ? 'warning' : 'pass'
  const recommendation: QCResult['recommendation'] = dataQuality === 'fail' ? 'drop' : bindingClass === 'confirmed_binder' ? 'follow_up' : bindingClass === 'apparent_binder_poor_fit' || bindingClass === 'inconclusive_replicate_inconsistent' ? 'inconclusive' : 'drop'
  return { candidateId: rec.candidateId, dataQuality, bindingClass,
    affinity: { kdM: determinable ? meanKd : null, ciLowM: null, ciHighM: null },
    replicateConsistency: { cv, consistent, status: repStatus },
    fitQuality: { rmseMaxSignalPct: rec.rmseMaxSignalPct, reported: rec.fitQualityReported, pass: fitPass, status: fitStatus },
    confidence: rec.confidence, controlOutcome: rec.controlOutcome, recommendation, appliedThresholds: P.version, warnings }
}
