import { z } from 'zod'
const isoDatetime = z.string().refine((s) => !Number.isNaN(Date.parse(s)), { message: 'invalid datetime' })
export const FoundryUpdateWireSchema = z.object({
  delivery_id: z.string().min(1),
  event: z.literal('experiment_update'),
  timestamp: isoDatetime,
  api_version: z.string().regex(/^\d{4}-\d{2}$/),
  data: z.object({
    type: z.literal('experiment.update'),
    experiment_id: z.string().min(1),
    experiment_code: z.string().min(1),
    organization_id: z.string().min(1),
    update_id: z.string().min(1),
    name: z.string(),
    description: z.string(),
    update_type: z.string().min(1),
    eta: z.string().nullable(),
    created_at: isoDatetime,
  }),
})
export type FoundryUpdateWire = z.infer<typeof FoundryUpdateWireSchema>
