import { createHmac, timingSafeEqual } from 'node:crypto'
export function signedUpdate(data: { experimentId: string; experimentCode: string; name: string; description: string; updateType: string; eta?: string | null }, secret: string, deliveryId: string) {
  const body = { delivery_id: deliveryId, event: 'experiment_update', timestamp: '2026-07-22T12:00:00Z', api_version: '2026-02',
    data: { type: 'experiment.update', experiment_id: data.experimentId, experiment_code: data.experimentCode, organization_id: 'org_demo', update_id: `upd_${deliveryId}`, name: data.name, description: data.description, update_type: data.updateType, eta: data.eta ?? null, created_at: '2026-07-22T12:00:00Z' } }
  const rawBody = JSON.stringify(body)
  const sig = 'sha256=' + createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  return { rawBody, body, headers: { 'X-Adaptyv-Event': 'experiment_update', 'X-Adaptyv-Delivery-Id': deliveryId, 'X-Adaptyv-Signature': sig } }
}
export function verifyForTest(rawBody: string, header: string, secret: string): boolean {
  const m = /^sha256=([0-9a-f]+)$/i.exec(header); if (!m) return false
  const exp = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const a = Buffer.from(exp), b = Buffer.from(m[1]!.toLowerCase()); return a.length === b.length && timingSafeEqual(a, b)
}
