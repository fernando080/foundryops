import type { Db } from '@/infrastructure/db/client'
export interface RequestRow { id: string; intentJson: string | null; sequencesJson: string | null; payloadJson: string | null; payloadHash: string | null; payloadVersion: number | null; requestState: string }
export function upsertRequest(db: Db, r: { id: string; intentJson?: string; sequencesJson?: string; requestState: string }): void {
  db.prepare('INSERT INTO requests (id,intent_json,sequences_json,request_state) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET intent_json=excluded.intent_json, sequences_json=excluded.sequences_json, request_state=excluded.request_state').run(r.id, r.intentJson ?? null, r.sequencesJson ?? null, r.requestState)
}
export function getRequest(db: Db, id: string): RequestRow | undefined {
  return db.prepare('SELECT id, intent_json as intentJson, sequences_json as sequencesJson, payload_json as payloadJson, payload_hash as payloadHash, payload_version as payloadVersion, request_state as requestState FROM requests WHERE id=?').get(id) as RequestRow | undefined
}
export function setRequestPayload(db: Db, id: string, p: { payloadJson: string; payloadHash: string; payloadVersion: number }): void {
  db.prepare('UPDATE requests SET payload_json=?, payload_hash=?, payload_version=? WHERE id=?').run(p.payloadJson, p.payloadHash, p.payloadVersion, id)
}
export function setRequestState(db: Db, id: string, state: string): void { db.prepare('UPDATE requests SET request_state=? WHERE id=?').run(state, id) }
export interface ApprovalRow { id: string; requestId: string; operation: string; environment: string; payloadHash: string; payloadVersion: number; costSnapshotMinor: number; actor: string; issuedAt: string; expiresAt: string; status: string; consumedAt: string | null }
export function insertApproval(db: Db, a: Omit<ApprovalRow, 'consumedAt'>): void {
  db.prepare('INSERT INTO approvals (id,request_id,operation,environment,payload_hash,payload_version,cost_snapshot_minor,actor,issued_at,expires_at,status,consumed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,NULL)').run(a.id, a.requestId, a.operation, a.environment, a.payloadHash, a.payloadVersion, a.costSnapshotMinor, a.actor, a.issuedAt, a.expiresAt, a.status)
}
export function loadApproval(db: Db, id: string): ApprovalRow | undefined {
  return db.prepare('SELECT id, request_id as requestId, operation, environment, payload_hash as payloadHash, payload_version as payloadVersion, cost_snapshot_minor as costSnapshotMinor, actor, issued_at as issuedAt, expires_at as expiresAt, status, consumed_at as consumedAt FROM approvals WHERE id=?').get(id) as ApprovalRow | undefined
}
export function consumeApproval(db: Db, id: string, consumedAt: string): boolean {
  return db.prepare("UPDATE approvals SET status='consumed', consumed_at=? WHERE id=? AND status='valid'").run(consumedAt, id).changes === 1
}
export function insertDraftOperationOnce(db: Db, operationKey: string, r: { experimentId: string; requestId: string }): boolean {
  return db.prepare('INSERT OR IGNORE INTO draft_operations (operation_key,experiment_id,request_id) VALUES (?,?,?)').run(operationKey, r.experimentId, r.requestId).changes === 1
}
export function getDraftOperation(db: Db, operationKey: string): { experimentId: string } | undefined {
  return db.prepare('SELECT experiment_id as experimentId FROM draft_operations WHERE operation_key=?').get(operationKey) as { experimentId: string } | undefined
}
export function insertUpdateOnce(db: Db, deliveryId: string, r: { experimentId: string; updateType: string; name: string; description: string; raw: string }): boolean {
  return db.prepare('INSERT OR IGNORE INTO update_log (delivery_id,experiment_id,update_type,name,description,raw) VALUES (?,?,?,?,?,?)').run(deliveryId, r.experimentId, r.updateType, r.name, r.description, r.raw).changes === 1
}
export function getUpdates(db: Db, experimentId: string): Array<{ deliveryId: string; updateType: string; name: string; description: string }> {
  return db.prepare('SELECT delivery_id as deliveryId, update_type as updateType, name, description FROM update_log WHERE experiment_id=? ORDER BY rowid ASC').all(experimentId) as Array<{ deliveryId: string; updateType: string; name: string; description: string }>
}
export function getExperimentStatusRow(db: Db, experimentId: string): string | null {
  const row = db.prepare('SELECT status FROM experiment_status WHERE experiment_id=?').get(experimentId) as { status: string } | undefined
  return row?.status ?? null
}
export function setExperimentStatus(db: Db, experimentId: string, status: string): void {
  db.prepare('INSERT INTO experiment_status (experiment_id,status) VALUES (?,?) ON CONFLICT(experiment_id) DO UPDATE SET status=excluded.status').run(experimentId, status)
}
export function appendEvent(db: Db, e: { kind: string; detail: string; at: string }): void {
  db.prepare('INSERT INTO event_log (kind,detail,at) VALUES (?,?,?)').run(e.kind, e.detail, e.at)
}
