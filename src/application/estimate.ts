import type { FoundryClient } from './ports'

export const estimate = (foundry: FoundryClient, acceptedCount: number, budgetMinor: number | null) => foundry.estimateCost({ acceptedCount, budgetMinor })
