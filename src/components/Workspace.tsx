'use client'
import { useState } from 'react'
import type { FoundryMode } from '@/infrastructure/config/env'
import type { CostEstimate } from '@/domain/schemas'
import { intakeAction, estimateAction } from '@/app/actions/intake'
import { Shell } from './Shell'
import type { StepNode } from './Stepper'
import { IntakeStage } from './IntakeStage'
import { PreflightPanel } from './PreflightPanel'
import { TargetPicker } from './TargetPicker'
import { BudgetPanel } from './BudgetPanel'

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

  const canRun = requestText.trim() !== '' && fastaText.trim() !== '' && !loading

  async function handleRunIntake() {
    setLoading(true)
    try {
      const r = await intakeAction(requestText, fastaText)
      setResult(r)
      if (r.ok) {
        setSelectedCandidateIds(new Set(r.sequenceSet.acceptedIds))
        setCost(r.cost)
        setSelectedTargetId(r.resolution.status === 'resolved' && r.resolution.chosen ? r.resolution.chosen.foundryTargetId : null)
      } else {
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
    setCostLoading(true)
    try {
      const c = await estimateAction(next.size, budgetMinor)
      setCost(c)
    } finally {
      setCostLoading(false)
    }
  }

  const success = result && result.ok ? result : null
  const failure = result && !result.ok ? result : null

  const exactlyRequiredCandidatesSelected =
    selectedCandidateIds.size === REQUIRED_CANDIDATE_IDS.length && REQUIRED_CANDIDATE_IDS.every((id) => selectedCandidateIds.has(id))

  const readyForApproval = selectedTargetId !== null && !!cost?.withinBudget && exactlyRequiredCandidatesSelected

  function handleRequestApproval() {
    // TODO(Slice 2): wire requestApprovalAction
  }

  const stageNodes: StepNode[] = [
    { id: 'intake', label: 'Intake', status: success ? 'complete' : 'active' },
    { id: 'preflight', label: 'Preflight', status: !success ? 'locked' : readyForApproval ? 'complete' : 'active' },
    { id: 'approval', label: 'Approval', status: 'locked' },
    { id: 'timeline', label: 'Timeline', status: 'locked' },
    { id: 'results', label: 'Results', status: 'locked' },
    { id: 'draft', label: 'Draft', status: 'locked' },
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
          <section className="card card-approval" aria-label="Approval gate">
            <button type="button" data-testid="request-approval" className="btn btn-primary" disabled={!readyForApproval} onClick={handleRequestApproval}>
              Request approval
            </button>
            {!readyForApproval && (
              <p className="card-hint">
                Select exactly one target, keep candidates AC-1–AC-4 selected, and stay within budget to continue.
              </p>
            )}
          </section>
        </>
      )}
    </Shell>
  )
}
