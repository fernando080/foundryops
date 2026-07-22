import { SETUP_COST_MINOR, PER_CANDIDATE_MINOR } from '@/domain/constants'

export function applyBudget(
  totalMinor: number,
  budgetMinor: number | null
): {
  withinBudget: boolean
  overageMinor: number
  maxWithinBudget: number | null
} {
  if (budgetMinor === null)
    return { withinBudget: true, overageMinor: 0, maxWithinBudget: null }
  return {
    withinBudget: totalMinor <= budgetMinor,
    overageMinor: Math.max(0, totalMinor - budgetMinor),
    maxWithinBudget: Math.max(
      0,
      Math.floor((budgetMinor - SETUP_COST_MINOR) / PER_CANDIDATE_MINOR)
    ),
  }
}
