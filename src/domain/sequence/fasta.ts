import type { Sequence } from '@/domain/schemas'
import { sha256Hex } from '@/infrastructure/crypto/hash'
export const normalizeResidues = (raw: string) => raw.replace(/\s+/g, '').toUpperCase()
export function parseFasta(text: string, fileName: string): Sequence[] {
  const lines = text.split(/\r?\n/); const out: Sequence[] = []
  let cur: { header: string; id: string; body: string[]; start: number } | null = null
  const flush = (end: number) => { if (!cur) return; const residues = normalizeResidues(cur.body.join(''))
    out.push({ id: cur.id, rawHeader: cur.header, residues, chains: residues.split(':'),
      length: residues.replace(/:/g, '').length, normHash: sha256Hex(residues),
      sourceLoc: { file: fileName, lineStart: cur.start, lineEnd: end } }) }
  lines.forEach((line, i) => { const n = i + 1
    if (line.startsWith('>')) { if (cur) flush(n - 1); const header = line.slice(1).trim()
      cur = { header, id: header.split(/\s+/)[0] ?? `seq-${n}`, body: [], start: n } }
    else if (cur && line.trim() !== '') cur.body.push(line) })
  if (cur) flush(lines.length); return out
}
