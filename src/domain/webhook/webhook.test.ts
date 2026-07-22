import { describe, it, expect } from 'vitest'
import { verifyUpdateSignature } from './verify'
import { crossCheckHeaders } from './envelope'
import { decideTransition } from './transition'
import { signedUpdate } from '../../../fixtures/updates'
const u = signedUpdate({ experimentId: 'e', experimentCode: 'EXP-1', name: 'Quote sent', description: 'd', updateType: 'quote' }, 'sec', 'D1')
describe('signature + header cross-check', () => {
  it('accepts a correct signature over the raw body', () => expect(verifyUpdateSignature(u.rawBody, u.headers['X-Adaptyv-Signature'], 'sec')).toBe(true))
  it('rejects wrong/missing/misformatted signatures', () => { expect(verifyUpdateSignature(u.rawBody, 'sha256=bad', 'sec')).toBe(false); expect(verifyUpdateSignature(u.rawBody, null, 'sec')).toBe(false) })
  it('cross-checks header event + delivery id against the body', () => { expect(crossCheckHeaders(u.headers, u.body)).toBe(true); expect(crossCheckHeaders({ ...u.headers, 'X-Adaptyv-Delivery-Id': 'D9' }, u.body)).toBe(false) })
})
describe('decideTransition', () => { it('forward applies, duplicate/backward ignore, Canceled + terminal', () => {
  expect(decideTransition(null, 'Draft')).toBe('apply'); expect(decideTransition('InQueue', 'Done')).toBe('apply')
  expect(decideTransition('Done', 'Done')).toBe('ignore'); expect(decideTransition('InProduction', 'InQueue')).toBe('ignore')
  expect(decideTransition('InQueue', 'Canceled')).toBe('apply'); expect(decideTransition('Done', 'Canceled')).toBe('ignore') }) })
