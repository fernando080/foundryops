import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { env } from '@/infrastructure/config/env'
export type Db = Database.Database
export function getDb(path: string): Db {
  // On a clean checkout (or a fresh e2e run against ./data/e2e.db) the parent
  // directory doesn't exist yet, and better-sqlite3 fails to create the file
  // in a missing directory. ':memory:' has no parent directory to create.
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  return db
}
let shared: Db | null = null
export function getSharedDb(): Db { if (!shared) { shared = getDb(env.dbPath); migrate(shared) } return shared }
export function migrate(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, intent_json TEXT, sequences_json TEXT, payload_json TEXT, payload_hash TEXT, payload_version INTEGER, request_state TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS approvals (id TEXT PRIMARY KEY, request_id TEXT NOT NULL, operation TEXT NOT NULL, environment TEXT NOT NULL, payload_hash TEXT NOT NULL, payload_version INTEGER NOT NULL, cost_snapshot_minor INTEGER NOT NULL, actor TEXT NOT NULL, issued_at TEXT NOT NULL, expires_at TEXT NOT NULL, status TEXT NOT NULL, consumed_at TEXT);
    CREATE TABLE IF NOT EXISTS draft_operations (operation_key TEXT PRIMARY KEY, experiment_id TEXT NOT NULL, request_id TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS update_log (delivery_id TEXT PRIMARY KEY, experiment_id TEXT NOT NULL, update_type TEXT, name TEXT, description TEXT, raw TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS experiment_status (experiment_id TEXT PRIMARY KEY, status TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS event_log (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, detail TEXT NOT NULL, at TEXT NOT NULL);
  `)
}
