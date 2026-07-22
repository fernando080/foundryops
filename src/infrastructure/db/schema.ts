// Drizzle sqlite-core schema mirroring the runtime schema defined by `migrate()` in ./client.ts.
// This file is for drizzle-kit tooling only (introspection/diffing convenience); it is not
// imported at runtime. The raw SQL in `migrate()` remains the authoritative runtime schema.
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const requests = sqliteTable('requests', {
  id: text('id').primaryKey(),
  intentJson: text('intent_json'),
  sequencesJson: text('sequences_json'),
  payloadJson: text('payload_json'),
  payloadHash: text('payload_hash'),
  payloadVersion: integer('payload_version'),
  requestState: text('request_state').notNull(),
})

export const approvals = sqliteTable('approvals', {
  id: text('id').primaryKey(),
  requestId: text('request_id').notNull(),
  operation: text('operation').notNull(),
  environment: text('environment').notNull(),
  payloadHash: text('payload_hash').notNull(),
  payloadVersion: integer('payload_version').notNull(),
  costSnapshotMinor: integer('cost_snapshot_minor').notNull(),
  actor: text('actor').notNull(),
  issuedAt: text('issued_at').notNull(),
  expiresAt: text('expires_at').notNull(),
  status: text('status').notNull(),
  consumedAt: text('consumed_at'),
})

export const draftOperations = sqliteTable('draft_operations', {
  operationKey: text('operation_key').primaryKey(),
  experimentId: text('experiment_id').notNull(),
  requestId: text('request_id').notNull(),
})

export const updateLog = sqliteTable('update_log', {
  deliveryId: text('delivery_id').primaryKey(),
  experimentId: text('experiment_id').notNull(),
  updateType: text('update_type'),
  name: text('name'),
  description: text('description'),
  raw: text('raw').notNull(),
})

export const experimentStatus = sqliteTable('experiment_status', {
  experimentId: text('experiment_id').primaryKey(),
  status: text('status').notNull(),
})

export const eventLog = sqliteTable('event_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  kind: text('kind').notNull(),
  detail: text('detail').notNull(),
  at: text('at').notNull(),
})
