'use client'
import { apiFetch } from '@/lib/client-auth'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { RiskParams, Strategy, ConsensusItem, IntelData } from '@/lib/types'
import { fmtPrice, fmtM, pct, fgColor, biasColor, dirColor, convColor } from '@/lib/utils'

// ── Fear/Greed Arc Gauge ─────────────────────────────────────────────────────

function FearGreedArc({ value, classification }: { value: number; classification: string }) {
  const color = fgColor(value)
  const r = 54
  const cx = 70, cy = 70
  const startAngle = 200
  const endAngle = 340
  const totalArc = endAngle - startAngle
  const valueAngle = startAngle + (value / 100) * totalArc

  const toRad = (deg: number) => (deg * Math.PI) / 180
  const arcX = (deg: number) => cx + r * Math.cos(toRad(deg - 90))
  const arcY = (deg: number) => cy + r * Math.sin(toRad(deg - 90))

  const bgD = `M ${arcX(startAngle)} ${arcY(startAngle)} A ${r} ${r} 0 1 1 ${arcX(endAngle)} ${arcY(endAngle)}`
  const fillD = `M ${arcX(startAngle)} ${arcY(startAngle)} A ${r} ${r} 0 ${totalArc > 180 ? 1 : 0} 1 ${arcX(valueAngle)} ${arcY(valueAngle)}`

  const needleX = cx + (r - 8) * Math.cos(toRad(valueAngle - 90))
  const needleY = cy + (r - 8) * Math.sin(toRad(valueAngle - 90))

  return (
    <div className="flex flex-col items-center">
      <svg width="140" height="100" viewBox="0 0 140 100">
        {/* Track */}
        <path d={bgD} fill="none" stroke="#1e1e1e" strokeWidth="8" strokeLinecap="round" />
        {/* Fill segments */}
        {[
          { start: startAngle, end: startAngle + totalArc * 0.2, color: '#ef4444' },
          { start: startAngle + totalArc * 0.2, end: startAngle + totalArc * 0.4, color: '#f97316' },
          { start: startAngle + totalArc * 0.4, end: startAngle + totalArc * 0.6, color: '#eab308' },
          { start: startAngle + totalArc * 0.6, end: startAngle + totalArc * 0.8, color: '#22c55e' },
          { start: startAngle + totalArc * 0.8, end: endAngle, color: '#10b981' },
        ].map((seg, i) => {
          if (valueAngle <= seg.start) return null
          const segEnd = Math.min(valueAngle, seg.end)
          const d = `M ${arcX(seg.start)} ${arcY(seg.start)} A ${r} ${r} 0 ${seg.end - seg.start > 180 ? 1 : 0} 1 ${arcX(segEnd)} ${arcY(segEnd)}`
          return <path key={i} d={d} fill="none" stroke={seg.color} strokeWidth="8" strokeLinecap="round" opacity="0.9" />
        })}
        {/* Needle dot */}
        <circle cx={needleX} cy={needleY} r="5" fill={color} />
        <circle cx={needleX} cy={needleY} r="5" fill={color} opacity="0.3">
          <animate attributeName="r" values="5;10;5" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.3;0;0.3" dur="2s" repeatCount="indefinite" />
        </circle>
        {/* Value */}
        <text x={cx} y={cy + 6} textAnchor="middle" fontSize="22" fontWeight="700" fontFamily="monospace" fill={color}>{value}</text>
        <text x={cx} y={cy + 20} textAnchor="middle" fontSize="8" fontFamily="monospace" fill="#4b5563" letterSpacing="2">{classification.toUpperCase()}</text>
      </svg>
    </div>
  )
}

// ── Risk/Reward Bar ──────────────────────────────────────────────────────────

function RRBar({ stopPct, target1Pct, rr }: { stopPct: number; target1Pct: number; rr: number }) {
  const total = stopPct + target1Pct
  const stopW = total > 0 ? (stopPct / total) * 100 : 50
  const tgtW = total > 0 ? (target1Pct / total) * 100 : 50
  return (
    <div className="flex items-center gap-2 mt-2">
      <span className="text-[9px] font-mono text-red-400 w-8 text-right">-{stopPct}%</span>
      <div className="flex-1 flex h-1.5 rounded-full overflow-hidden">
        <div className="bg-red-500/60 rounded-l-full transition-all" style={{ width: `${stopW}%` }} />
        <div className="w-px bg-[#3a3a3a]" />
        <div className="bg-green-500/60 rounded-r-full transition-all" style={{ width: `${tgtW}%` }} />
      </div>
      <span className="text-[9px] font-mono text-green-400 w-8">+{target1Pct}%</span>
      <span className="text-[9px] font-mono text-[#d98310] w-10">{rr}x R:R</span>
    </div>
  )
}

// ── Strategy Card ─────────────────────────────────────────────────────────────

function StratCard({ s, rank }: { s: Strategy; rank: number }) {
  const [open, setOpen] = useState(false)
  const rp = s.risk_params
  const isLong = s.direction === 'LONG'
  const cColor = convColor(s.conviction)
  const dColor = dirColor(s.direction)

  return (
    <div
      className="border rounded-lg overflow-hidden cursor-pointer transition-all duration-200 hover:border-[#3a3a3a] group"
      style={{ borderColor: open ? '#2a2a2a' : '#1e1e1e', background: '#0d0d0d' }}
      onClick={() => setOpen(o => !o)}
    >
      {/* Conviction accent bar */}
      <div className="h-[2px] w-full" style={{ background: cColor, opacity: 0.7 }} />

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-[11px] font-mono text-[#d98310]">#{rank}</span>
            <span className="text-base font-mono font-bold text-white">{s.coin}</span>
            <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded" style={{ color: dColor, background: `${dColor}18`, border: `1px solid ${dColor}40` }}>
              {s.direction}
            </span>
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded" style={{ color: cColor, background: `${cColor}15`, border: `1px solid ${cColor}35` }}>
              {s.conviction}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, Math.ceil(s.score / 20)) }).map((_, i) => (
                <div key={i} className="w-1 h-3 rounded-sm" style={{ background: cColor, opacity: 0.7 + i * 0.06 }} />
              ))}
            </div>
            <span className="text-[10px] font-mono text-[#4b5563] group-hover:text-[#6b7280]">{open ? '▲' : '▼'}</span>
          </div>
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap gap-3 mt-2">
          <span className="text-[10px] font-mono text-[#d98310] uppercase tracking-wider">{s.source.replace(/_/g, ' ')}</span>
          {s.mark_px > 0 && <span className="text-[10px] font-mono text-[#6b7280]">{fmtPrice(s.mark_px)}</span>}
          {s.oi_usd_m > 0 && <span className="text-[10px] font-mono text-[#4b5563]">OI {fmtM(s.oi_usd_m)}</span>}
          {s.funding_apr !== 0 && (
            <span className={`text-[10px] font-mono ${s.funding_apr > 0 ? 'text-red-400' : 'text-green-400'}`}>
              Fund {s.funding_apr > 0 ? '+' : ''}{s.funding_apr.toFixed(0)}% APR
            </span>
          )}
        </div>

        {/* Signals chips */}
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {s.signals.map(sig => (
            <span key={sig} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#1a1a1a] text-[#6b7280] border border-[#2a2a2a] uppercase tracking-wider">
              {sig.replace(/_/g, ' ')}
            </span>
          ))}
        </div>

        {/* Reasons */}
        {s.reasons.slice(0, 2).map((r, i) => (
          <div key={i} className="flex items-start gap-1.5 mt-1.5">
            <span className="text-[#d98310] text-[10px] mt-0.5 shrink-0">›</span>
            <span className="text-[11px] font-mono text-[#9ca3af]">{r}</span>
          </div>
        ))}

        {/* R:R bar preview */}
        {rp && <RRBar stopPct={rp.stop_pct} target1Pct={rp.target1_pct} rr={rp.risk_reward} />}
      </div>

      {/* Expanded detail */}
      {open && (
        <div className="border-t border-[#1e1e1e] p-4 space-y-4 bg-[#0a0a0a]">

          {/* Remaining reasons */}
          {s.reasons.slice(2).map((r, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <span className="text-[#d98310] text-[10px] mt-0.5 shrink-0">›</span>
              <span className="text-[11px] font-mono text-[#9ca3af]">{r}</span>
            </div>
          ))}

          {/* Levels */}
          {rp && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Entry Zone', value: `${fmtPrice(rp.entry_zone[0])} – ${fmtPrice(rp.entry_zone[1])}`, color: '#f5f5f0' },
                { label: 'Stop Loss', value: `${fmtPrice(rp.stop)} (-${rp.stop_pct}%)`, color: '#ef4444' },
                { label: 'Target 1', value: `${fmtPrice(rp.target1)} (+${rp.target1_pct}%)`, color: '#22c55e' },
                { label: 'Target 2', value: `${fmtPrice(rp.target2)} (+${rp.target2_pct}%)`, color: '#10b981' },
              ].map(row => (
                <div key={row.label}>
                  <div className="text-[9px] font-mono text-[#4b5563] uppercase tracking-widest mb-1">{row.label}</div>
                  <div className="text-[11px] font-mono font-semibold" style={{ color: row.color }}>{row.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Whale agreement */}
          {s.whale_agreement && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[9px] font-mono text-[#4b5563] uppercase tracking-widest">Whales</span>
              <span className="text-[11px] font-mono text-[#d98310]">{s.whale_agreement}</span>
              {s.whale_names && (
                <span className="text-[10px] font-mono text-[#6b7280]">— {s.whale_names.slice(0, 3).join(', ')}</span>
              )}
            </div>
          )}

          {/* Note */}
          {s.note && <p className="text-[11px] font-mono text-[#6b7280] italic border-l-2 border-[#2a2a2a] pl-3">{s.note}</p>}

          {/* Execute command */}
          {rp && (
            <div className="bg-[#111111] border border-[#2a2a2a] rounded-md px-3 py-2.5">
              <div className="text-[9px] font-mono text-[#4b5563] uppercase tracking-widest mb-1.5">Execute via NERV</div>
              <code className="text-[11px] font-mono text-[#d98310] break-all leading-relaxed">
                {isLong
                  ? `BUY ${s.coin} {SIZE} limit ${rp.entry_zone[0]} sl ${rp.stop} tp ${rp.target1}`
                  : `SELL ${s.coin} {SIZE} limit ${rp.entry_zone[1]} sl ${rp.stop} tp ${rp.target1}`
                }
              </code>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Consensus Row ─────────────────────────────────────────────────────────────

function ConsensusRow({ coin, c }: { coin: string; c: ConsensusItem }) {
  const pctWidth = Math.min(c.agreement_pct, 100)
  const dColor = dirColor(c.direction)
  const cColor = convColor(c.conviction)
  return (
    <div className="py-3 border-b border-[#111111] last:border-0">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono font-bold text-white w-16 shrink-0">{coin}</span>
          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0" style={{ color: dColor, background: `${dColor}18`, border: `1px solid ${dColor}30` }}>
            {c.direction}
          </span>
          <span className="text-[10px] font-mono text-[#4b5563] hidden sm:block truncate">{c.traders.slice(0, 3).join(', ')}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs font-mono text-[#9ca3af]">{c.aligned_count}/{c.total_traders}</span>
          <span className="text-[10px] font-mono font-bold" style={{ color: cColor }}>{c.conviction}</span>
          <span className="text-[10px] font-mono text-[#6b7280] hidden sm:block">{fmtM(c.total_notional / 1e6)}</span>
        </div>
      </div>
      {/* Agreement bar */}
      <div className="mt-1.5 flex items-center gap-2">
        <div className="flex-1 h-0.5 bg-[#1e1e1e] rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${pctWidth}%`, background: dColor, opacity: 0.6 }} />
        </div>
        <span className="text-[9px] font-mono text-[#4b5563] w-8 text-right">{c.agreement_pct.toFixed(0)}%</span>
      </div>
    </div>
  )
}

// ── Metric Tile ───────────────────────────────────────────────────────────────

function Tile({ label, value, sub, color, pulse }: { label: string; value: string; sub?: string; color?: string; pulse?: boolean }) {
  return (
    <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-lg p-4 flex flex-col gap-1">
      <div className="text-[9px] font-mono text-[#4b5563] uppercase tracking-[0.15em]">{label}</div>
      <div className="flex items-center gap-2">
        {pulse && <div className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0" style={{ background: color || '#d98310' }} />}
        <span className="text-sm font-mono font-bold leading-none" style={{ color: color || '#f5f5f0' }}>{value}</span>
      </div>
      {sub && <div className="text-[10px] font-mono text-[#4b5563] mt-0.5">{sub}</div>}
    </div>
  )
}

// ── Scan line effect ──────────────────────────────────────────────────────────

function ScanLine() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden opacity-[0.015]">
      <div
        className="absolute inset-x-0 h-px bg-[#d98310]"
        style={{
          animation: 'scanline 8s linear infinite',
        }}
      />
      <style>{`
        @keyframes scanline {
          0% { top: -1px; }
          100% { top: 100vh; }
        }
      `}</style>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type Tab = 'strategies' | 'whales' | 'market' | 'macro'

export default function IntelPage() {
  const [data, setData] = useState<IntelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastFetch, setLastFetch] = useState<Date | null>(null)
  const [tab, setTab] = useState<Tab>('strategies')
  const [tick, setTick] = useState(0)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch('/api/intel', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setData(json)
      setLastFetch(new Date())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch intel')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetch()
    const refresh = setInterval(fetch, 5 * 60 * 1000)
    const clock = setInterval(() => setTick(t => t + 1), 1000)
    return () => { clearInterval(refresh); clearInterval(clock) }
  }, [fetch])

  const s = data?.summary
  const macro = data?.macro
  const fg = macro?.fear_greed
  const btc = macro?.btc_metrics
  const g = macro?.global
  const consensus = data?.leaderboard?.consensus_alltime ?? {}
  const highCons = Object.entries(consensus).filter(([, v]) => v.conviction !== 'LOW')
  const strategies = data?.strategies ?? []
  const scan = data?.market_scan

  const tabs: { id: Tab; label: string }[] = [
    { id: 'strategies', label: `Strategies${s ? ` · ${s.high_conviction_count} HIGH` : ''}` },
    { id: 'whales', label: `Whales${highCons.length ? ` · ${highCons.length}` : ''}` },
    { id: 'market', label: 'Market' },
    { id: 'macro', label: 'Macro' },
  ]

  return (
    <div className="min-h-screen bg-[#080808] text-[#f5f5f0]" style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace" }}>
      <ScanLine />

      {/* ── Header ── */}
      <header className="sticky top-0 z-50 border-b border-[#1a1a1a] bg-[#080808]/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 h-12 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="relative">
                <div className="w-2 h-2 rounded-full bg-[#d98310]" />
                <div className="absolute inset-0 w-2 h-2 rounded-full bg-[#d98310] animate-ping opacity-40" />
              </div>
              <span className="text-[#d98310] font-bold text-xs tracking-[0.25em] uppercase">NERV_02</span>
              <span className="text-[#2a2a2a]">|</span>
              <span className="text-[#4b5563] text-[10px] tracking-widest uppercase hidden sm:block">HL Intelligence</span>
            </div>
            {s && (
              <div className="hidden md:flex items-center gap-3 text-[10px] text-[#4b5563]">
                <span>{s.total_markets_scanned} mkts</span>
                <span>·</span>
                <span>{s.traders_analysed} whales</span>
                <span>·</span>
                <span style={{ color: biasColor(s.macro_bias) }}>{s.macro_bias.replace('_', '-')}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {lastFetch && (
              <span className="text-[9px] font-mono text-[#2a2a2a] hidden sm:block">
                {lastFetch.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={fetch}
              disabled={loading}
              className="text-[10px] font-mono px-2.5 py-1 rounded border transition-all"
              style={{
                color: loading ? '#4b5563' : '#6b7280',
                borderColor: loading ? '#1a1a1a' : '#2a2a2a',
              }}
            >
              {loading ? '⟳ scanning' : '⟳ refresh'}
            </button>
          </div>
        </div>
      </header>

      {/* ── Error ── */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 pt-6">
          <div className="border border-red-900/50 bg-red-950/20 rounded-lg p-4">
            <div className="text-red-400 text-sm font-mono">{error}</div>
            <div className="text-[#4b5563] text-xs font-mono mt-1">
              Run: <code className="text-[#d98310]">py scripts/hl/intel.py --json --depth 20 &gt; memory/logs/intel-latest.json</code>
            </div>
          </div>
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {loading && !data && (
        <div className="max-w-7xl mx-auto px-4 py-20 flex flex-col items-center gap-4">
          <div className="text-[#d98310] text-xs font-mono animate-pulse tracking-widest">SCANNING MARKETS...</div>
          <div className="flex gap-1">
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className="w-1 bg-[#d98310] rounded-full animate-bounce" style={{ height: 12 + i * 6, animationDelay: `${i * 0.1}s` }} />
            ))}
          </div>
        </div>
      )}

      {data && (
        <div className="max-w-7xl mx-auto px-4 py-5 space-y-5 relative z-10">

          {/* ── Macro Strip ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {/* Fear/Greed */}
            {fg && (
              <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-lg p-3 col-span-1 flex flex-col items-center justify-center">
                <FearGreedArc value={fg.value} classification={fg.classification} />
                <div className="flex items-center gap-2 mt-1 text-[9px] font-mono text-[#4b5563]">
                  <span className={fg.trend === 'RISING' ? 'text-green-500' : 'text-red-500'}>{fg.trend === 'RISING' ? '↑' : '↓'}</span>
                  <span>was {fg.yesterday}</span>
                </div>
              </div>
            )}

            {btc && (
              <>
                <Tile
                  label="BTC"
                  value={`$${btc.btc_price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
                  sub={`${pct(btc.btc_24h_pct)} · ${pct(btc.btc_7d_pct)} 7d`}
                  color={btc.btc_24h_pct >= 0 ? '#22c55e' : '#ef4444'}
                  pulse
                />
                <Tile
                  label="Regime"
                  value={btc.market_regime.replace('_', ' ')}
                  sub={`30d ${pct(btc.btc_30d_pct)}`}
                  color={btc.btc_30d_pct >= 0 ? '#22c55e' : '#ef4444'}
                />
              </>
            )}

            {s && (
              <Tile
                label="Macro Bias"
                value={s.macro_bias.replace('_', '-')}
                sub={`BTC.D ${g?.btc_dominance_pct}%`}
                color={biasColor(s.macro_bias)}
              />
            )}

            {s && (
              <Tile
                label="HIGH Conviction"
                value={`${s.high_conviction_count}`}
                sub={`${strategies.length} total ideas`}
                color="#d98310"
              />
            )}

            {g && (
              <Tile
                label="Market Cap"
                value={`$${(g.total_market_cap_usd / 1e12).toFixed(2)}T`}
                sub={`${pct(g.market_cap_change_24h)} 24h`}
                color={g.market_cap_change_24h >= 0 ? '#22c55e' : '#ef4444'}
              />
            )}
          </div>

          {/* Generated at */}
          <div className="text-[9px] font-mono text-[#2a2a2a] tracking-wider">
            {data.generated_at} · {data.elapsed_sec}s · {s?.total_markets_scanned} mkts · {s?.traders_analysed} whales
          </div>

          {/* ── Tabs ── */}
          <div className="flex gap-0 border-b border-[#1a1a1a]">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="text-[10px] font-mono px-4 py-2.5 border-b-2 transition-all tracking-wider uppercase"
                style={{
                  borderColor: tab === t.id ? '#d98310' : 'transparent',
                  color: tab === t.id ? '#d98310' : '#4b5563',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Strategies ── */}
          {tab === 'strategies' && (
            <div className="space-y-2.5">
              {strategies.length === 0
                ? <div className="text-[#4b5563] text-sm font-mono py-8 text-center">No strategies generated.</div>
                : strategies.map((strat, i) => (
                  <StratCard key={`${strat.coin}-${strat.direction}`} s={strat} rank={i + 1} />
                ))
              }
            </div>
          )}

          {/* ── Whales ── */}
          {tab === 'whales' && (
            <div className="space-y-6">
              {highCons.length > 0 && (
                <div>
                  <div className="text-[9px] font-mono text-[#d98310] uppercase tracking-[0.2em] mb-3">Consensus Positions</div>
                  <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-lg divide-y divide-[#111111] px-4">
                    {highCons.map(([coin, c]) => <ConsensusRow key={coin} coin={coin} c={c} />)}
                  </div>
                </div>
              )}

              {data.leaderboard.top_traders.length > 0 && (
                <div>
                  <div className="text-[9px] font-mono text-[#d98310] uppercase tracking-[0.2em] mb-3">Top Traders — All-Time PnL</div>
                  <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-lg overflow-hidden">
                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-6 px-4 py-2 border-b border-[#111111]">
                      {['Trader', 'All-Time', '30d', 'WR'].map(h => (
                        <div key={h} className="text-[9px] font-mono text-[#2a2a2a] uppercase tracking-widest">{h}</div>
                      ))}
                    </div>
                    {data.leaderboard.top_traders.slice(0, 15).map((t, i) => {
                      const wr = t.trade_stats?.win_rate
                      return (
                        <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-6 px-4 py-2.5 border-b border-[#111111] last:border-0 hover:bg-[#111111] transition-colors">
                          <span className="text-[11px] font-mono text-[#6b7280] truncate">{t.display}</span>
                          <span className="text-[11px] font-mono text-green-400">${(t.all_time.pnl / 1e6).toFixed(1)}M</span>
                          <span className={`text-[11px] font-mono ${t.month.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {t.month.pnl >= 0 ? '+' : ''}${(t.month.pnl / 1e3).toFixed(0)}k
                          </span>
                          <span className="text-[11px] font-mono text-[#4b5563]">{wr != null ? `${wr.toFixed(0)}%` : '—'}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Market ── */}
          {tab === 'market' && scan && (
            <div className="space-y-6">
              {scan.extreme_funding.length > 0 && (
                <div>
                  <div className="text-[9px] font-mono text-[#d98310] uppercase tracking-[0.2em] mb-3">Extreme Funding Rates</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {scan.extreme_funding.map(r => {
                      const isPos = r.funding_apr_pct > 0
                      const col = isPos ? '#ef4444' : '#22c55e'
                      return (
                        <div key={r.coin} className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-lg p-3.5" style={{ borderLeftColor: col, borderLeftWidth: 2 }}>
                          <div className="flex justify-between items-center">
                            <span className="font-mono font-bold text-white">{r.coin}</span>
                            <span className="text-sm font-mono font-bold" style={{ color: col }}>
                              {r.funding_apr_pct > 0 ? '+' : ''}{r.funding_apr_pct.toFixed(0)}%
                            </span>
                          </div>
                          <div className="text-[10px] font-mono text-[#4b5563] mt-1">
                            {isPos ? 'LONGS PAYING' : 'SHORTS PAYING'} · OI {fmtM(r.oi_usd_m)} · {pct(r.change_24h_pct)}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {scan.volume_spikes.length > 0 && (
                <div>
                  <div className="text-[9px] font-mono text-[#d98310] uppercase tracking-[0.2em] mb-3">Volume Spikes</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {scan.volume_spikes.map(r => (
                      <div key={r.coin} className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-lg p-3.5 border-l-[#d98310] border-l-2">
                        <div className="flex justify-between">
                          <span className="font-mono font-bold text-white">{r.coin}</span>
                          <span className="text-sm font-mono font-bold text-[#d98310]">{r.vol_oi_ratio.toFixed(1)}× OI</span>
                        </div>
                        <div className="text-[10px] font-mono text-[#4b5563] mt-1">
                          {fmtM(r.volume_24h_m)} vol · {pct(r.change_24h_pct)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {scan.top_movers_24h.length > 0 && (
                <div>
                  <div className="text-[9px] font-mono text-[#d98310] uppercase tracking-[0.2em] mb-3">Top Movers 24h</div>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
                    {scan.top_movers_24h.map(r => {
                      const isUp = r.change_24h_pct >= 0
                      return (
                        <div key={r.coin} className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-lg p-3 text-center">
                          <div className="font-mono font-bold text-white text-sm">{r.coin}</div>
                          <div className={`text-base font-mono font-bold mt-1 ${isUp ? 'text-green-400' : 'text-red-400'}`}>
                            {pct(r.change_24h_pct)}
                          </div>
                          <div className="text-[9px] font-mono text-[#4b5563] mt-0.5">{fmtPrice(r.mark_px)}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Macro ── */}
          {tab === 'macro' && macro && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-lg p-5 space-y-3">
                <div className="text-[9px] font-mono text-[#d98310] uppercase tracking-[0.2em] mb-1">BTC Intelligence</div>
                {btc && [
                  ['Price', `$${btc.btc_price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, '#f5f5f0'],
                  ['24h', pct(btc.btc_24h_pct), btc.btc_24h_pct >= 0 ? '#22c55e' : '#ef4444'],
                  ['7d', pct(btc.btc_7d_pct), btc.btc_7d_pct >= 0 ? '#22c55e' : '#ef4444'],
                  ['30d', pct(btc.btc_30d_pct), btc.btc_30d_pct >= 0 ? '#22c55e' : '#ef4444'],
                  ['ETH/BTC', btc.eth_btc_ratio.toFixed(5), '#f5f5f0'],
                  ['Alt Season', btc.alt_season ? 'YES' : 'NO', btc.alt_season ? '#22c55e' : '#6b7280'],
                  ['Regime', btc.market_regime.replace('_', ' '), '#d98310'],
                ].map(([label, value, color]) => (
                  <div key={label} className="flex justify-between items-center border-b border-[#111111] pb-2 last:border-0 last:pb-0">
                    <span className="text-[10px] font-mono text-[#4b5563] uppercase tracking-wider">{label}</span>
                    <span className="text-[11px] font-mono font-semibold" style={{ color: color as string }}>{value}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-4">
                <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-lg p-5">
                  <div className="text-[9px] font-mono text-[#d98310] uppercase tracking-[0.2em] mb-4">Fear & Greed</div>
                  <div className="flex justify-center">
                    <FearGreedArc value={fg!.value} classification={fg!.classification} />
                  </div>
                  <div className="text-[10px] font-mono text-[#6b7280] text-center mt-1">{fg?.signal}</div>
                </div>

                <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-lg p-5">
                  <div className="text-[9px] font-mono text-[#d98310] uppercase tracking-[0.2em] mb-3">Global Market</div>
                  <div className="space-y-2">
                    {g && [
                      ['Market Cap', `$${(g.total_market_cap_usd / 1e12).toFixed(2)}T`, '#f5f5f0'],
                      ['24h Change', pct(g.market_cap_change_24h), g.market_cap_change_24h >= 0 ? '#22c55e' : '#ef4444'],
                      ['BTC Dominance', `${g.btc_dominance_pct}%`, '#f5f5f0'],
                    ].map(([label, value, color]) => (
                      <div key={label} className="flex justify-between">
                        <span className="text-[10px] font-mono text-[#4b5563]">{label}</span>
                        <span className="text-[10px] font-mono font-semibold" style={{ color: color as string }}>{value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 text-[10px] font-mono text-[#4b5563] border-t border-[#111111] pt-3">{macro.derived.bias_note}</div>
                </div>

                {macro.trending.length > 0 && (
                  <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-lg p-4">
                    <div className="text-[9px] font-mono text-[#d98310] uppercase tracking-[0.2em] mb-2">Trending</div>
                    <div className="flex flex-wrap gap-1.5">
                      {macro.trending.map(c => (
                        <span key={c.symbol} className="text-[10px] font-mono text-[#6b7280] bg-[#111111] border border-[#1e1e1e] px-2 py-1 rounded">
                          {c.symbol}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Footer ── */}
      <footer className="border-t border-[#111111] mt-12 px-4 py-3">
        <div className="max-w-7xl mx-auto flex justify-between items-center text-[9px] font-mono text-[#1e1e1e] uppercase tracking-widest">
          <span>NERV_02 // HL INTELLIGENCE ENGINE</span>
          <span>{data?.generated_at}</span>
        </div>
      </footer>
    </div>
  )
}
