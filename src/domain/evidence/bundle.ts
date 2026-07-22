import type { ResultRecord, QCResult, EvidenceRecord, EvidenceBundle } from '@/domain/schemas'

const CLASS_LABEL: Record<string, string> = {
  confirmed_binder: 'confirmed binder',
  apparent_binder_poor_fit: 'apparent binder with a poor fit',
  no_detectable_binding: 'not a detectable binder',
  inconclusive_replicate_inconsistent: 'inconclusive due to inconsistent replicates',
  non_binder: 'a non-binder',
}

const RECO_LABEL: Record<string, string> = {
  follow_up: 'recommended for follow-up',
  inconclusive: 'flagged as inconclusive',
  drop: 'not recommended for follow-up',
}

export function buildEvidenceBundle(
  experimentId: string,
  pairs: { record: ResultRecord; qc: QCResult }[],
): EvidenceBundle {
  const records: EvidenceRecord[] = []

  const cat = (
    id: string,
    kind: EvidenceRecord['kind'],
    v: string,
    label: string,
    ref: string,
  ): EvidenceRecord => ({
    id,
    kind,
    valueKind: 'categorical',
    numericValue: null,
    unit: null,
    categoricalValue: v,
    displayLabel: label,
    sourceRef: ref,
    provenanceChain: [ref],
  })

  const num = (
    id: string,
    kind: EvidenceRecord['kind'],
    v: number,
    unit: string,
    label: string,
    ref: string,
  ): EvidenceRecord => ({
    id,
    kind,
    valueKind: 'numeric',
    numericValue: v,
    unit,
    categoricalValue: null,
    displayLabel: label,
    sourceRef: ref,
    provenanceChain: [ref],
  })

  for (const { record, qc } of pairs) {
    const cid = record.candidateId

    records.push(cat(`ev_${cid}_name`, 'classification', cid, `${cid} name`, `${cid}:id`))
    records.push(
      cat(
        `ev_${cid}_class`,
        'classification',
        CLASS_LABEL[qc.bindingClass] ?? qc.bindingClass,
        `${cid} class`,
        `${cid}:qc`,
      ),
    )
    records.push(
      cat(
        `ev_${cid}_reco`,
        'approved_recommendation',
        RECO_LABEL[qc.recommendation] ?? qc.recommendation,
        `${cid} recommendation`,
        `${cid}:qc`,
      ),
    )

    if (qc.affinity.kdM !== null) {
      records.push(
        num(
          `ev_${cid}_kd`,
          'qc_calculation',
          Number((qc.affinity.kdM * 1e9).toFixed(1)),
          'nM',
          `${cid} mean KD`,
          `${cid}:kd_mean`,
        ),
      )
    }

    if (qc.replicateConsistency.cv !== null) {
      records.push(
        num(
          `ev_${cid}_cv`,
          'qc_calculation',
          Number(qc.replicateConsistency.cv.toFixed(3)),
          'ratio',
          `${cid} replicate CV`,
          `${cid}:cv`,
        ),
      )
    }

    if (record.rmseMaxSignalPct !== null) {
      records.push(
        num(
          `ev_${cid}_rmse`,
          'measurement',
          record.rmseMaxSignalPct,
          '%',
          `${cid} rmse_max_signal_pct`,
          `${cid}:rmse`,
        ),
      )
    }
  }

  const binders = pairs.filter(p => p.qc.bindingClass === 'confirmed_binder').length

  return { experimentId, records, summaryStats: { candidateCount: pairs.length, confirmedBinders: binders } }
}

export const resolveEvidence = (b: EvidenceBundle, id: string) => b.records.find(r => r.id === id)
