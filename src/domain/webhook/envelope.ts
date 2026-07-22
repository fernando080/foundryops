export function crossCheckHeaders(headers: Record<string, string>, body: { event?: unknown; delivery_id?: unknown }): boolean {
  return headers['X-Adaptyv-Event'] === body.event && headers['X-Adaptyv-Delivery-Id'] === body.delivery_id
}
