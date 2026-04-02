'use client'
import { apiFetch } from '@/lib/client-auth'
import { useState, useEffect, useRef, useCallback } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

type Mode = 'micro' | 'sprint' | 'full'
type DispatchType = 'aeon' | 'local' | 'nexus-scenario'

interface Suggestion {
  skill: string
  mode: string
  dispatchType: string
  readOnly: boolean
  label: string
  description: string
}

interface ClassifyResult {
  skill: string
  mode: Mode
  dispatchType: DispatchType
  readOnly: boolean
  ambiguous: boolean
  suggestions: Suggestion[]
  reasoning: string
  strategyHash: string
}

type JobStatus =
  | 'pending' | 'running' | 'completed' | 'cancelled'
  | 'failed:auth' | 'failed:invalid-skill' | 'failed:rate-limited'
  | 'failed:github-error' | 'failed:parse-error' | 'failed:unknown'

interface Job {
  id: string
  skill: string
  mode: string
  dispatchType: string
  status: JobStatus
  readOnly: boolean
  dispatched_at: string
  completed_at?: string
  output?: string
  error?: string
  phase?: number
  parentId?: string
}

const SCENARIOS = [
  { id: 'startup-mvp', label: 'Startup MVP' },
  { id: 'enterprise-feature', label: 'Enterprise Feature' },
  { id: 'marketing-campaign', label: 'Marketing Campaign' },
  { id: 'incident-response', label: 'Incident Response' },
  { id: 'custom', label: 'Custom' },
]

const STATUS_COLORS: Record<string, string> = {
  pending: '#6b7280',
  running: '#f59e0b',
  completed: '#10b981',
  cancelled: '#6b7280',
  'failed:auth': '#ef4444',
  'failed:invalid-skill': '#ef4444',
  'failed:rate-limited': '#f97316',
  'failed:github-error': '#ef4444',
  'failed:parse-error': '#ef4444',
  'failed:unknown': '#ef4444',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusDot(status: JobStatus) {
  const color = STATUS_COLORS[status] || '#6b7280'
  const pulse = status === 'running'
  return (
    <span style={{
      display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
      background: color, marginRight: 6, flexShrink: 0,
      boxShadow: pulse ? `0 0 6px ${color}` : 'none',
    }} />
  )
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AgencyPage() {
  const [mode, setMode] = useState<Mode>('micro')
  const [scenario, setScenario] = useState('startup-mvp')
  const [intent, setIntent] = useState('')
  const [classifying, setClassifying] = useState(false)
  const [classified, setClassified] = useState<ClassifyResult | null>(null)
  const [classifyError, setClassifyError] = useState('')
  const [dispatching, setDispatching] = useState(false)
  const [dispatchMsg, setDispatchMsg] = useState('')
  const [confirmModal, setConfirmModal] = useState<{ result: ClassifyResult | Suggestion; isScenario?: boolean } | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const sseRef = useRef<EventSource | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const idkeyRef = useRef<string>('')

  // ─── SSE job stream ───────────────────────────────────────────────────────

  const connectSSE = useCallback(() => {
    if (sseRef.current) sseRef.current.close()
    // Get token for SSE URL
    const token = sessionStorage.getItem('nerv_token') || ''
    // SSE with auth header isn't natively supported — use snapshot + poll fallback
    const es = new EventSource('/api/agency/jobs')
    es.onmessage = (e) => {
      try {
        const job: Job = JSON.parse(e.data)
        setJobs(prev => {
          const idx = prev.findIndex(j => j.id === job.id)
          if (idx === -1) return [job, ...prev]
          const next = [...prev]
          next[idx] = job
          return next
        })
        setSelectedJob(prev => prev?.id === job.id ? job : prev)
      } catch { /* ignore */ }
    }
    es.onerror = () => {
      es.close()
      // On error, refresh from snapshot then reconnect
      apiFetch('/api/agency/jobs/snapshot').then(r => r.json()).then(d => {
        if (d.jobs) setJobs(d.jobs)
      }).catch(() => {})
      setTimeout(connectSSE, 3000)
    }
    sseRef.current = es
    return () => es.close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const cleanup = connectSSE()
    return cleanup
  }, [connectSSE])

  // ─── Classify ─────────────────────────────────────────────────────────────

  function handleIntentChange(val: string) {
    setIntent(val)
    setClassified(null)
    setClassifyError('')
    setDispatchMsg('')
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }

  async function handleDispatchClick() {
    if (!intent.trim()) return
    const key = crypto.randomUUID()
    idkeyRef.current = key
    setClassifying(true)
    setClassified(null)
    setClassifyError('')
    setDispatchMsg('')

    try {
      const r = await apiFetch('/api/agency/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent, idempotencyKey: key }),
      })
      const result: ClassifyResult = await r.json()
      if (!r.ok) { setClassifyError(result.reasoning || 'Classification failed'); return }
      setClassified(result)

      if (result.ambiguous) {
        // Show suggestion cards — handled in UI
        return
      }

      if (result.readOnly) {
        // Auto-dispatch immediately
        await doDispatch(result)
      } else {
        // Show confirm modal
        setConfirmModal({ result })
      }
    } catch (e) {
      setClassifyError(String(e))
    } finally {
      setClassifying(false)
    }
  }

  async function doDispatch(target: ClassifyResult | Suggestion, isScenario = false) {
    setDispatching(true)
    setDispatchMsg('')
    try {
      const body: Record<string, unknown> = {
        skill: target.skill,
        mode: target.mode,
        dispatchType: isScenario ? 'nexus-scenario' : target.dispatchType,
        readOnly: target.readOnly,
        strategyHash: (target as ClassifyResult).strategyHash || '',
      }
      if (isScenario) body.scenarioName = scenario

      const r = await apiFetch('/api/agency/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (d.message) {
        setDispatchMsg(d.message) // NEXUS phase 0 banner
      } else if (d.jobId) {
        setDispatchMsg(`✓ Dispatched — Job ${(d.jobId as string).slice(0, 8)}`)
      } else {
        setDispatchMsg(d.error || 'Dispatched')
      }
      setConfirmModal(null)
    } catch (e) {
      setDispatchMsg(String(e))
    } finally {
      setDispatching(false)
    }
  }

  async function handleSuggestionClick(s: Suggestion) {
    if (s.readOnly) {
      await doDispatch(s)
    } else {
      setConfirmModal({ result: s as unknown as ClassifyResult })
    }
  }

  async function handleScenarioDispatch() {
    if (mode === 'micro') { await handleDispatchClick(); return }
    // Sprint / Full → NEXUS Phase 0 dispatch
    const fakeResult: ClassifyResult = {
      skill: scenario,
      mode,
      dispatchType: 'nexus-scenario',
      readOnly: false,
      ambiguous: false,
      suggestions: [],
      reasoning: '',
      strategyHash: '',
    }
    setConfirmModal({ result: fakeResult, isScenario: true })
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: '#06070d', color: '#c9d3e0', fontFamily: 'monospace' }}>

      {/* Header */}
      <div style={{ borderBottom: '1px solid #1c2230', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <a href="/" style={{ color: '#f59e0b', textDecoration: 'none', fontSize: 11, letterSpacing: 2 }}>← NERV_02</a>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 4, color: '#f59e0b' }}>◈ NEXUS COMMAND CENTER</div>
        <div style={{ flex: 1 }} />
        <a href="/agents" style={{ fontSize: 10, letterSpacing: 2, color: '#4488ff', border: '1px solid #4488ff44', padding: '4px 10px', textDecoration: 'none' }}>◈ AGENTS</a>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 0, minHeight: 'calc(100vh - 57px)' }}>

        {/* ── Left: Command Input ── */}
        <div style={{ borderRight: '1px solid #1c2230', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Mode bar */}
          <div>
            <div style={{ fontSize: 10, color: '#4b5563', letterSpacing: 2, marginBottom: 8 }}>NEXUS MODE</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['micro', 'sprint', 'full'] as Mode[]).map(m => (
                <button key={m} onClick={() => setMode(m)} style={{
                  fontSize: 10, letterSpacing: 2, padding: '5px 14px', fontFamily: 'monospace', cursor: 'pointer',
                  background: mode === m ? '#f59e0b22' : 'transparent',
                  border: `1px solid ${mode === m ? '#f59e0b' : '#1c2230'}`,
                  color: mode === m ? '#f59e0b' : '#6b7280',
                  textTransform: 'uppercase',
                }}>
                  {m}
                </button>
              ))}
            </div>
            {mode !== 'micro' && (
              <div style={{ fontSize: 10, color: '#f59e0b88', marginTop: 6 }}>
                {mode === 'full' ? '⚠ NEXUS-Full deferred — dispatches Phase 0 only' : '⚠ NEXUS-Sprint dispatches Phase 0 only in this release'}
              </div>
            )}
          </div>

          {/* Scenario picker (sprint/full only) */}
          {mode !== 'micro' && (
            <div>
              <div style={{ fontSize: 10, color: '#4b5563', letterSpacing: 2, marginBottom: 8 }}>SCENARIO</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {SCENARIOS.map(s => (
                  <button key={s.id} onClick={() => setScenario(s.id)} style={{
                    fontSize: 10, padding: '4px 10px', fontFamily: 'monospace', cursor: 'pointer',
                    background: scenario === s.id ? '#f59e0b11' : 'transparent',
                    border: `1px solid ${scenario === s.id ? '#f59e0b66' : '#1c2230'}`,
                    color: scenario === s.id ? '#f59e0b' : '#6b7280',
                  }}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Intent input */}
          <div>
            <div style={{ fontSize: 10, color: '#4b5563', letterSpacing: 2, marginBottom: 8 }}>INTENT</div>
            <textarea
              value={intent}
              onChange={e => handleIntentChange(e.target.value)}
              placeholder="Describe what you want to do... (e.g. 'run hl-intel', 'brief me on AI news', 'analyze my portfolio')"
              rows={4}
              style={{
                width: '100%', background: '#0d1117', border: '1px solid #1c2230',
                color: '#c9d3e0', padding: '10px 14px', fontSize: 12, fontFamily: 'monospace',
                resize: 'vertical', outline: 'none', boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <button
                onClick={mode === 'micro' ? handleDispatchClick : handleScenarioDispatch}
                disabled={classifying || dispatching || !intent.trim()}
                style={{
                  fontSize: 11, letterSpacing: 2, padding: '8px 20px', fontFamily: 'monospace', cursor: 'pointer',
                  background: '#f59e0b22', border: '1px solid #f59e0b',
                  color: classifying || dispatching ? '#6b7280' : '#f59e0b',
                  opacity: (!intent.trim()) ? 0.4 : 1,
                }}
              >
                {classifying ? 'CLASSIFYING...' : dispatching ? 'DISPATCHING...' : 'DISPATCH'}
              </button>
              {(classified || classifyError || dispatchMsg) && (
                <button onClick={() => { setClassified(null); setClassifyError(''); setDispatchMsg('') }}
                  style={{ fontSize: 10, color: '#6b7280', background: 'transparent', border: '1px solid #1c2230', padding: '4px 10px', cursor: 'pointer', fontFamily: 'monospace' }}>
                  CLEAR
                </button>
              )}
            </div>
          </div>

          {/* Classify error */}
          {classifyError && (
            <div style={{ fontSize: 11, color: '#ef4444', background: '#ef444411', border: '1px solid #ef444433', padding: '8px 12px' }}>
              {classifyError}
            </div>
          )}

          {/* Dispatch message */}
          {dispatchMsg && (
            <div style={{
              fontSize: 11, padding: '8px 12px', border: '1px solid',
              borderColor: dispatchMsg.startsWith('✓') ? '#10b98144' : dispatchMsg.includes('soon') ? '#f59e0b44' : '#ef444444',
              color: dispatchMsg.startsWith('✓') ? '#10b981' : dispatchMsg.includes('soon') ? '#f59e0b' : '#ef4444',
              background: dispatchMsg.startsWith('✓') ? '#10b98111' : dispatchMsg.includes('soon') ? '#f59e0b11' : '#ef444411',
            }}>
              {dispatchMsg}
            </div>
          )}

          {/* Classified: auto-dispatch result */}
          {classified && !classified.ambiguous && (
            <div style={{ background: '#0d1117', border: '1px solid #1c2230', padding: 14 }}>
              <div style={{ fontSize: 10, color: '#4b5563', letterSpacing: 2, marginBottom: 8 }}>CLASSIFIED</div>
              <div style={{ fontSize: 12, color: '#e2e8f0' }}>{classified.skill}</div>
              <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>{classified.reasoning}</div>
              <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 10 }}>
                <span style={{ color: '#4488ff' }}>{classified.dispatchType}</span>
                <span style={{ color: classified.readOnly ? '#10b981' : '#ef4444' }}>
                  {classified.readOnly ? 'READ-ONLY' : 'DESTRUCTIVE'}
                </span>
                <span style={{ color: '#6b7280' }}>{classified.mode}</span>
              </div>
            </div>
          )}

          {/* Ambiguous: suggestion cards */}
          {classified?.ambiguous && classified.suggestions.length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: '#f59e0b', letterSpacing: 2, marginBottom: 10 }}>CLARIFY INTENT — choose one:</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {classified.suggestions.map((s, i) => (
                  <div key={i} style={{ background: '#0d1117', border: '1px solid #f59e0b33', padding: 12, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0' }}>{s.label}</div>
                      <div style={{ fontSize: 10, color: '#8892a4', marginTop: 3 }}>{s.description}</div>
                      <div style={{ fontSize: 9, color: s.readOnly ? '#10b981' : '#ef4444', marginTop: 4 }}>
                        {s.skill} · {s.readOnly ? 'read-only' : 'destructive'}
                      </div>
                    </div>
                    <button
                      onClick={() => handleSuggestionClick(s)}
                      disabled={dispatching}
                      style={{ fontSize: 10, padding: '5px 12px', background: '#f59e0b11', border: '1px solid #f59e0b66', color: '#f59e0b', cursor: 'pointer', fontFamily: 'monospace', flexShrink: 0 }}
                    >
                      {dispatching ? '...' : 'DISPATCH'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Job Board ── */}
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' }}>
          <div style={{ fontSize: 10, color: '#4b5563', letterSpacing: 2 }}>
            JOB BOARD <span style={{ color: '#374151' }}>({jobs.length})</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto', maxHeight: 'calc(100vh - 160px)' }}>
            {jobs.length === 0 && (
              <div style={{ fontSize: 11, color: '#374151' }}>No jobs yet. Dispatch a skill to get started.</div>
            )}
            {jobs.map(job => (
              <div
                key={job.id}
                onClick={() => setSelectedJob(selectedJob?.id === job.id ? null : job)}
                style={{
                  background: selectedJob?.id === job.id ? '#0d1117' : '#080a0f',
                  borderTop: `1px solid ${selectedJob?.id === job.id ? '#1c2230' : '#111827'}`,
                  borderRight: `1px solid ${selectedJob?.id === job.id ? '#1c2230' : '#111827'}`,
                  borderBottom: `1px solid ${selectedJob?.id === job.id ? '#1c2230' : '#111827'}`,
                  borderLeft: `2px solid ${STATUS_COLORS[job.status] || '#6b7280'}`,
                  padding: '10px 12px', cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {statusDot(job.status)}
                  <span style={{ fontSize: 11, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {job.skill}
                  </span>
                  <span style={{ fontSize: 9, color: '#4b5563' }}>{fmtTime(job.dispatched_at)}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 4, fontSize: 9, color: '#374151' }}>
                  <span>{job.dispatchType}</span>
                  <span>{job.mode}</span>
                  {job.parentId && <span style={{ color: '#4488ff44' }}>child</span>}
                </div>

                {/* Expanded job detail */}
                {selectedJob?.id === job.id && (
                  <div style={{ marginTop: 10, borderTop: '1px solid #1c2230', paddingTop: 10 }}>
                    <div style={{ fontSize: 9, color: '#6b7280', marginBottom: 4 }}>
                      ID: {job.id.slice(0, 8)} · Status: <span style={{ color: STATUS_COLORS[job.status] }}>{job.status}</span>
                    </div>
                    {job.error && (
                      <div style={{ fontSize: 10, color: '#ef4444', background: '#ef444411', padding: '4px 8px', marginTop: 4 }}>
                        {job.error}
                      </div>
                    )}
                    {job.output && (
                      <div style={{ fontSize: 10, color: '#8892a4', marginTop: 4, maxHeight: 120, overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {job.output}
                      </div>
                    )}
                    {job.completed_at && (
                      <div style={{ fontSize: 9, color: '#4b5563', marginTop: 4 }}>
                        Completed: {fmtTime(job.completed_at)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Confirm modal */}
      {confirmModal && (
        <div style={{ position: 'fixed', inset: 0, background: '#00000088', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#0d1117', border: '1px solid #ef444466', padding: 24, width: 420, maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#ef4444' }}>⚠ CONFIRM DISPATCH</div>
            <div style={{ fontSize: 12, color: '#e2e8f0' }}>
              <strong>{confirmModal.result.skill}</strong>
              {confirmModal.isScenario && <span style={{ color: '#f59e0b' }}> — NEXUS Scenario Phase 0</span>}
            </div>
            {'reasoning' in confirmModal.result && confirmModal.result.reasoning && (
              <div style={{ fontSize: 11, color: '#6b7280' }}>{confirmModal.result.reasoning}</div>
            )}
            {'description' in confirmModal.result && (confirmModal.result as Suggestion).description && (
              <div style={{ fontSize: 11, color: '#6b7280' }}>{(confirmModal.result as Suggestion).description}</div>
            )}
            {confirmModal.isScenario && (
              <div style={{ fontSize: 11, color: '#f59e0b88' }}>
                This will dispatch Phase 0 agents for the <strong>{scenario}</strong> scenario.
                Multi-phase advancement coming soon.
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmModal(null)}
                style={{ fontSize: 10, padding: '6px 14px', background: 'transparent', border: '1px solid #1c2230', color: '#6b7280', cursor: 'pointer', fontFamily: 'monospace' }}>
                CANCEL
              </button>
              <button
                onClick={() => doDispatch(confirmModal.result, confirmModal.isScenario)}
                disabled={dispatching}
                style={{ fontSize: 10, padding: '6px 14px', background: '#ef444422', border: '1px solid #ef4444', color: '#ef4444', cursor: 'pointer', fontFamily: 'monospace' }}>
                {dispatching ? 'DISPATCHING...' : 'CONFIRM'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
