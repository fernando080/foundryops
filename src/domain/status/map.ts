import { WIRE_STATUS_MAP } from '@/domain/constants'
import type { ExperimentStatus } from '@/domain/schemas'
export function mapWireStatus(wire: string): ExperimentStatus | null { return (WIRE_STATUS_MAP as Record<string, ExperimentStatus>)[wire] ?? null }
