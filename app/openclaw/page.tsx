'use client'

import { useState, useEffect, useCallback } from 'react'

interface Check {
  id: string
  name: string
  status: 'ok' | 'warn' | 'fail'
  detail: string
  fixCmd?: string
}

interface DiagData {
  status: 'healthy' | 'unhealthy' | 'degraded'
  checks: Check[]
  config: {
    primaryModel: string
    fallbackModel: string
    availableModels: string[]
    gatewayPort: number
    gatewayMode: string
    gatewayBind: string
  }
  telegram: {
    enabled: boolean
    streaming: string
    dmPolicy: string
    groupPolicy: string
    botUsername: string | null
    botId: number | null
  }
  tools: { allowed: string[] }
  hooks: { enabled: boolean }
  timestamp: string
}

const STATUS_COLOR = { ok: '#22c55e', warn: '#f59e0b', fail: '#ef4444' }
const STATUS_ICON = { ok: '✓', warn: '!', fail: '✗' }
const STATUS_BG = { ok: '#22c55e08', warn: '#f59e0b08', fail: '#ef444408' }
const STATUS_BORDER = { ok: '#22c55e30', warn: '#f59e0b30', fail: '#ef444430' }

const FIX_LABELS: Record<string, string> = {
  restart_gateway: 'Restart Gateway',
  start_gateway: 'Start Gateway',
  kill_zombies: 'Kill Zombies',
  disable_plugin: 'Disable Plugin',
  disable_gh_workflow: 'Disable Workflow',
  reauth_openai: 'Re-auth OpenAI',
}

export default function OpenClawPage() {
  const [data, setData] = useState<DiagData | null>(null)
  const [loading, setLoading] = useState(true)
  const [fixing, setFixing] = useState<string | null>(null)
  const [fixLog, setFixLog] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const fetchDiag = useCallback(async () => {
    try {
      const res = await fetch('/api/openclaw')
      if (res.ok) {
        const d: DiagData = await res.json()
        setData(d)
        setLastRefresh(new Date())
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  // Initial + auto-refresh
  useEffect(() => {
    fetchDiag()
    if (!autoRefresh) return
    const id = setInterval(fetchDiag, 30000)
    return () => clearInterval(id)
  }, [fetchDiag, autoRefresh])

  const runAction = useCallback(async (action: string) => {
    setFixing(action)
    setFixLog('')
    try {
      const res = await fetch('/api/openclaw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const d = await res.json()
      setFixLog(d.output || 'Done')
      // Re-check after fix
      setTimeout(fetchDiag, 2000)
    } catch {
      setFixLog('Failed to execute action')
    }
    setFixing(null)
  }, [fetchDiag])

  const okCount = data?.checks.filter(c => c.status === 'ok').length || 0
  const totalCount = data?.checks.length || 0
  const overallColor = data?.status === 'healthy' ? '#22c55e' : data?.status === 'degraded' ? '#f59e0b' : '#ef4444'

  return (
    <div className="min-h-screen text-zinc-300" style={{ background: '#06070d', fontFamily: 'monospace' }}>
      {/* Header */}
      <header className="border-b border-zinc-800/50 px-6 py-3" style={{ background: '#06070d' }}>
        <div className="flex items-center justify-between max-w-[1400px] mx-auto">
          <div className="flex items-center gap-4">
            <a href="/" className="flex items-center gap-3 no-underline">
              <div style={{ width: 0, height: 0, borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderBottom: '13px solid #ff6600', filter: 'drop-shadow(0 0 6px #ff660088)' }} />
              <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 5, color: '#ff6600' }}>NERV</span>
            </a>
            <span style={{ color: '#2e3848' }}>/</span>
            <span style={{ fontSize: 13, letterSpacing: 4, color: '#f59e0b' }}>OPENCLAW</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2" style={{ fontSize: 11, color: '#71717a' }}>
              {autoRefresh && <span style={{ color: '#22c55e', fontSize: 8 }}>●</span>}
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                style={{ color: autoRefresh ? '#22c55e' : '#71717a', fontSize: 10, letterSpacing: 2, background: 'none', border: 'none', cursor: 'pointer' }}
              >
                {autoRefresh ? 'LIVE' : 'PAUSED'}
              </button>
              {lastRefresh && (
                <span style={{ fontSize: 9, color: '#3f3f46' }}>
                  {lastRefresh.toLocaleTimeString()}
                </span>
              )}
            </div>
            <button
              onClick={fetchDiag}
              disabled={loading}
              style={{ fontSize: 10, letterSpacing: 2, color: '#a8b4c4', border: '1px solid #1c2230', padding: '4px 12px', background: '#0a0c14', cursor: 'pointer' }}
            >
              {loading ? '⟳' : '↻ REFRESH'}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-6 py-5 space-y-5">

        {/* Status Banner */}
        {data && (
          <div className="flex items-center justify-between p-4 border" style={{ borderColor: overallColor + '40', background: overallColor + '08' }}>
            <div className="flex items-center gap-4">
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: overallColor, boxShadow: `0 0 12px ${overallColor}88` }} />
              <div>
                <div style={{ fontSize: 14, letterSpacing: 3, color: overallColor, fontWeight: 700 }}>
                  {data.status.toUpperCase()}
                </div>
                <div style={{ fontSize: 10, color: '#71717a', marginTop: 2 }}>
                  {okCount}/{totalCount} checks passing
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => runAction('full')}
                disabled={fixing !== null}
                style={{
                  fontSize: 10, letterSpacing: 2, padding: '6px 16px', cursor: fixing ? 'wait' : 'pointer',
                  color: '#f59e0b', border: '1px solid #f59e0b50', background: '#f59e0b10',
                  opacity: fixing ? 0.5 : 1,
                }}
              >
                {fixing === 'full' ? '⟳ RUNNING...' : '⚡ AUTO-FIX ALL'}
              </button>
              <button
                onClick={() => runAction('nuclear')}
                disabled={fixing !== null}
                style={{
                  fontSize: 10, letterSpacing: 2, padding: '6px 16px', cursor: fixing ? 'wait' : 'pointer',
                  color: '#ef4444', border: '1px solid #ef444450', background: '#ef444410',
                  opacity: fixing ? 0.5 : 1,
                }}
              >
                {fixing === 'nuclear' ? '⟳ NUKING...' : '☢ NUCLEAR RESET'}
              </button>
            </div>
          </div>
        )}

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5">

          {/* Left Column: Health Checks */}
          <div className="space-y-5">
            {/* Checks Grid */}
            <div>
              <div style={{ fontSize: 10, letterSpacing: 3, color: '#71717a', marginBottom: 10 }}>HEALTH CHECKS</div>
              <div className="space-y-1">
                {data?.checks.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between px-4 py-3 border"
                    style={{ borderColor: STATUS_BORDER[c.status], background: STATUS_BG[c.status] }}
                  >
                    <div className="flex items-center gap-3">
                      <span style={{ color: STATUS_COLOR[c.status], fontSize: 16, fontWeight: 700, width: 20, textAlign: 'center' }}>
                        {STATUS_ICON[c.status]}
                      </span>
                      <div>
                        <div style={{ fontSize: 12, color: '#e4e4e7', letterSpacing: 1 }}>{c.name}</div>
                        <div style={{ fontSize: 10, color: '#71717a', marginTop: 1 }}>{c.detail}</div>
                      </div>
                    </div>
                    {c.fixCmd && (
                      <button
                        onClick={() => runAction(c.fixCmd!)}
                        disabled={fixing !== null}
                        style={{
                          fontSize: 9, letterSpacing: 2, padding: '3px 10px',
                          color: STATUS_COLOR[c.status], border: `1px solid ${STATUS_COLOR[c.status]}50`,
                          background: `${STATUS_COLOR[c.status]}10`, cursor: fixing ? 'wait' : 'pointer',
                          opacity: fixing ? 0.5 : 1,
                        }}
                      >
                        {fixing === c.fixCmd ? '⟳' : FIX_LABELS[c.fixCmd] || 'FIX'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Fix Log */}
            {fixLog && (
              <div>
                <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                  <span style={{ fontSize: 10, letterSpacing: 3, color: '#71717a' }}>FIX OUTPUT</span>
                  <button onClick={() => setFixLog('')} style={{ fontSize: 9, color: '#71717a', background: 'none', border: 'none', cursor: 'pointer' }}>CLEAR</button>
                </div>
                <pre
                  className="p-4 border border-zinc-800/50 overflow-x-auto"
                  style={{ fontSize: 10, lineHeight: 1.6, color: '#a1a1aa', background: '#0a0c14', maxHeight: 300, overflowY: 'auto', whiteSpace: 'pre-wrap' }}
                >
                  {fixLog}
                </pre>
              </div>
            )}

            {/* Quick Actions */}
            <div>
              <div style={{ fontSize: 10, letterSpacing: 3, color: '#71717a', marginBottom: 10 }}>QUICK ACTIONS</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { action: 'restart_gateway', label: 'Restart Gateway', color: '#f59e0b' },
                  { action: 'kill_zombies', label: 'Kill Zombies', color: '#ef4444' },
                  { action: 'disable_plugin', label: 'Disable TG Plugin', color: '#8b5cf6' },
                  { action: 'disable_gh_workflow', label: 'Disable GH Workflow', color: '#8b5cf6' },
                  { action: 'switch_claude', label: 'Switch → Claude', color: '#22c55e' },
                  { action: 'switch_gpt', label: 'Switch → GPT-5.4', color: '#3b82f6' },
                  { action: 'switch_gpt_mini', label: 'Switch → GPT Mini', color: '#3b82f6' },
                  { action: 'reauth_openai', label: 'Re-auth OpenAI', color: '#f59e0b' },
                  { action: 'start_gateway', label: 'Start Gateway', color: '#22c55e' },
                ].map(({ action, label, color }) => (
                  <button
                    key={action}
                    onClick={() => runAction(action)}
                    disabled={fixing !== null}
                    className="py-2.5 px-3 border text-left"
                    style={{
                      fontSize: 10, letterSpacing: 1, color,
                      borderColor: color + '40', background: color + '08',
                      cursor: fixing ? 'wait' : 'pointer', opacity: fixing ? 0.5 : 1,
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { if (!fixing) e.currentTarget.style.background = color + '18' }}
                    onMouseLeave={e => { if (!fixing) e.currentTarget.style.background = color + '08' }}
                  >
                    {fixing === action ? '⟳ ...' : label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Info Panels */}
          <div className="space-y-4">

            {/* Gateway Info */}
            <div className="border border-zinc-800/40 bg-zinc-900/20">
              <div className="px-4 py-2.5 border-b border-zinc-800/30">
                <span style={{ fontSize: 10, letterSpacing: 3, color: '#71717a' }}>GATEWAY</span>
              </div>
              <div className="p-4 space-y-3">
                <InfoRow label="Port" value={`:${data?.config.gatewayPort || '18789'}`} />
                <InfoRow label="Mode" value={data?.config.gatewayMode || '—'} />
                <InfoRow label="Bind" value={data?.config.gatewayBind || '—'} />
                <InfoRow label="Health" value="http://localhost:18789/health" link />
              </div>
            </div>

            {/* Model Info */}
            <div className="border border-zinc-800/40 bg-zinc-900/20">
              <div className="px-4 py-2.5 border-b border-zinc-800/30">
                <span style={{ fontSize: 10, letterSpacing: 3, color: '#71717a' }}>MODELS</span>
              </div>
              <div className="p-4 space-y-3">
                <InfoRow label="Primary" value={data?.config.primaryModel || '—'} highlight />
                <InfoRow label="Fallback" value={data?.config.fallbackModel || '—'} />
                <div>
                  <div style={{ fontSize: 9, color: '#52525b', letterSpacing: 1, marginBottom: 4 }}>AVAILABLE</div>
                  <div className="flex flex-wrap gap-1">
                    {(data?.config.availableModels || []).map(m => (
                      <span key={m} style={{
                        fontSize: 9, padding: '2px 6px', border: '1px solid #27272a', color: '#71717a',
                        background: m === data?.config.primaryModel ? '#f59e0b15' : 'transparent',
                        borderColor: m === data?.config.primaryModel ? '#f59e0b40' : '#27272a',
                      }}>
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Telegram Info */}
            <div className="border border-zinc-800/40 bg-zinc-900/20">
              <div className="px-4 py-2.5 border-b border-zinc-800/30 flex items-center justify-between">
                <span style={{ fontSize: 10, letterSpacing: 3, color: '#71717a' }}>TELEGRAM</span>
                <span style={{
                  fontSize: 9, padding: '1px 8px',
                  color: data?.telegram.enabled ? '#22c55e' : '#ef4444',
                  border: `1px solid ${data?.telegram.enabled ? '#22c55e40' : '#ef444440'}`,
                }}>
                  {data?.telegram.enabled ? 'ENABLED' : 'DISABLED'}
                </span>
              </div>
              <div className="p-4 space-y-3">
                <InfoRow label="Bot" value={data?.telegram.botUsername ? `@${data.telegram.botUsername}` : '—'} />
                <InfoRow label="Bot ID" value={String(data?.telegram.botId || '—')} />
                <InfoRow label="DM Policy" value={data?.telegram.dmPolicy || '—'} />
                <InfoRow label="Group Policy" value={data?.telegram.groupPolicy || '—'} />
                <InfoRow label="Streaming" value={data?.telegram.streaming || '—'} />
              </div>
            </div>

            {/* Tools & Hooks */}
            <div className="border border-zinc-800/40 bg-zinc-900/20">
              <div className="px-4 py-2.5 border-b border-zinc-800/30">
                <span style={{ fontSize: 10, letterSpacing: 3, color: '#71717a' }}>TOOLS & HOOKS</span>
              </div>
              <div className="p-4 space-y-3">
                <InfoRow label="Hooks" value={data?.hooks.enabled ? 'Enabled' : 'Disabled'} />
                <div>
                  <div style={{ fontSize: 9, color: '#52525b', letterSpacing: 1, marginBottom: 4 }}>ALLOWED TOOLS</div>
                  <div className="flex flex-wrap gap-1">
                    {(data?.tools.allowed || []).map(t => (
                      <span key={t} style={{ fontSize: 9, padding: '2px 6px', border: '1px solid #27272a', color: '#71717a' }}>
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Key Paths */}
            <div className="border border-zinc-800/40 bg-zinc-900/20">
              <div className="px-4 py-2.5 border-b border-zinc-800/30">
                <span style={{ fontSize: 10, letterSpacing: 3, color: '#71717a' }}>KEY PATHS</span>
              </div>
              <div className="p-4 space-y-2">
                {[
                  { label: 'Config', path: '~/.openclaw/openclaw.json' },
                  { label: 'Auth', path: '~/.openclaw/agents/main/agent/auth-profiles.json' },
                  { label: 'Health Check', path: '~/openclaw-healthcheck.sh' },
                  { label: 'Troubleshooter', path: '~/fix-openclaw.sh' },
                  { label: 'Auth Refresh', path: '~/refresh-openclaw-auth.bat' },
                ].map(({ label, path }) => (
                  <div key={label} className="flex items-baseline justify-between">
                    <span style={{ fontSize: 9, color: '#52525b', letterSpacing: 1 }}>{label}</span>
                    <span style={{ fontSize: 9, color: '#71717a', fontFamily: 'monospace' }}>{path}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value, highlight, link }: { label: string; value: string; highlight?: boolean; link?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span style={{ fontSize: 9, color: '#52525b', letterSpacing: 1 }}>{label}</span>
      {link ? (
        <a href={value} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#3b82f6', textDecoration: 'none' }}>{value}</a>
      ) : (
        <span style={{ fontSize: 11, color: highlight ? '#f59e0b' : '#a1a1aa' }}>{value}</span>
      )}
    </div>
  )
}
