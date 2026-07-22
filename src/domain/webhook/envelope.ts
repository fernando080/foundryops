export function crossCheckHeaders(headers: Record<string, string>, body: { event?: string; delivery_id?: string }): boolean {
  return body.event === 'experiment_update' && headers['X-Adaptyv-Event'] === body.event && headers['X-Adaptyv-Delivery-Id'] === body.delivery_id
}
