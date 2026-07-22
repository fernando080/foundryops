'use client'
import { useState } from 'react'
import type { ChangeEvent } from 'react'
import { requestApprovalAction, createDraftAction } from '@/app/actions/approval'
import { editReplicatesAction } from '@/app/actions/edit'
import { HashChip } from './HashChip'
import { PayloadDiff, type PayloadSnapshot } from './PayloadDiff'
import { formatMoney } from './format'

export interface ApprovalStageProps {
  requestId: string
  targetId: string
  targetName: string
  selectedCandidateIds: string[]
  approvalId: string
  payloadHash: string
  version: number
  totalMinor: number
  currency: string
  replicates: number
  onDraftCreated?: (experimentId: string) => void
}

// Server-authoritative approval stage. The client never constructs or edits
// a draft payload — it only ever sends requestId/approvalId/selection
// identifiers to server actions and renders back whatever those actions
// return (payload hash, version, cost). Every field shown here is the
// server's answer, not a client computation.
export function ApprovalStage({
  requestId,
  targetId,
  targetName,
  selectedCandidateIds,
  approvalId: initialApprovalId,
  payloadHash: initialPayloadHash,
  version: initialVersion,
  totalMinor: initialTotalMinor,
  currency,
  replicates: initialReplicates,
  onDraftCreated,
}: ApprovalStageProps) {
  const [approvalId, setApprovalId] = useState(initialApprovalId)
  const [payloadHash, setPayloadHash] = useState(initialPayloadHash)
  const [version, setVersion] = useState(initialVersion)
  const [totalMinor, setTotalMinor] = useState(initialTotalMinor)
  const [replicates, setReplicates] = useState(initialReplicates)

  const [invalidated, setInvalidated] = useState(false)
  const [snapshot, setSnapshot] = useState<PayloadSnapshot | null>(null)

  const [editing, setEditing] = useState(false)
  const [reissuing, setReissuing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [experimentId, setExperimentId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleReplicatesChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    const next = Number(raw)
    if (raw === '' || !Number.isFinite(next) || next < 1 || Math.trunc(next) !== next || next === replicates) return

    const before: PayloadSnapshot = { version, replicates, totalMinor, payloadHash }
    setEditing(true)
    setError(null)
    try {
      // Single atomic server call: config edit, payload regeneration, and
      // approval invalidation happen together in one transaction — there is
      // no window where the request is READY_FOR_APPROVAL with a stale
      // payload and a still-valid approval.
      const res = await editReplicatesAction(requestId, version, next)
      if (!res.ok || !res.payloadHash || res.version === undefined) {
        setError(res.reason ?? 'EDIT_FAILED')
        return
      }
      setReplicates(next)
      setVersion(res.version)
      setPayloadHash(res.payloadHash)
      setSnapshot(before)
      setInvalidated(true)
      setExperimentId(null)
    } finally {
      setEditing(false)
    }
  }

  async function handleReissue() {
    setReissuing(true)
    setError(null)
    try {
      const res = await requestApprovalAction(requestId)
      if (!res.ok || !res.approvalId || !res.payloadHash) {
        setError(res.reason ?? 'APPROVAL_FAILED')
        return
      }
      setApprovalId(res.approvalId)
      setPayloadHash(res.payloadHash)
      setInvalidated(false)
      setSnapshot(null)
    } finally {
      setReissuing(false)
    }
  }

  async function handleCreateDraft() {
    setCreating(true)
    setError(null)
    try {
      const res = await createDraftAction(requestId, approvalId)
      if (!res.ok || !res.experimentId) {
        setError(res.reason ?? 'CREATE_DRAFT_FAILED')
        return
      }
      setExperimentId(res.experimentId)
      onDraftCreated?.(res.experimentId)
    } finally {
      setCreating(false)
    }
  }

  const createDraftDisabled = invalidated || creating || editing || experimentId !== null

  return (
    <section className="card card-approval-stage" aria-label="Approval" data-testid="approval-stage">
      <h2 className="card-title">5. Approval</h2>
      <p className="card-hint">This is the exact payload Foundry will receive. Nothing here is client-computed.</p>

      <dl className="payload-summary">
        <div>
          <dt>Target</dt>
          <dd>{targetName || targetId}</dd>
        </div>
        <div>
          <dt>Candidates</dt>
          <dd>{selectedCandidateIds.length}</dd>
        </div>
        <div>
          <dt>Replicates</dt>
          <dd>{replicates}</dd>
        </div>
        <div>
          <dt>Total cost</dt>
          <dd data-testid="approval-total-cost">{formatMoney(totalMinor, currency)}</dd>
        </div>
        <div>
          <dt>Payload version</dt>
          <dd>{version}</dd>
        </div>
        <div>
          <dt>Payload hash</dt>
          <dd>
            <HashChip hash={payloadHash} />
          </dd>
        </div>
      </dl>

      <div className="field">
        <label htmlFor="edit-replicates">Edit replicates (demo: triggers invalidate/reissue)</label>
        <input
          id="edit-replicates"
          data-testid="edit-replicates"
          type="number"
          min={1}
          step={1}
          defaultValue={replicates}
          disabled={editing}
          onChange={handleReplicatesChange}
        />
      </div>

      {invalidated && (
        <div className="banner banner-error" data-testid="approval-invalidated">
          <p className="banner-title">Approval invalidated</p>
          <p>The payload changed after this approval was issued — the payload hash no longer matches. Reissue approval before creating the draft.</p>
          {snapshot && <PayloadDiff before={snapshot} after={{ version, replicates, totalMinor, payloadHash }} currency={currency} />}
          <button type="button" data-testid="reissue-approval" className="btn btn-primary" disabled={reissuing} onClick={handleReissue}>
            {reissuing ? 'Reissuing…' : 'Reissue approval'}
          </button>
        </div>
      )}

      {error && (
        <p className="card-hint" data-testid="approval-error">
          {error}
        </p>
      )}

      <div className="approval-actions">
        <button type="button" data-testid="create-draft" className="btn btn-primary" disabled={createDraftDisabled} onClick={handleCreateDraft}>
          {creating ? 'Creating draft…' : 'Create draft'}
        </button>
        <button type="button" data-testid="confirm-submit" className="btn btn-locked" disabled title="Requires LIVE + approval bound to this exact payload hash">
          <span aria-hidden="true">🔒</span> Confirm &amp; submit
        </button>
      </div>
      <p className="card-hint">Requires LIVE + approval bound to this exact payload hash</p>

      {experimentId && (
        <p className="draft-created" data-testid="draft-created">
          Draft created: <strong>{experimentId}</strong>
        </p>
      )}
    </section>
  )
}
