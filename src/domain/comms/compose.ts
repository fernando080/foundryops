import type { CustomerDraft, EvidenceBundle, EvidenceRecord } from '@/domain/schemas'
import { resolveEvidence } from '@/domain/evidence/bundle'
const DIGIT = /\d/
const claimTypeMatchesKind = (claimType: string, kind: EvidenceRecord['kind']) =>
  claimType === 'recommendation' ? kind === 'approved_recommendation' : kind !== 'approved_recommendation'
function formatEvidence(r: EvidenceRecord): string { return r.valueKind === 'categorical' ? (r.categoricalValue ?? r.displayLabel) : `${r.numericValue}${r.unit ? ' ' + r.unit : ''}` }
export function validateCustomerDraft(draft: CustomerDraft, bundle: EvidenceBundle): { ok: boolean; errors: { code: string; detail: string }[] } {
  const errors: { code: string; detail: string }[] = []
  for (const s of draft.segments) {
    if (s.kind === 'text') { if (DIGIT.test(s.text)) errors.push({ code: 'TEXT_SEGMENT_HAS_NUMBER', detail: s.text }); continue }
    if (DIGIT.test(s.prefix) || DIGIT.test(s.suffix)) errors.push({ code: 'TEXT_SEGMENT_HAS_NUMBER', detail: `${s.prefix}|${s.suffix}` })
    const ev = resolveEvidence(bundle, s.evidenceId)
    if (!ev) { errors.push({ code: 'EVIDENCE_NOT_FOUND', detail: s.evidenceId }); continue }
    if (!claimTypeMatchesKind(s.claimType, ev.kind)) errors.push({ code: 'CLAIMTYPE_EVIDENCE_MISMATCH', detail: `${s.claimType} vs ${ev.kind}` })
  }
  return { ok: errors.length === 0, errors }
}
export function renderCustomerDraft(draft: CustomerDraft, bundle: EvidenceBundle): string {
  const v = validateCustomerDraft(draft, bundle); if (!v.ok) throw new Error(`draft not renderable: ${v.errors.map(e => e.code).join(',')}`)
  return draft.segments.map(s => s.kind === 'text' ? s.text : s.prefix + formatEvidence(resolveEvidence(bundle, s.evidenceId)!) + s.suffix).join('')
}
