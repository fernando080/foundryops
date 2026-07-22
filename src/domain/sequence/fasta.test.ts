import { describe, it, expect } from 'vitest'
import { parseFasta } from './fasta'
const FASTA = '>AC-1 x\nMKT AYIAK\n>AC-6 y\nMKTAYIAK\n'
describe('parseFasta', () => {
  it('parses, normalizes, hashes, and matches duplicates', () => {
    const s = parseFasta(FASTA, 'f')
    expect(s[0]!.residues).toBe('MKTAYIAK'); expect(s[0]!.length).toBe(8)
    expect(s[0]!.normHash).toBe(s[1]!.normHash)
    expect(s[0]!.sourceLoc).toEqual({ file: 'f', lineStart: 1, lineEnd: 2 })
  })
})
