'use client'
import { useState } from 'react'
import type { FoundryMode } from '@/infrastructure/config/env'
import type { CostEstimate } from '@/domain/schemas'
import { intakeAction, estimateAction } from '@/app/actions/intake'
import { prepareRequestAction } from '@/app/actions/prepare'
import { requestApprovalAction } from '@/app/actions/approval'
import { Shell } from './Shell'
import type { StepNode } from './Stepper'
import { IntakeStage } from './IntakeStage'
import { PreflightPanel } from './PreflightPanel'
import { TargetPicker } from './TargetPicker'
import { BudgetPanel } from './BudgetPanel'
import { ApprovalStage, type ApprovalStageProps } from './ApprovalStage'
import { TimelineStage } from './TimelineStage'
import { ResultsStage } from './ResultsStage'

type IntakeResult = Awaited<ReturnType<typeof intakeAction>>

// The exact demo-fixture candidate set that must remain selected for the
// "ready for approval" gate. This is intentionally hard-coded to the Slice 1
// demo fixture (fixtures/candidates.ts): AC-1..AC-4 are the good candidates,
// AC-7/AC-8 are the ones that must be deselected to fit the demo budget.
// A future slice can generalize this once budget policy is data-driven.
const REQUIRED_CANDIDATE_IDS = ['AC-1', 'AC-2', 'AC-3', 'AC-4']

export function Workspace({ foundryMode }: { foundryMode: FoundryMode }) {
  const [requestText, setRequestText] = useState('')
  const [fastaText, setFastaText] = useState('')
  const [fastaFileName, setFastaFileName] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<IntakeResult | null>(null)

  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null)
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set())
  const [cost, setCost] = useState<CostEstimate | null>(null)
  const [costLoading, setCostLoading] = useState(false)

  const [requestId, setRequestId] = useState<string | null>(null)
  const [approvalRequesting, setApprovalRequesting] = useState(false)
  const [approvalError, setApprovalError] = useState<string | null>(null)
  const [approvalEntry, setApprovalEntry] = useState<Omit<ApprovalStageProps, 'onDraftCreated'> | null>(null)
  const [draftExperimentId, setDraftExperimentId] = useState<string | null>(null)
  const [showTimeline, setShowTimeline] = useState(false)
  const [resultsLoaded, setResultsLoaded] = useState(false)
  const [draftRevealed, setDraftRevealed] = useState(false)

  const canRun = requestText.trim() !== '' && fastaText.trim() !== '' && !loading

  async function handleRunIntake() {
    setLoading(true)
    try {
      const r = await intakeAction(requestText, fastaText)
      setResult(r)
      setApprovalEntry(null)
      setApprovalError(null)
      setDraftExperimentId(null)
      setShowTimeline(false)
      setResultsLoaded(false)
      setDraftRevealed(false)
      if (r.ok) {
        setRequestId(r.requestId)
        setSelectedCandidateIds(new Set(r.sequenceSet.acceptedIds))
        setCost(r.cost)
        setSelectedTargetId(r.resolution.status === 'resolved' && r.resolution.chosen ? r.resolution.chosen.foundryTargetId : null)
      } else {
        setRequestId(null)
        setSelectedCandidateIds(new Set())
        setCost(null)
        setSelectedTargetId(null)
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleToggleCandidate(id: string) {
    if (!result || !result.ok) return
    const budgetMinor = result.budgetMinor
    const next = new Set(selectedCandidateIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedCandidateIds(next)
    // Selection changed — any previously requested approval is for a stale
    // selection, so drop back out of the Approval stage until the operator
    // re-requests approval against the new selection.
    setApprovalEntry(null)
    setApprovalError(null)
    setDraftExperimentId(null)
    setShowTimeline(false)
    setResultsLoaded(false)
    setDraftRevealed(false)
    setCostLoading(true)
    try {
      const c = await estimateAction(next.size, budgetMinor)
      setCost(c)
    } finally {
      setCostLoading(false)
    }
  }

  function handleDraftCreated(experimentId: string) {
    setDraftExperimentId(experimentId)
    setShowTimeline(false)
    setResultsLoaded(false)
    setDraftRevealed(false)
  }

  const success = result && result.ok ? result : null
  const failure = result && !result.ok ? result : null

  const exactlyRequiredCandidatesSelected =
    selectedCandidateIds.size === REQUIRED_CANDIDATE_IDS.length && REQUIRED_CANDIDATE_IDS.every((id) => selectedCandidateIds.has(id))

  const readyForApproval = selectedTargetId !== null && !!cost?.withinBudget && exactlyRequiredCandidatesSelected

  const selectedTargetName = (() => {
    if (!success || !selectedTargetId) return null
    const { resolution } = success
    if (resolution.status === 'resolved' && resolution.chosen?.foundryTargetId === selectedTargetId) return resolution.chosen.name
    return resolution.alternatives.find((t) => t.foundryTargetId === selectedTargetId)?.name ?? null
  })()

  async function handleRequestApproval() {
    if (!success || !success.intentResult.ok || !requestId || !selectedTargetId) return
    setApprovalRequesting(true)
    setApprovalError(null)
    try {
      const candidateIds = Array.from(selectedCandidateIds)
      const prep = await prepareRequestAction(requestId, selectedTargetId, candidateIds)
      if (!prep.ok || !prep.payloadHash || prep.version === undefined || prep.totalMinor === undefined) {
        setApprovalError(prep.reason ?? 'PREPARE_FAILED')
        return
      }
      const approval = await requestApprovalAction(requestId)
      if (!approval.ok || !approval.approvalId || !approval.payloadHash) {
        setApprovalError(approval.reason ?? 'APPROVAL_FAILED')
        return
      }
      setDraftExperimentId(null)
      setShowTimeline(false)
      setApprovalEntry({
        requestId,
        targetId: selectedTargetId,
        targetName: selectedTargetName ?? selectedTargetId,
        selectedCandidateIds: candidateIds,
        approvalId: approval.approvalId,
        payloadHash: approval.payloadHash,
        version: prep.version,
        totalMinor: prep.totalMinor,
        currency: cost?.currency ?? 'USD',
        replicates: success.intentResult.intent.replicates,
      })
    } finally {
      setApprovalRequesting(false)
    }
  }

  const stageNodes: StepNode[] = [
    { id: 'intake', label: 'Intake', status: success ? 'complete' : 'active' },
    { id: 'preflight', label: 'Preflight', status: !success ? 'locked' : readyForApproval ? 'complete' : 'active' },
    { id: 'approval', label: 'Approval', status: !success ? 'locked' : approvalEntry ? 'complete' : readyForApproval ? 'active' : 'locked' },
    { id: 'timeline', label: 'Timeline', status: !draftExperimentId ? 'locked' : showTimeline ? 'complete' : 'active' },
    { id: 'results', label: 'Results', status: !showTimeline ? 'locked' : resultsLoaded ? 'complete' : 'active' },
    { id: 'draft', label: 'Draft', status: !resultsLoaded ? 'locked' : draftRevealed ? 'complete' : 'active' },
  ]

  return (
    <Shell foundryMode={foundryMode} stageNodes={stageNodes}>
      <IntakeStage
        requestText={requestText}
        onRequestTextChange={setRequestText}
        fastaFileName={fastaFileName}
        onFastaLoaded={(text, name) => {
          setFastaText(text)
          setFastaFileName(name)
        }}
        onRunIntake={handleRunIntake}
        loading={loading}
        canRun={canRun}
      />

      {failure && (
        <section className="card card-error" aria-label="Intake error" data-testid="intake-error">
          <h2 className="card-title">Unrecognized request</h2>
          <p>Unrecognized request — no matching demo fixture. Try one of the sample requests from the demo script.</p>
        </section>
      )}

      {success && (
        <>
          <PreflightPanel intentResult={success.intentResult} findings={success.findings} />
          <TargetPicker resolution={success.resolution} selectedTargetId={selectedTargetId} onSelect={setSelectedTargetId} />
          <BudgetPanel
            sequenceSet={success.sequenceSet}
            selectedCandidateIds={selectedCandidateIds}
            onToggle={handleToggleCandidate}
            cost={cost}
            costLoading={costLoading}
          />
          {!approvalEntry && (
            <section className="card card-approval" aria-label="Approval gate">
              <button
                type="button"
                data-testid="request-approval"
                className="btn btn-primary"
                disabled={!readyForApproval || approvalRequesting}
                onClick={handleRequestApproval}
              >
                {approvalRequesting ? 'Requesting approval…' : 'Request approval'}
              </button>
              {!readyForApproval && (
                <p className="card-hint">
                  Select exactly one target, keep candidates AC-1–AC-4 selected, and stay within budget to continue.
                </p>
              )}
              {approvalError && (
                <p className="card-hint" data-testid="approval-request-error">
                  {approvalError}
                </p>
              )}
            </section>
          )}

          {approvalEntry && success.intentResult.ok && <ApprovalStage {...approvalEntry} onDraftCreated={handleDraftCreated} />}

          {draftExperimentId && !showTimeline && (
            <section className="card" aria-label="Timeline gate">
              <button type="button" data-testid="goto-timeline" className="btn btn-primary" onClick={() => setShowTimeline(true)}>
                View update timeline &amp; status
              </button>
            </section>
          )}

          {draftExperimentId && showTimeline && <TimelineStage experimentId={draftExperimentId} />}

          {draftExperimentId && showTimeline && (
            <ResultsStage
              key={draftExperimentId}
              experimentId={draftExperimentId}
              onResultsLoaded={() => setResultsLoaded(true)}
              onDraftRevealed={() => setDraftRevealed(true)}
            />
          )}
        </>
      )}
    </Shell>
  )
}
