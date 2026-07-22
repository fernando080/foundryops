import type { Target, TargetResolution } from '@/domain/schemas'

export function resolveTarget(
  query: string | null,
  candidates: Target[]
): TargetResolution {
  if (
    query === null ||
    query.trim() === '' ||
    candidates.length === 0
  )
    return {
      query: query ?? '',
      chosen: null,
      alternatives: candidates,
      status: 'missing',
    }

  const q = query.trim().toLowerCase()
  const m = candidates.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      t.aliases.some((a) => a.toLowerCase() === q)
  )

  if (m.length === 1)
    return { query, chosen: m[0]!, alternatives: m, status: 'resolved' }
  if (m.length > 1)
    return { query, chosen: null, alternatives: m, status: 'ambiguous' }
  return { query, chosen: null, alternatives: candidates, status: 'missing' }
}
