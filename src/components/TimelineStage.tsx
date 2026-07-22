'use client'
import { useEffect, useState } from 'react'
import {
  replayValidUpdateAction,
  replayDuplicateUpdateAction,
  replayInvalidUpdateAction,
  refreshStatusAction,
  getTimelineAction,
} from '@/app/actions/updates'
import { StatusChip } from './StatusChip'
import { AuditDrawer, type AuditEntry } from './AuditDrawer'

interface UpdateMessage {
  deliveryId: string
  updateType: string
  name: string
  description: string
}

// Trusted timeline + status + a local audit trail — all driven by
// server-action replays of a signed webhook envelope (fixtures/updates.ts).
// There is no public webhook route in this slice: signature verification,
// header cross-check, and idempotent dedupe all happen server-side inside
// ingestUpdate, exactly as the real webhook handler would enforce them.
export function TimelineStage({ experimentId }: { experimentId: string }) {
  const [timeline, setTimeline] = useState<UpdateMessage[]>([])
  const [attempted, setAttempted] = useState(0)
  const [applied, setApplied] = useState(0)
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [auditOpen, setAuditOpen] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const [replayingValid, setReplayingValid] = useState(false)
  const [replayingDuplicate, setReplayingDuplicate] = useState(false)
  const [replayingInvalid, setReplayingInvalid] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    let cancelled = false
    setAttempted(0)
    setApplied(0)
    setAudit([])
    setStatus(null)
    getTimelineAction(experimentId).then((res) => {
      if (!cancelled) setTimeline(res.updates)
    })
    return () => {
      cancelled = true
    }
  }, [experimentId])

  async function handleReplayValid() {
    setReplayingValid(true)
    try {
      const res = await replayValidUpdateAction(experimentId)
      setAttempted((n) => n + 1)
      if (res.processingStatus === 'accepted') setApplied((n) => n + 1)
      setTimeline(res.updates)
    } finally {
      setReplayingValid(false)
    }
  }

  async function handleReplayDuplicate() {
    setReplayingDuplicate(true)
    try {
      const res = await replayDuplicateUpdateAction(experimentId)
      setAttempted((n) => n + 1)
      if (res.processingStatus === 'accepted') setApplied((n) => n + 1)
      setTimeline(res.updates)
    } finally {
      setReplayingDuplicate(false)
    }
  }

  async function handleReplayInvalid() {
    setReplayingInvalid(true)
    try {
      const res = await replayInvalidUpdateAction(experimentId)
      setAudit((prev) => [
        ...prev,
        {
          id: `audit-${prev.length + 1}`,
          processingStatus: res.processingStatus,
          message:
            res.processingStatus === 'rejected_signature'
              ? 'Rejected — invalid signature. Payload discarded, not added to the timeline.'
              : `Rejected — ${res.processingStatus}.`,
          at: new Date().toISOString(),
        },
      ])
    } finally {
      setReplayingInvalid(false)
    }
  }

  async function handleRefreshStatus() {
    setRefreshing(true)
    try {
      const res = await refreshStatusAction(experimentId)
      setStatus(res.status)
    } finally {
      setRefreshing(false)
    }
  }

  const duplicatesSeen = attempted > applied

  return (
    <section className="card" aria-label="Timeline" data-testid="timeline-stage">
      <h2 className="card-title">6. Timeline &amp; status</h2>
      <p className="card-hint">
        Updates are replayed locally through the same signature verification, header cross-check, and idempotent
        dedupe the live webhook endpoint would enforce — there is no public webhook route in this demo.
      </p>

      <div className="timeline-actions">
        <button type="button" data-testid="replay-valid" className="btn btn-primary" disabled={replayingValid} onClick={handleReplayValid}>
          {replayingValid ? 'Replaying…' : 'Replay valid update'}
        </button>
        <button type="button" data-testid="replay-duplicate" className="btn" disabled={replayingDuplicate} onClick={handleReplayDuplicate}>
          {replayingDuplicate ? 'Replaying…' : 'Replay duplicate delivery'}
        </button>
        <button type="button" data-testid="replay-invalid" className="btn" disabled={replayingInvalid} onClick={handleReplayInvalid}>
          {replayingInvalid ? 'Replaying…' : 'Replay tampered signature'}
        </button>
      </div>

      {duplicatesSeen && (
        <p className="dedupe-badge" data-testid="dedupe-badge">
          ×{attempted} deliveries · applied {applied === 1 ? 'once' : `${applied} times`}
        </p>
      )}

      <ul className="timeline-list" data-testid="timeline">
        {timeline.length === 0 && (
          <li className="card-hint" data-testid="timeline-empty">
            No updates yet.
          </li>
        )}
        {timeline.map((u) => (
          <li key={u.deliveryId} className="timeline-item" data-testid="timeline-item">
            <strong>{u.name}</strong>
            <span>{u.description}</span>
          </li>
        ))}
      </ul>

      <div className="timeline-status-row">
        <button type="button" data-testid="refresh-status" className="btn" disabled={refreshing} onClick={handleRefreshStatus}>
          {refreshing ? 'Refreshing…' : 'Refresh status'}
        </button>
        <StatusChip status={status} />
        <button type="button" data-testid="open-audit" className="btn" onClick={() => setAuditOpen(true)}>
          Audit log{audit.length > 0 ? ` (${audit.length})` : ''}
        </button>
      </div>

      <AuditDrawer open={auditOpen} onClose={() => setAuditOpen(false)} entries={audit} />
    </section>
  )
}
