import type { Sequence, SequenceSet, PreflightFinding } from '@/domain/schemas'
const VALID_AA = new Set('ACDEFGHIKLMNPQRSTVWY'.split(''))
export function runPreflight(input: { sequences: Sequence[]; requestedCount: number | null }): { findings: PreflightFinding[]; sequenceSet: SequenceSet } {
  const { sequences, requestedCount } = input; const findings: PreflightFinding[] = []
  const accepted: string[] = [], rejected: string[] = []; const seenHash = new Map<string, string>(); const seenId = new Set<string>()
  if (sequences.length === 0) { findings.push({ code: 'EMPTY_INPUT', severity: 'error', message: 'No sequences were uploaded.',
    evidenceLocation: { sequenceId: null, position: null }, remediation: 'Upload a FASTA with at least one sequence.', blocksProgression: true })
    return { findings, sequenceSet: { sequences, acceptedIds: [], rejectedIds: [] } } }
  for (const seq of sequences) { let bad = false
    if (seenId.has(seq.id)) { findings.push({ code: 'DUPLICATE_ID', severity: 'error', message: `Duplicate sequence id ${seq.id}.`,
      evidenceLocation: { sequenceId: seq.id, position: null }, remediation: 'Give each sequence a unique id.', blocksProgression: false }); bad = true }
    seenId.add(seq.id)
    const bare = seq.residues.replace(/:/g, ''); const i = [...bare].findIndex(c => !VALID_AA.has(c))
    if (i >= 0) { findings.push({ code: 'INVALID_RESIDUE', severity: 'error', message: `Sequence ${seq.id} has invalid residue '${bare[i]}' at position ${i + 1}.`,
      evidenceLocation: { sequenceId: seq.id, position: i + 1 }, remediation: 'Only the 20 standard amino acids are accepted.', blocksProgression: false }); bad = true }
    const prior = seenHash.get(seq.normHash)
    if (prior !== undefined) { findings.push({ code: 'DUPLICATE_SEQUENCE', severity: 'error', message: `Sequence ${seq.id} is identical to ${prior}.`,
      evidenceLocation: { sequenceId: seq.id, position: null }, remediation: 'Remove the duplicate; it is counted once.', blocksProgression: false, duplicateOf: prior }); bad = true }
    else seenHash.set(seq.normHash, seq.id)
    ;(bad ? rejected : accepted).push(seq.id) }
  if (requestedCount !== null && requestedCount !== sequences.length) findings.push({ code: 'COUNT_MISMATCH', severity: 'warning',
    message: `Requested ${requestedCount} but ${sequences.length} uploaded.`, evidenceLocation: { sequenceId: null, position: null }, remediation: 'Confirm the intended count.', blocksProgression: false })
  return { findings, sequenceSet: { sequences, acceptedIds: accepted, rejectedIds: rejected } }
}
