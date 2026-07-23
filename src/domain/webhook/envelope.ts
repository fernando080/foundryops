export function crossCheckHeaders(headers: Record<string, string>, body: unknown): boolean {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return false
  const b = body as { event?: unknown; delivery_id?: unknown }
  return headers['X-Adaptyv-Event'] === b.event && headers['X-Adaptyv-Delivery-Id'] === b.delivery_id
}
