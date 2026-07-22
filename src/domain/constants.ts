export const SETUP_COST_MINOR = 250_000
export const PER_CANDIDATE_MINOR = 120_000
export const DEMO_BUDGET_MINOR = 800_000
export const CANONICALIZER_VERSION = 'canon@v1'
export const WEBHOOK_API_VERSION = '2026-02'
export const demoQcPolicyV1 = { version: 'demo-qc-policy@v1', fit: { rmseMaxPct: 15 }, replicate: { cvMax: 0.2 }, binding: { kdMaxBinderM: 1e-6 } } as const
export const EXPERIMENT_STATUS_RANK = { Draft: 1, WaitingForConfirmation: 2, QuoteSent: 3, WaitingForMaterials: 4, InQueue: 5, InProduction: 6, DataAnalysis: 7, InReview: 8, Done: 9 } as const
export const WIRE_STATUS_MAP = { draft: 'Draft', waiting_for_confirmation: 'WaitingForConfirmation', quote_sent: 'QuoteSent', waiting_for_materials: 'WaitingForMaterials', in_queue: 'InQueue', in_production: 'InProduction', data_analysis: 'DataAnalysis', in_review: 'InReview', done: 'Done', canceled: 'Canceled' } as const
