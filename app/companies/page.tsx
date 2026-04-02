'use client'

import { useState, useEffect, useCallback } from 'react'

interface Company {
  id: string
  name: string
  description: string
  status: string
  issuePrefix: string
  budgetMonthlyCents: number
  spentMonthlyCents: number
  agentCount?: number
}

interface Agent {
  id: string
  name: string
  title: string
  status: string
}

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Company | null>(null)
  const [agents, setAgents] = useState<Agent[]>([])
  const [agentsLoading, setAgentsLoading] = useState(false)
  const [version, setVersion] = useState('')
  const [online, setOnline] = useState(false)

  const fetchAll = useCallback(async () => {
    try {
      const hRes = await fetch('/api/companies?path=health')
      if (hRes.ok) {
        const h = await hRes.json()
        setOnline(h.status === 'ok')
        setVersion(h.version || '')
      } else {
        setError('Paperclip is not running')
        setLoading(false)
        return
      }

      const res = await fetch('/api/companies')
      if (!res.ok) { setError('Failed to load'); setLoading(false); return }
      const list: Company[] = await res.json()

      const enriched = await Promise.all(
        list.map(async (c) => {
          try {
            const r = await fetch(`/api/companies?path=companies/${c.id}/agents`)
            if (r.ok) {
              const d = await r.json()
              return { ...c, agentCount: (Array.isArray(d) ? d : d.agents || []).length }
            }
          } catch { /* skip */ }
          return { ...c, agentCount: 0 }
        })
      )
      setCompanies(enriched.sort((a, b) => (b.agentCount || 0) - (a.agentCount || 0)))
    } catch {
      setError('Cannot reach Paperclip')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const selectCompany = async (c: Company) => {
    setSelected(c)
    setAgents([])
    setAgentsLoading(true)
    try {
      const res = await fetch(`/api/companies?path=companies/${c.id}/agents`)
      if (res.ok) {
        const data = await res.json()
        setAgents(Array.isArray(data) ? data : data.agents || [])
      }
    } catch { /* ignore */ }
    setAgentsLoading(false)
  }

  const totalAgents = companies.reduce((sum, c) => sum + (c.agentCount || 0), 0)

  // Offline state
  if (!loading && error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#06070d', fontFamily: 'monospace' }}>
        <div className="flex flex-col items-center gap-4 max-w-sm text-center">
          <div style={{ width: 0, height: 0, borderLeft: '12px solid transparent', borderRight: '12px solid transparent', borderBottom: '20px solid #ef4444', filter: 'drop-shadow(0 0 8px #ef444466)', marginBottom: 4 }} />
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 4, color: '#ef4444' }}>PAPERCLIP OFFLINE</div>
          <div style={{ fontSize: 10, color: '#52525b', lineHeight: 1.7 }}>
            Agent orchestration platform is not running.
          </div>
          <code style={{ fontSize: 10, color: '#a1a1aa', background: '#111318', padding: '8px 14px', border: '1px solid #1c2230', display: 'block', width: '100%' }}>
            cd ~/paperclip && pnpm dev
          </code>
          <a href="/" style={{ fontSize: 10, letterSpacing: 2, color: '#ff6600', border: '1px solid #ff660044', padding: '6px 16px', textDecoration: 'none', marginTop: 8 }}>
            ◈ BACK TO NERV
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#06070d', fontFamily: 'monospace' }}>

      {/* Header */}
      <header className="border-b border-zinc-800/50 px-5 py-3 shrink-0" style={{ background: '#06070d' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="flex items-center gap-2" style={{ textDecoration: 'none' }}>
              <div style={{ width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderBottom: '10px solid #ff6600', filter: 'drop-shadow(0 0 4px #ff660066)' }} />
              <span style={{ fontSize: 11, letterSpacing: 4, color: '#ff6600', fontWeight: 700 }}>NERV</span>
            </a>
            <span style={{ color: '#1c2230', fontSize: 14 }}>/</span>
            <div className="flex items-center gap-2">
              <div style={{ width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderBottom: '10px solid #22c55e', filter: 'drop-shadow(0 0 4px #22c55e66)' }} />
              <span style={{ fontSize: 11, letterSpacing: 4, color: '#22c55e', fontWeight: 700 }}>COMPANIES</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {online && (
              <div className="flex items-center gap-1.5">
                <span style={{ fontSize: 8, color: '#22c55e' }}>●</span>
                <span style={{ fontSize: 9, color: '#3f3f46' }}>PAPERCLIP v{version}</span>
              </div>
            )}
            <a
              href="http://localhost:3100"
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 10, letterSpacing: 2, color: '#22c55e', border: '1px solid #22c55e33', padding: '4px 10px', textDecoration: 'none', background: '#22c55e06' }}
            >
              FULL UI ↗
            </a>
            <a href="/" style={{ fontSize: 10, letterSpacing: 2, color: '#71717a', border: '1px solid #27272a', padding: '4px 10px', textDecoration: 'none' }}>
              ← DASHBOARD
            </a>
          </div>
        </div>
      </header>

      {/* Stats */}
      <div className="flex items-center gap-5 px-5 py-2 border-b border-zinc-800/30" style={{ background: '#080a11' }}>
        <Stat label="COMPANIES" value={companies.length} color="#22c55e" />
        <Sep />
        <Stat label="TOTAL AGENTS" value={totalAgents} color="#ff6600" />
        <Sep />
        <Stat label="ACTIVE" value={companies.filter(c => c.status === 'active').length} color="#22c55e" />
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="relative flex items-center justify-center">
              <div className="absolute h-10 w-10 rounded-full border border-[#22c55e]/20" style={{ animation: 'pulse-ring 2s ease-out infinite' }} />
              <div className="h-2 w-2 rounded-full bg-[#22c55e] shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
            </div>
            <span style={{ fontSize: 9, color: '#27272a', letterSpacing: 2 }}>LOADING COMPANIES...</span>
          </div>
        </div>
      )}

      {/* Main */}
      {!loading && (
        <div className="flex-1 flex min-h-0">

          {/* Company list */}
          <div className={`flex-1 flex flex-col min-h-0 overflow-y-auto ${selected ? 'border-r border-zinc-800/40' : ''}`}>
            <div className="p-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 auto-rows-min">
              {companies.map(c => {
                const active = selected?.id === c.id
                return (
                  <button
                    key={c.id}
                    onClick={() => selectCompany(c)}
                    className="text-left transition-all"
                    style={{
                      background: active ? '#0d1117' : '#080a11',
                      border: `1px solid ${active ? '#22c55e28' : '#111318'}`,
                      padding: '11px 13px',
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span style={{ fontSize: 8, letterSpacing: 1, padding: '1px 4px', color: '#22c55e', border: '1px solid #22c55e1a', background: '#22c55e06' }}>
                        {c.issuePrefix}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: active ? '#e5e7eb' : '#a1a1aa', letterSpacing: 0.3 }}>
                        {c.name}
                      </span>
                    </div>
                    {c.description && (
                      <div style={{
                        fontSize: 9, color: '#3f3f46', lineHeight: 1.4, marginBottom: 6,
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      }}>
                        {c.description}
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      <span style={{ fontSize: 9, color: '#52525b' }}>AGENTS</span>
                      <span style={{ fontSize: 11, color: '#ff6600', fontWeight: 600 }}>{c.agentCount || 0}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Detail panel */}
          {selected && (
            <div className="w-[340px] flex flex-col min-h-0 shrink-0" style={{ background: '#080a11' }}>
              {/* Header */}
              <div className="px-4 py-3 border-b border-zinc-800/30">
                <div className="flex items-center justify-between mb-1">
                  <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: '#22c55e' }}>{selected.name}</span>
                  <button onClick={() => setSelected(null)} style={{ fontSize: 10, color: '#3f3f46', cursor: 'pointer', background: 'none', border: 'none' }}>✕</button>
                </div>
                <div style={{ fontSize: 8, color: '#3f3f46', letterSpacing: 1, marginBottom: 6 }}>{selected.issuePrefix} &middot; {selected.status.toUpperCase()}</div>
                {selected.description && (
                  <div style={{ fontSize: 9, color: '#52525b', lineHeight: 1.5, marginBottom: 10 }}>{selected.description}</div>
                )}
                <a
                  href={`http://localhost:3100/${selected.issuePrefix}/dashboard`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center"
                  style={{ fontSize: 9, letterSpacing: 2, color: '#22c55e', border: '1px solid #22c55e28', padding: '6px 12px', background: '#22c55e06', textDecoration: 'none' }}
                >
                  OPEN IN PAPERCLIP ↗
                </a>
              </div>

              {/* Agents */}
              <div className="px-4 py-2 border-b border-zinc-800/20 flex items-center justify-between">
                <span style={{ fontSize: 9, color: '#3f3f46', letterSpacing: 1 }}>AGENTS</span>
                <span style={{ fontSize: 10, color: '#ff6600', fontWeight: 600 }}>{agents.length}</span>
              </div>
              <div className="flex-1 overflow-y-auto">
                {agentsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <span style={{ fontSize: 9, color: '#27272a', letterSpacing: 2 }}>LOADING...</span>
                  </div>
                ) : agents.length === 0 ? (
                  <div className="flex items-center justify-center py-8">
                    <span style={{ fontSize: 9, color: '#27272a', letterSpacing: 2 }}>NO AGENTS</span>
                  </div>
                ) : (
                  agents.map(a => (
                    <div key={a.id} className="px-4 py-1.5 border-b border-zinc-800/10 hover:bg-[#0d1117] transition-colors">
                      <div className="flex items-center justify-between">
                        <span style={{ fontSize: 10, color: '#d4d4d8', fontWeight: 500 }}>{a.name}</span>
                        <span style={{
                          fontSize: 7, letterSpacing: 1, padding: '1px 4px',
                          color: a.status === 'active' ? '#22c55e' : '#52525b',
                          border: `1px solid ${a.status === 'active' ? '#22c55e1a' : '#27272a'}`,
                        }}>
                          {(a.status || 'IDLE').toUpperCase()}
                        </span>
                      </div>
                      {a.title && <div style={{ fontSize: 8, color: '#3f3f46', marginTop: 1 }}>{a.title}</div>}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span style={{ fontSize: 9, color: '#3f3f46', letterSpacing: 1 }}>{label}</span>
      <span style={{ fontSize: 13, color, fontWeight: 700 }}>{value}</span>
    </div>
  )
}

function Sep() {
  return <div style={{ width: 1, height: 12, background: '#1c2230' }} />
}
