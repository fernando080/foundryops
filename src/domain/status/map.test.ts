import { describe, it, expect } from 'vitest'; import { mapWireStatus } from './map'
describe('mapWireStatus', () => { it('maps valid wire enums and rejects unknown', () => { expect(mapWireStatus('waiting_for_confirmation')).toBe('WaitingForConfirmation'); expect(mapWireStatus('done')).toBe('Done'); expect(mapWireStatus('bogus')).toBeNull() }) })
