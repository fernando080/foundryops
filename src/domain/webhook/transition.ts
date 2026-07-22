import { EXPERIMENT_STATUS_RANK } from '@/domain/constants'
export function decideTransition(current: string | null, incoming: string): 'apply' | 'ignore' {
  if (incoming === 'Canceled') return current === 'Canceled' || current === 'Done' ? 'ignore' : 'apply'
  const ir = (EXPERIMENT_STATUS_RANK as Record<string, number>)[incoming]; if (!ir) return 'ignore'
  if (current === 'Done' || current === 'Canceled') return 'ignore'
  const cr = current ? (EXPERIMENT_STATUS_RANK as Record<string, number>)[current] ?? 0 : 0
  return ir > cr ? 'apply' : 'ignore'
}
