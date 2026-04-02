'use client'
import { apiFetch } from '@/lib/client-auth'
import { useState, useEffect, useMemo } from 'react'

interface Agent {
  slug: string
  name: string
  description: string
  source: 'local' | 'aeon'
  destructive: boolean
  division: string
  file: string
}

// Divisions shown when viewing aeon skills
const AEON_DIVISIONS = ['All', 'Intel', 'Crypto', 'Build', 'System', 'GitHub']
// Divisions shown when viewing local Claude agents
const LOCAL_DIVISIONS = ['All', 'Engineering', 'Design', 'Game Dev', 'Marketing', 'Sales', 'Testing', 'Security', 'Product', 'Project Mgmt', 'Spatial', 'Research', 'Support', 'Operations', 'Specialized']

const SOURCE_COLORS: Record<string, string> = {
  local: '#4488ff',
  aeon: '#ff6600',
}

const SOURCE_LABELS: Record<string, string> = {
  local: 'Claude Agent',
  aeon: 'Aeon Skill',
}

const DIV_COLORS: Record<string, string> = {
  // Aeon categories
  Intel: '#06b6d4', Crypto: '#f59e0b', Build: '#a78bfa',
  System: '#64748b', GitHub: '#6b7280',
  // Local agent categories
  Engineering: '#3b82f6', Design: '#ec4899', 'Game Dev': '#8b5cf6',
  Marketing: '#10b981', Sales: '#f97316', Testing: '#84cc16',
  Security: '#ef4444', Product: '#14b8a6', 'Project Mgmt': '#0ea5e9',
  Spatial: '#d946ef', Research: '#a3e635', Support: '#fb923c',
  Operations: '#94a3b8', Specialized: '#6b7280',
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [division, setDivision] = useState('All')
  const [sourceFilter, setSourceFilter] = useState<'all' | 'local' | 'aeon'>('all')
  const [refreshing, setRefreshing] = useState(false)
  const [modal, setModal] = useState<Agent | null>(null)
  const [activationPrompt, setActivationPrompt] = useState('')
  const [dispatching, setDispatching] = useState(false)
  const [dispatchResult, setDispatchResult] = useState('')

  useEffect(() => { loadCatalog() }, [])

  async function loadCatalog() {
    setLoading(true)
    setError('')
    try {
      const r = await apiFetch('/api/agents/catalog')
      const d = await r.json()
      if (d.agents) setAgents(d.agents)
      else setError(d.error || 'Failed to load catalog')
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await apiFetch('/api/agents/refresh', { method: 'POST' })
      await loadCatalog()
    } catch (e) {
      setError(String(e))
    } finally {
      setRefreshing(false)
    }
  }

  function openModal(agent: Agent) {
    setActivationPrompt(`Activate agent: ${agent.name}\n\nTask: `)
    setDispatchResult('')
    setModal(agent)
  }

  async function handleDispatch() {
    if (!modal) return
    setDispatching(true)
    setDispatchResult('')
    try {
      const r = await apiFetch('/api/agency/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skill: modal.slug,
          mode: 'micro',
          dispatchType: modal.source === 'aeon' ? 'aeon' : 'local',
          readOnly: !modal.destructive,
          strategyHash: '',
        }),
      })
      const d = await r.json()
      setDispatchResult(d.jobId ? `✓ Dispatched — Job ${d.jobId.slice(0, 8)}` : (d.error || 'Dispatched'))
    } catch (e) {
      setDispatchResult(String(e))
    } finally {
      setDispatching(false)
    }
  }

  const filtered = useMemo(() => {
    return agents.filter(a => {
      const matchDiv = division === 'All' || a.division === division
      const matchSrc = sourceFilter === 'all' || a.source === sourceFilter
      const q = search.toLowerCase()
      const matchSearch = !q || a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q) || a.slug.includes(q)
      return matchDiv && matchSrc && matchSearch
    })
  }, [agents, division, sourceFilter, search])

  const localCount = agents.filter(a => a.source === 'local').length
  const aeonCount = agents.filter(a => a.source === 'aeon').length

  // Which division tabs to show depends on source filter
  const activeDivisions = sourceFilter === 'aeon' ? AEON_DIVISIONS
    : sourceFilter === 'local' ? LOCAL_DIVISIONS
    : ['All', ...AEON_DIVISIONS.slice(1), ...LOCAL_DIVISIONS.slice(1)]

  const divCounts = useMemo(() => {
    const base = sourceFilter === 'all' ? agents : agents.filter(a => a.source === sourceFilter)
    const counts: Record<string, number> = { All: base.length }
    for (const a of base) counts[a.division] = (counts[a.division] || 0) + 1
    return counts
  }, [agents, sourceFilter])

  return (
    <div style={{ minHeight: '100vh', background: '#06070d', color: '#c9d3e0', fontFamily: 'monospace' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid #1c2230', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <a href="/" style={{ color: '#4488ff', textDecoration: 'none', fontSize: 11, letterSpacing: 2 }}>← NERV_02</a>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 4, color: '#4488ff' }}>◈ AGENT CATALOG</div>
        <div style={{ flex: 1 }} />
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          style={{ fontSize: 10, letterSpacing: 2, color: '#a8b4c4', border: '1px solid #1c2230', padding: '5px 12px', background: 'transparent', cursor: 'pointer', fontFamily: 'monospace' }}
        >
          {refreshing ? 'REBUILDING...' : '↻ REBUILD'}
        </button>
      </div>

      {/* Stats + source toggle */}
      <div style={{ padding: '8px 24px', borderBottom: '1px solid #1c2230', display: 'flex', gap: 24, alignItems: 'center', fontSize: 10 }}>
        <span style={{ color: '#6b7280' }}>{agents.length} total</span>
        <button
          onClick={() => { setSourceFilter('all'); setDivision('All') }}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'monospace', fontSize: 10, color: sourceFilter === 'all' ? '#e2e8f0' : '#4b5563', padding: 0, letterSpacing: 1 }}
        >
          ALL
        </button>
        <button
          onClick={() => { setSourceFilter('local'); setDivision('All') }}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'monospace', fontSize: 10, color: sourceFilter === 'local' ? SOURCE_COLORS.local : '#4b5563', padding: 0 }}
        >
          ◆ Claude Agents ({localCount})
        </button>
        <button
          onClick={() => { setSourceFilter('aeon'); setDivision('All') }}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'monospace', fontSize: 10, color: sourceFilter === 'aeon' ? SOURCE_COLORS.aeon : '#4b5563', padding: 0 }}
        >
          ◆ Aeon Skills ({aeonCount})
        </button>
      </div>

      {/* Division filters */}
      <div style={{ padding: '12px 24px', borderBottom: '1px solid #1c2230', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search agents..."
          style={{ background: '#0d1117', border: '1px solid #1c2230', color: '#c9d3e0', padding: '6px 12px', fontSize: 11, fontFamily: 'monospace', width: 220, outline: 'none', marginRight: 8 }}
        />
        {activeDivisions.map(d => (
          <button
            key={d}
            onClick={() => setDivision(d)}
            style={{
              fontSize: 10, letterSpacing: 1, padding: '4px 10px', fontFamily: 'monospace', cursor: 'pointer',
              background: division === d ? (DIV_COLORS[d] || '#4488ff') + '22' : 'transparent',
              border: `1px solid ${division === d ? (DIV_COLORS[d] || '#4488ff') : '#1c2230'}`,
              color: division === d ? (DIV_COLORS[d] || '#4488ff') : '#6b7280',
            }}
          >
            {d}{divCounts[d] ? ` (${divCounts[d]})` : ''}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: 24 }}>
        {loading && <div style={{ color: '#6b7280', fontSize: 12 }}>Building catalog...</div>}
        {error && <div style={{ color: '#ff4444', fontSize: 12 }}>{error}</div>}
        {!loading && !error && filtered.length === 0 && (
          <div style={{ color: '#6b7280', fontSize: 12 }}>No agents match your filters.</div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {filtered.map(agent => (
            <div
              key={agent.slug}
              style={{ background: '#0d1117', border: `1px solid ${SOURCE_COLORS[agent.source]}22`, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>{agent.name}</div>
                  <div style={{ fontSize: 9, color: '#4b5563', marginTop: 2 }}>{agent.slug}</div>
                </div>
                {agent.destructive && (
                  <div style={{ fontSize: 9, color: '#ef4444', border: '1px solid #ef444444', padding: '2px 6px' }}>⚠ DESTRUCTIVE</div>
                )}
              </div>

              <div style={{ fontSize: 11, color: '#8892a4', lineHeight: 1.4, flex: 1 }}>
                {agent.description || <span style={{ color: '#374151' }}>No description</span>}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <div style={{ fontSize: 9, padding: '2px 8px', background: (DIV_COLORS[agent.division] || '#6b7280') + '22', color: DIV_COLORS[agent.division] || '#6b7280', border: `1px solid ${DIV_COLORS[agent.division] || '#6b7280'}44` }}>
                  {agent.division}
                </div>
                <div style={{ fontSize: 9, color: SOURCE_COLORS[agent.source], marginLeft: 'auto' }}>
                  {SOURCE_LABELS[agent.source]}
                </div>
                <button
                  onClick={() => openModal(agent)}
                  style={{ fontSize: 10, letterSpacing: 1, padding: '4px 10px', background: SOURCE_COLORS[agent.source] + '10', border: `1px solid ${SOURCE_COLORS[agent.source]}66`, color: SOURCE_COLORS[agent.source], cursor: 'pointer', fontFamily: 'monospace' }}
                >
                  ACTIVATE
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Activation modal */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: '#00000088', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#0d1117', border: `1px solid ${SOURCE_COLORS[modal.source]}44`, padding: 24, width: 480, maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', flex: 1 }}>◈ ACTIVATE: {modal.name}</div>
              <div style={{ fontSize: 9, color: SOURCE_COLORS[modal.source] }}>{SOURCE_LABELS[modal.source]}</div>
              <button onClick={() => setModal(null)} style={{ background: 'transparent', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>

            {modal.destructive && (
              <div style={{ fontSize: 11, color: '#ef4444', background: '#ef444411', border: '1px solid #ef444433', padding: '8px 12px' }}>
                ⚠ This agent is marked as destructive. Review the prompt carefully before dispatching.
              </div>
            )}

            <div>
              <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 6, letterSpacing: 1 }}>ACTIVATION PROMPT</div>
              <textarea
                value={activationPrompt}
                onChange={e => setActivationPrompt(e.target.value)}
                rows={5}
                style={{ width: '100%', background: '#06070d', border: '1px solid #1c2230', color: '#c9d3e0', padding: '8px 12px', fontSize: 11, fontFamily: 'monospace', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            {dispatchResult && (
              <div style={{ fontSize: 11, color: dispatchResult.startsWith('✓') ? '#10b981' : '#ef4444' }}>
                {dispatchResult}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setModal(null)}
                style={{ fontSize: 10, letterSpacing: 1, padding: '6px 14px', background: 'transparent', border: '1px solid #1c2230', color: '#6b7280', cursor: 'pointer', fontFamily: 'monospace' }}
              >
                CANCEL
              </button>
              <button
                onClick={handleDispatch}
                disabled={dispatching}
                style={{ fontSize: 10, letterSpacing: 1, padding: '6px 14px', background: SOURCE_COLORS[modal.source] + '22', border: `1px solid ${SOURCE_COLORS[modal.source]}`, color: SOURCE_COLORS[modal.source], cursor: 'pointer', fontFamily: 'monospace' }}
              >
                {dispatching ? 'DISPATCHING...' : 'CONFIRM DISPATCH'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
