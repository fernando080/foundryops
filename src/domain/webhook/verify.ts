import { createHmac, timingSafeEqual } from 'node:crypto'
export function verifyUpdateSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) return false
  const m = /^sha256=([0-9a-f]+)$/i.exec(signatureHeader.trim()); if (!m) return false
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const a = Buffer.from(expected), b = Buffer.from(m[1]!.toLowerCase())
  return a.length === b.length && timingSafeEqual(a, b)
}
