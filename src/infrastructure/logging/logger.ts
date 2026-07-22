const ALLOW = new Set(['event', 'kind', 'processingStatus', 'experimentId', 'code', 'severity', 'stage', 'env'])
export function logEvent(fields: Record<string, unknown>): void {
  const safe: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(fields)) if (ALLOW.has(k)) safe[k] = v
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(safe))
}
