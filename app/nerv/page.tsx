'use client'
import { apiFetch } from '@/lib/client-auth'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { Skill, Run, RiskParams, Strategy, ConsensusItem, IntelData } from '@/lib/types'
import { C, SKILL_GROUPS, GROUP_COLORS } from '@/lib/theme'
import { fmtPrice, fmtM, pct, fgColor, biasColor, dirColor, convColor, timeAgo, runStatusColor, runStatusLabel, getGroup, uid } from '@/lib/utils'

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface Message { id: string; role: 'user' | 'system' | 'agent' | 'claude'; text: string; skill?: string; streaming?: boolean; ts: number }

// Fixed cascade content — avoids SSR hydration mismatch
const CASCADE_ROWS = [
  '4F2A','1C8E','B73D','F150','9A2C','3E71','C4B8','07F3','8D1A','56E9',
  'A3FC','29B0','E7D4','0C58','6F1B','D9A2','4821','CF36','72A0','B59E',
  '1F84','E302','78DC','A61F','3B90','5C47','0DE8','F229','94B3','6A1C',
  'D503','8E71','2CF9','B048','7D16','EA32','4190','C8F5','35A7','0B62',
  'F714','9D28','43EC','B60A','7823','D1F4','0E59','A74C','2B16','C930',
  'F81D','64B2','9C0E','3A75','E248','0F91','B5C3','7D42','1A86','CE57',
  '5239','F0A4','8B16','2D79','A403','6EC8','0152','D9F7','3B84','C526',
  '47A0','1EB3','F962','8C05','3D71','B240','0A9E','E61C','52F8','9D34',
]
const CASCADE_CONTENT = CASCADE_ROWS.join('\n')

// ─── SHARED COMPONENTS ────────────────────────────────────────────────────────

function Brackets({ size = 7, color = C.orangeDim }: { size?: number; color?: string }) {
  const s = `${size}px`, b = `1px solid ${color}`
  return (
    <>
      <span style={{ position: 'absolute', top: 0, left: 0, width: s, height: s, borderTop: b, borderLeft: b }} />
      <span style={{ position: 'absolute', top: 0, right: 0, width: s, height: s, borderTop: b, borderRight: b }} />
      <span style={{ position: 'absolute', bottom: 0, left: 0, width: s, height: s, borderBottom: b, borderLeft: b }} />
      <span style={{ position: 'absolute', bottom: 0, right: 0, width: s, height: s, borderBottom: b, borderRight: b }} />
    </>
  )
}

function PanelLabel({ text, sub, color = C.orange }: { text: string; sub?: string; color?: string }) {
  return (
    <div style={{ padding: '6px 12px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
      <span style={{ color, fontFamily: 'monospace', fontSize: 8, letterSpacing: 3, fontWeight: 700 }}>{text}</span>
      {sub && <span style={{ color: C.textDim, fontFamily: 'monospace', fontSize: 7, letterSpacing: 1 }}>{sub}</span>}
      <span style={{ flex: 1 }} />
      <span style={{ width: 4, height: 4, borderRadius: '50%', background: color, boxShadow: `0 0 5px ${color}` }} />
    </div>
  )
}

function Clock() {
  const [time, setTime] = useState('')
  useEffect(() => {
    const fmt = () => new Date().toLocaleTimeString('en-US', { hour12: false })
    setTime(fmt())
    const i = setInterval(() => setTime(fmt()), 1000)
    return () => clearInterval(i)
  }, [])
  return <span style={{ fontFamily: 'monospace', fontSize: 10, color: C.orange, letterSpacing: 3 }}>{time}</span>
}

// ─── TERMINAL COMPONENTS ──────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  if (msg.role === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', animation: 'nge-fadein 0.2s ease' }}>
        <div style={{ maxWidth: '72%', padding: '8px 14px', background: `${C.orange}10`, border: `1px solid ${C.orange}40`, color: C.textBright, fontSize: 11, lineHeight: 1.6, position: 'relative', fontFamily: 'monospace' }}>
          <Brackets size={5} color={C.orange} />
          {msg.text}
        </div>
      </div>
    )
  }
  if (msg.role === 'claude') {
    return (
      <div style={{ animation: 'nge-fadein 0.2s ease' }}>
        <div style={{ color: C.orange, fontSize: 8, letterSpacing: 2, marginBottom: 4, fontFamily: 'monospace' }}>◀ MAGI-SYS / RESPONSE</div>
        <div style={{ padding: '10px 14px', background: `${C.orange}07`, border: `1px solid ${C.orange}28`, borderLeft: `2px solid ${C.orange}`, color: C.textBright, fontSize: 12, lineHeight: 1.8, whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
          {msg.text || ' '}
          {msg.streaming && <span style={{ animation: 'nge-blink 0.6s infinite', color: C.orange }}>▌</span>}
        </div>
      </div>
    )
  }
  if (msg.role === 'agent') {
    const group = msg.skill ? getGroup(msg.skill, SKILL_GROUPS) : 'META'
    const color = GROUP_COLORS[group] || C.orange
    return (
      <div style={{ animation: 'nge-fadein 0.2s ease' }}>
        <div style={{ color, fontSize: 8, letterSpacing: 2, marginBottom: 4, fontFamily: 'monospace' }}>◀ UNIT: {msg.skill?.toUpperCase()}</div>
        <div style={{ padding: '10px 14px', background: `${color}0a`, border: `1px solid ${color}28`, borderLeft: `2px solid ${color}`, color: C.text, fontSize: 11, lineHeight: 1.8, whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
          {msg.text}
        </div>
      </div>
    )
  }
  return (
    <div style={{ animation: 'nge-fadein 0.2s ease' }}>
      <div style={{ padding: '8px 14px', background: `${C.border}44`, border: `1px solid ${C.border}`, borderLeft: `2px solid ${C.textDim}`, color: C.textDim, fontSize: 10, lineHeight: 1.8, whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
        {msg.text}
      </div>
    </div>
  )
}

function RunCard({ run }: { run: Run }) {
  const color = runStatusColor(run.status, run.conclusion, C)
  const isActive = run.status === 'in_progress'
  return (
    <a href={run.url} target="_blank" rel="noreferrer"
      style={{ display: 'block', padding: '8px 12px', borderBottom: `1px solid ${C.border}`, textDecoration: 'none', background: isActive ? `${C.orange}07` : 'transparent', position: 'relative' }}
      onMouseEnter={e => (e.currentTarget.style.background = '#ffffff05')}
      onMouseLeave={e => (e.currentTarget.style.background = isActive ? `${C.orange}07` : 'transparent')}
    >
      {isActive && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: C.orange, boxShadow: `0 0 8px ${C.orange}`, animation: 'nge-pulse 1s infinite' }} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <span style={{ width: 4, height: 4, borderRadius: '50%', background: color, boxShadow: isActive ? `0 0 6px ${color}` : 'none', flexShrink: 0 }} />
        <span style={{ color, fontSize: 7, letterSpacing: 2, fontFamily: 'monospace' }}>{runStatusLabel(run.status, run.conclusion)}</span>
        <span style={{ color: C.textDim, fontSize: 7, marginLeft: 'auto', fontFamily: 'monospace' }}>#{String(run.id).slice(-4)}</span>
      </div>
      <div style={{ color: C.text, fontSize: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingLeft: 10, fontFamily: 'monospace' }}>{run.workflow}</div>
      <div style={{ color: C.textDim, fontSize: 7, paddingLeft: 10, marginTop: 1, fontFamily: 'monospace' }}>{timeAgo(run.created_at)}</div>
    </a>
  )
}

// ─── INTEL COMPONENTS ─────────────────────────────────────────────────────────

function FearGreedArc({ value, classification }: { value: number; classification: string }) {
  const color = fgColor(value)
  const r = 52, cx = 70, cy = 68
  const startAngle = 200, endAngle = 340
  const totalArc = endAngle - startAngle
  const valueAngle = startAngle + (value / 100) * totalArc
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const arcX = (deg: number) => cx + r * Math.cos(toRad(deg - 90))
  const arcY = (deg: number) => cy + r * Math.sin(toRad(deg - 90))
  const bgD = `M ${arcX(startAngle)} ${arcY(startAngle)} A ${r} ${r} 0 1 1 ${arcX(endAngle)} ${arcY(endAngle)}`
  const needleX = cx + (r - 9) * Math.cos(toRad(valueAngle - 90))
  const needleY = cy + (r - 9) * Math.sin(toRad(valueAngle - 90))
  const segs = [
    { start: startAngle,                      end: startAngle + totalArc * 0.2, color: '#ff1100' },
    { start: startAngle + totalArc * 0.2,    end: startAngle + totalArc * 0.4, color: '#ff6600' },
    { start: startAngle + totalArc * 0.4,    end: startAngle + totalArc * 0.6, color: '#ffaa00' },
    { start: startAngle + totalArc * 0.6,    end: startAngle + totalArc * 0.8, color: '#00ff88' },
    { start: startAngle + totalArc * 0.8,    end: endAngle,                    color: '#00cc66' },
  ]
  return (
    <svg width="140" height="96" viewBox="0 0 140 96">
      <path d={bgD} fill="none" stroke={C.bgDeep} strokeWidth="7" strokeLinecap="round" />
      {segs.map((seg, i) => {
        if (valueAngle <= seg.start) return null
        const segEnd = Math.min(valueAngle, seg.end)
        const d = `M ${arcX(seg.start)} ${arcY(seg.start)} A ${r} ${r} 0 ${seg.end - seg.start > 180 ? 1 : 0} 1 ${arcX(segEnd)} ${arcY(segEnd)}`
        return <path key={i} d={d} fill="none" stroke={seg.color} strokeWidth="7" strokeLinecap="round" opacity="0.9" />
      })}
      <circle cx={needleX} cy={needleY} r="4" fill={color} />
      <circle cx={needleX} cy={needleY} r="4" fill={color} opacity="0.3">
        <animate attributeName="r" values="4;10;4" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.3;0;0.3" dur="2s" repeatCount="indefinite" />
      </circle>
      <text x={cx} y={cy + 5} textAnchor="middle" fontSize="20" fontWeight="700" fontFamily="monospace" fill={color}>{value}</text>
      <text x={cx} y={cy + 19} textAnchor="middle" fontSize="6" fontFamily="monospace" fill={C.textDim} letterSpacing="2">{classification.toUpperCase()}</text>
    </svg>
  )
}

function RRBar({ stopPct, target1Pct, rr }: { stopPct: number; target1Pct: number; rr: number }) {
  const total = stopPct + target1Pct
  const stopW = total > 0 ? (stopPct / total) * 100 : 50
  const tgtW = total > 0 ? (target1Pct / total) * 100 : 50
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
      <span style={{ fontSize: 8, fontFamily: 'monospace', color: C.red, width: 26, textAlign: 'right' }}>-{stopPct}%</span>
      <div style={{ flex: 1, display: 'flex', height: 3, overflow: 'hidden' }}>
        <div style={{ background: `${C.red}66`, width: `${stopW}%` }} />
        <div style={{ width: 1, background: C.border }} />
        <div style={{ background: `${C.green}66`, width: `${tgtW}%` }} />
      </div>
      <span style={{ fontSize: 8, fontFamily: 'monospace', color: C.green, width: 26 }}>+{target1Pct}%</span>
      <span style={{ fontSize: 8, fontFamily: 'monospace', color: C.orange, width: 34 }}>{rr}x R:R</span>
    </div>
  )
}

function StratCard({ s, rank }: { s: Strategy; rank: number }) {
  const [open, setOpen] = useState(false)
  const rp = s.risk_params
  const cColor = convColor(s.conviction)
  const dColor = dirColor(s.direction)
  return (
    <div onClick={() => setOpen(o => !o)} style={{ border: `1px solid ${open ? C.borderHi : C.border}`, background: C.bgPanel, cursor: 'pointer', overflow: 'hidden', transition: 'border-color 0.15s', animation: 'nge-fadein 0.25s ease' }}>
      <div style={{ height: 2, background: cColor, opacity: 0.85 }} />
      <div style={{ padding: '10px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ color: C.orange, fontFamily: 'monospace', fontSize: 8 }}>#{rank}</span>
            <span style={{ color: C.textBright, fontFamily: 'monospace', fontSize: 12, fontWeight: 700 }}>{s.coin}</span>
            <span style={{ color: dColor, background: `${dColor}18`, border: `1px solid ${dColor}44`, fontFamily: 'monospace', fontSize: 8, fontWeight: 700, padding: '1px 6px' }}>{s.direction}</span>
            <span style={{ color: cColor, background: `${cColor}15`, border: `1px solid ${cColor}35`, fontFamily: 'monospace', fontSize: 8, fontWeight: 700, padding: '1px 6px' }}>{s.conviction}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {Array.from({ length: Math.min(5, Math.ceil(s.score / 20)) }).map((_, i) => (
              <div key={i} style={{ width: 2, height: 9, background: cColor, opacity: 0.6 + i * 0.08 }} />
            ))}
            <span style={{ color: C.textDim, fontFamily: 'monospace', fontSize: 8, marginLeft: 4 }}>{open ? '▲' : '▼'}</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 5 }}>
          <span style={{ color: C.orange, fontFamily: 'monospace', fontSize: 8, letterSpacing: 1 }}>{s.source.replace(/_/g, ' ')}</span>
          {s.mark_px > 0 && <span style={{ color: C.textDim, fontFamily: 'monospace', fontSize: 8 }}>{fmtPrice(s.mark_px)}</span>}
          {s.oi_usd_m > 0 && <span style={{ color: C.textMuted, fontFamily: 'monospace', fontSize: 8 }}>OI {fmtM(s.oi_usd_m)}</span>}
          {s.funding_apr !== 0 && <span style={{ color: s.funding_apr > 0 ? C.red : C.green, fontFamily: 'monospace', fontSize: 8 }}>F {s.funding_apr > 0 ? '+' : ''}{s.funding_apr.toFixed(0)}%</span>}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 7 }}>
          {s.signals.map((sig, i) => (
            <span key={`${sig}-${i}`} style={{ fontFamily: 'monospace', fontSize: 7, padding: '2px 5px', background: C.bgDeep, color: C.textDim, border: `1px solid ${C.border}`, letterSpacing: 1 }}>{sig.replace(/_/g, ' ')}</span>
          ))}
        </div>
        {s.reasons.slice(0, 2).map((r, i) => (
          <div key={i} style={{ display: 'flex', gap: 5, marginTop: 4, alignItems: 'flex-start' }}>
            <span style={{ color: C.orange, fontSize: 8, marginTop: 1 }}>›</span>
            <span style={{ color: C.text, fontFamily: 'monospace', fontSize: 9, lineHeight: 1.5 }}>{r}</span>
          </div>
        ))}
        {rp && <RRBar stopPct={rp.stop_pct} target1Pct={rp.target1_pct} rr={rp.risk_reward} />}
      </div>
      {open && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: '10px 12px', background: C.bgDeep }}>
          {s.reasons.slice(2).map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 5, marginBottom: 4, alignItems: 'flex-start' }}>
              <span style={{ color: C.orange, fontSize: 8, marginTop: 1 }}>›</span>
              <span style={{ color: C.text, fontFamily: 'monospace', fontSize: 9, lineHeight: 1.5 }}>{r}</span>
            </div>
          ))}
          {rp && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
              {[
                { label: 'Entry Zone', value: `${fmtPrice(rp.entry_zone[0])} – ${fmtPrice(rp.entry_zone[1])}`, color: C.textBright },
                { label: 'Stop Loss', value: `${fmtPrice(rp.stop)} (-${rp.stop_pct}%)`, color: C.red },
                { label: 'Target 1', value: `${fmtPrice(rp.target1)} (+${rp.target1_pct}%)`, color: C.green },
                { label: 'Target 2', value: `${fmtPrice(rp.target2)} (+${rp.target2_pct}%)`, color: '#00cc66' },
              ].map(row => (
                <div key={row.label}>
                  <div style={{ fontFamily: 'monospace', fontSize: 7, color: C.textDim, letterSpacing: 2, marginBottom: 2 }}>{row.label}</div>
                  <div style={{ fontFamily: 'monospace', fontSize: 9, fontWeight: 600, color: row.color }}>{row.value}</div>
                </div>
              ))}
            </div>
          )}
          {s.whale_agreement && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
              <span style={{ fontFamily: 'monospace', fontSize: 7, color: C.textDim, letterSpacing: 2 }}>WHALES</span>
              <span style={{ fontFamily: 'monospace', fontSize: 9, color: C.orange }}>{s.whale_agreement}</span>
              {s.whale_names && <span style={{ fontFamily: 'monospace', fontSize: 8, color: C.textDim }}>— {s.whale_names.slice(0, 3).join(', ')}</span>}
            </div>
          )}
          {s.note && <p style={{ fontFamily: 'monospace', fontSize: 9, color: C.textDim, fontStyle: 'italic', borderLeft: `2px solid ${C.border}`, paddingLeft: 8, marginTop: 8 }}>{s.note}</p>}
          {rp && (
            <div style={{ background: C.bgPanel, border: `1px solid ${C.border}`, padding: '7px 10px', marginTop: 10 }}>
              <div style={{ fontFamily: 'monospace', fontSize: 7, color: C.textDim, letterSpacing: 2, marginBottom: 4 }}>EXECUTE VIA NERV</div>
              <code style={{ fontFamily: 'monospace', fontSize: 9, color: C.orange, wordBreak: 'break-all' }}>
                {s.direction === 'LONG'
                  ? `BUY ${s.coin} {SIZE} limit ${rp.entry_zone[0]} sl ${rp.stop} tp ${rp.target1}`
                  : `SELL ${s.coin} {SIZE} limit ${rp.entry_zone[1]} sl ${rp.stop} tp ${rp.target1}`}
              </code>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ConsensusRow({ coin, c }: { coin: string; c: ConsensusItem }) {
  const dColor = dirColor(c.direction)
  const cColor = convColor(c.conviction)
  return (
    <div style={{ padding: '9px 0', borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'monospace', fontWeight: 700, color: C.textBright, fontSize: 10, width: 52, flexShrink: 0 }}>{coin}</span>
          <span style={{ color: dColor, background: `${dColor}18`, border: `1px solid ${dColor}30`, fontFamily: 'monospace', fontSize: 8, fontWeight: 700, padding: '1px 5px' }}>{c.direction}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'monospace', fontSize: 9, color: C.text }}>{c.aligned_count}/{c.total_traders}</span>
          <span style={{ fontFamily: 'monospace', fontSize: 8, fontWeight: 700, color: cColor }}>{c.conviction}</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
        <div style={{ flex: 1, height: 2, background: C.bgDeep, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.min(c.agreement_pct, 100)}%`, background: dColor, opacity: 0.6 }} />
        </div>
        <span style={{ fontFamily: 'monospace', fontSize: 7, color: C.textDim, width: 24, textAlign: 'right' }}>{c.agreement_pct.toFixed(0)}%</span>
      </div>
    </div>
  )
}

function IntelTile({ label, value, sub, color, pulse }: { label: string; value: string; sub?: string; color?: string; pulse?: boolean }) {
  return (
    <div style={{ background: C.bgPanel, border: `1px solid ${C.border}`, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontFamily: 'monospace', fontSize: 7, color: C.textDim, letterSpacing: 2 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        {pulse && <div style={{ width: 4, height: 4, borderRadius: '50%', background: color || C.orange, animation: 'nge-pulse 1s infinite' }} />}
        <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: color || C.textBright }}>{value}</span>
      </div>
      {sub && <div style={{ fontFamily: 'monospace', fontSize: 8, color: C.textDim }}>{sub}</div>}
    </div>
  )
}

// ─── INTEL PANEL ──────────────────────────────────────────────────────────────

type IntelTab = 'strategies' | 'whales' | 'market' | 'macro'

function IntelPanel({ onDispatch }: { onDispatch: (skill: string) => void }) {
  const [data, setData] = useState<IntelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<IntelTab>('strategies')

  const loadIntel = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch('/api/intel', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fetch failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadIntel()
    const i = setInterval(loadIntel, 5 * 60 * 1000)
    return () => clearInterval(i)
  }, [loadIntel])

  const s = data?.summary
  const macro = data?.macro
  const fg = macro?.fear_greed
  const btc = macro?.btc_metrics
  const g = macro?.global
  const consensus = data?.leaderboard?.consensus_alltime ?? {}
  const highCons = Object.entries(consensus).filter(([, v]) => v.conviction !== 'LOW')
  const strategies = data?.strategies ?? []
  const scan = data?.market_scan

  if (loading && !data) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <div style={{ color: C.orange, fontFamily: 'monospace', fontSize: 8, letterSpacing: 4, animation: 'nge-blink 1.2s infinite' }}>
          INITIALIZING MAGI INTERFACE
        </div>
        <div style={{ display: 'flex', gap: 3 }}>
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} style={{ width: 3, background: C.orange, borderRadius: 1, animation: 'nge-bar 1.2s ease-in-out infinite', animationDelay: `${i * 0.12}s`, height: 8 + i * 5 }} />
          ))}
        </div>
        <div style={{ fontFamily: 'monospace', fontSize: 7, color: C.textDim, letterSpacing: 3, marginTop: 6 }}>
          SCANNING MARKETS // PROCESSING WHALE POSITIONS
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ flex: 1, padding: 20 }}>
        <div style={{ border: `1px solid ${C.red}44`, background: `${C.red}0a`, padding: '14px 16px', position: 'relative' }}>
          <Brackets size={8} color={C.red} />
          <div style={{ color: C.red, fontFamily: 'monospace', fontSize: 9, letterSpacing: 2, marginBottom: 8 }}>⚠ MAGI INTERFACE ERROR — NO DATA</div>
          <div style={{ color: C.textDim, fontFamily: 'monospace', fontSize: 8, lineHeight: 1.6 }}>{error}</div>
          <div style={{ color: C.textDim, fontFamily: 'monospace', fontSize: 7, marginTop: 10 }}>
            DISPATCH <span style={{ color: C.orange }}>HL-INTEL</span> TO GENERATE INTELLIGENCE DATA
          </div>
          <button onClick={() => onDispatch('hl-intel')} style={{ marginTop: 12, padding: '5px 14px', background: 'transparent', border: `1px solid ${C.orange}`, color: C.orange, fontFamily: 'monospace', fontSize: 8, letterSpacing: 2, cursor: 'pointer' }}>
            DISPATCH HL-INTEL ▶
          </button>
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

      {/* MAGI Status Bar */}
      <div style={{ padding: '5px 14px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 16, alignItems: 'center', background: C.bgDeep, flexShrink: 0 }}>
        {[
          { name: 'BALTHASAR', role: 'MACRO',       ok: !!macro },
          { name: 'CASPAR',    role: 'SCANNER',     ok: !!scan },
          { name: 'MELCHIOR',  role: 'LEADERBOARD', ok: !!data.leaderboard },
        ].map(m => (
          <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 3, height: 3, borderRadius: '50%', background: m.ok ? C.green : C.red, boxShadow: m.ok ? `0 0 4px ${C.green}` : 'none' }} />
            <span style={{ fontFamily: 'monospace', fontSize: 6, color: C.textDim, letterSpacing: 2 }}>{m.name}</span>
            <span style={{ fontFamily: 'monospace', fontSize: 6, color: C.textMuted }}>/{m.role}</span>
          </div>
        ))}
        <span style={{ flex: 1 }} />
        {s && <span style={{ fontFamily: 'monospace', fontSize: 6, color: C.textDim, letterSpacing: 1 }}>{data.generated_at} · {data.elapsed_sec}s</span>}
        <button onClick={loadIntel} disabled={loading} style={{ fontFamily: 'monospace', fontSize: 7, color: C.textDim, background: 'transparent', border: 'none', cursor: 'pointer', letterSpacing: 1 }}>
          {loading ? '⟳' : '⟳ RESCAN'}
        </button>
      </div>

      {/* Macro Strip */}
      <div style={{ padding: '8px 14px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr 1fr 1fr', gap: 6, alignItems: 'stretch' }}>
          {fg && (
            <div style={{ background: C.bgPanel, border: `1px solid ${C.border}`, padding: '4px 6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FearGreedArc value={fg.value} classification={fg.classification} />
            </div>
          )}
          {btc && (
            <>
              <IntelTile label="BTC" value={`$${btc.btc_price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`} sub={`${pct(btc.btc_24h_pct)} · ${pct(btc.btc_7d_pct)} 7d`} color={btc.btc_24h_pct >= 0 ? C.green : C.red} pulse />
              <IntelTile label="REGIME" value={btc.market_regime.replace('_', ' ')} sub={`30d ${pct(btc.btc_30d_pct)}`} color={btc.btc_30d_pct >= 0 ? C.green : C.red} />
            </>
          )}
          {s && <IntelTile label="BIAS" value={s.macro_bias.replace('_', '-')} sub={`BTC.D ${g?.btc_dominance_pct}%`} color={biasColor(s.macro_bias)} />}
          {s && <IntelTile label="HIGH CONV" value={`${s.high_conviction_count}`} sub={`${strategies.length} total ideas`} color={C.orange} />}
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, flexShrink: 0, background: C.bgDeep }}>
        {([
          { id: 'strategies' as const, label: `STRATEGIES${s ? ` [${s.high_conviction_count}]` : ''}` },
          { id: 'whales' as const,     label: `WHALES${highCons.length ? ` [${highCons.length}]` : ''}` },
          { id: 'market' as const,     label: 'MARKET' },
          { id: 'macro' as const,      label: 'MACRO' },
        ]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '6px 12px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'monospace', fontSize: 7, letterSpacing: 2, color: tab === t.id ? C.orange : C.textDim, borderBottom: `2px solid ${tab === t.id ? C.orange : 'transparent'}` }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>

        {/* STRATEGIES */}
        {tab === 'strategies' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {strategies.length === 0
              ? <div style={{ color: C.textDim, fontFamily: 'monospace', fontSize: 9, textAlign: 'center', padding: '28px 0' }}>NO INTELLIGENCE DATA — DISPATCH HL-INTEL</div>
              : strategies.map((strat, i) => <StratCard key={`${strat.coin}-${strat.direction}`} s={strat} rank={i + 1} />)
            }
          </div>
        )}

        {/* WHALES */}
        {tab === 'whales' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {highCons.length > 0 && (
              <div>
                <div style={{ fontFamily: 'monospace', fontSize: 7, color: C.orange, letterSpacing: 3, marginBottom: 8 }}>CONSENSUS POSITIONS</div>
                <div style={{ background: C.bgPanel, border: `1px solid ${C.border}`, padding: '0 12px' }}>
                  {highCons.map(([coin, c]) => <ConsensusRow key={coin} coin={coin} c={c} />)}
                </div>
              </div>
            )}
            {data.leaderboard.top_traders.length > 0 && (
              <div>
                <div style={{ fontFamily: 'monospace', fontSize: 7, color: C.orange, letterSpacing: 3, marginBottom: 8 }}>WHALE LEADERBOARD</div>
                <div style={{ background: C.bgPanel, border: `1px solid ${C.border}` }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 12, padding: '5px 12px', borderBottom: `1px solid ${C.border}` }}>
                    {['TRADER', 'ALL-TIME', '30D', 'WR'].map(h => (
                      <div key={h} style={{ fontFamily: 'monospace', fontSize: 6, color: C.textMuted, letterSpacing: 2 }}>{h}</div>
                    ))}
                  </div>
                  {data.leaderboard.top_traders.slice(0, 12).map((t, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 12, padding: '5px 12px', borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 8, color: C.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.display}</span>
                      <span style={{ fontFamily: 'monospace', fontSize: 8, color: C.green }}>${(t.all_time.pnl / 1e6).toFixed(1)}M</span>
                      <span style={{ fontFamily: 'monospace', fontSize: 8, color: t.month.pnl >= 0 ? C.green : C.red }}>{t.month.pnl >= 0 ? '+' : ''}${(t.month.pnl / 1e3).toFixed(0)}k</span>
                      <span style={{ fontFamily: 'monospace', fontSize: 8, color: C.textDim }}>{t.trade_stats?.win_rate != null ? `${t.trade_stats.win_rate.toFixed(0)}%` : '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* MARKET */}
        {tab === 'market' && scan && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {scan.extreme_funding.length > 0 && (
              <div>
                <div style={{ fontFamily: 'monospace', fontSize: 7, color: C.orange, letterSpacing: 3, marginBottom: 8 }}>EXTREME FUNDING RATES</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                  {scan.extreme_funding.map(r => {
                    const isPos = r.funding_apr_pct > 0
                    const col = isPos ? C.red : C.green
                    return (
                      <div key={r.coin} style={{ background: C.bgPanel, border: `1px solid ${C.border}`, borderLeft: `2px solid ${col}`, padding: '8px 10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700, color: C.textBright, fontSize: 10 }}>{r.coin}</span>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 11, color: col }}>{r.funding_apr_pct > 0 ? '+' : ''}{r.funding_apr_pct.toFixed(0)}%</span>
                        </div>
                        <div style={{ fontFamily: 'monospace', fontSize: 7, color: C.textDim, marginTop: 3 }}>
                          {isPos ? 'LONGS PAY' : 'SHORTS PAY'} · {fmtM(r.oi_usd_m)} OI
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            {scan.top_movers_24h.length > 0 && (
              <div>
                <div style={{ fontFamily: 'monospace', fontSize: 7, color: C.orange, letterSpacing: 3, marginBottom: 8 }}>TOP MOVERS 24H</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
                  {scan.top_movers_24h.map(r => (
                    <div key={r.coin} style={{ background: C.bgPanel, border: `1px solid ${C.border}`, padding: '7px', textAlign: 'center' }}>
                      <div style={{ fontFamily: 'monospace', fontWeight: 700, color: C.textBright, fontSize: 10 }}>{r.coin}</div>
                      <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: r.change_24h_pct >= 0 ? C.green : C.red, marginTop: 3 }}>{pct(r.change_24h_pct)}</div>
                      <div style={{ fontFamily: 'monospace', fontSize: 7, color: C.textDim, marginTop: 2 }}>{fmtPrice(r.mark_px)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {scan.volume_spikes.length > 0 && (
              <div>
                <div style={{ fontFamily: 'monospace', fontSize: 7, color: C.orange, letterSpacing: 3, marginBottom: 8 }}>VOLUME SPIKES</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                  {scan.volume_spikes.map(r => (
                    <div key={r.coin} style={{ background: C.bgPanel, border: `1px solid ${C.border}`, borderLeft: `2px solid ${C.orange}`, padding: '8px 10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: C.textBright, fontSize: 10 }}>{r.coin}</span>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 10, color: C.orange }}>{r.vol_oi_ratio.toFixed(1)}× OI</span>
                      </div>
                      <div style={{ fontFamily: 'monospace', fontSize: 7, color: C.textDim, marginTop: 3 }}>{fmtM(r.volume_24h_m)} vol · {pct(r.change_24h_pct)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* MACRO */}
        {tab === 'macro' && macro && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ background: C.bgPanel, border: `1px solid ${C.border}`, padding: 12 }}>
              <div style={{ fontFamily: 'monospace', fontSize: 7, color: C.orange, letterSpacing: 3, marginBottom: 10 }}>BTC INTELLIGENCE</div>
              {btc && ([
                ['PRICE', `$${btc.btc_price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, C.textBright],
                ['24H',   pct(btc.btc_24h_pct), btc.btc_24h_pct >= 0 ? C.green : C.red],
                ['7D',    pct(btc.btc_7d_pct),  btc.btc_7d_pct >= 0  ? C.green : C.red],
                ['30D',   pct(btc.btc_30d_pct), btc.btc_30d_pct >= 0 ? C.green : C.red],
                ['ETH/BTC', btc.eth_btc_ratio.toFixed(5), C.text],
                ['REGIME',  btc.market_regime.replace('_', ' '), C.orange],
                ['ALT SEASON', btc.alt_season ? 'YES' : 'NO', btc.alt_season ? C.green : C.textDim],
              ] as const).map(([label, value, color]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 7, color: C.textDim, letterSpacing: 2 }}>{label}</span>
                  <span style={{ fontFamily: 'monospace', fontSize: 9, fontWeight: 600, color }}>{value}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {fg && (
                <div style={{ background: C.bgPanel, border: `1px solid ${C.border}`, padding: 12, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ fontFamily: 'monospace', fontSize: 7, color: C.orange, letterSpacing: 3, marginBottom: 6 }}>FEAR / GREED INDEX</div>
                  <FearGreedArc value={fg.value} classification={fg.classification} />
                  <div style={{ fontFamily: 'monospace', fontSize: 8, color: C.textDim, marginTop: 3 }}>{fg.signal}</div>
                </div>
              )}
              {g && (
                <div style={{ background: C.bgPanel, border: `1px solid ${C.border}`, padding: 12 }}>
                  <div style={{ fontFamily: 'monospace', fontSize: 7, color: C.orange, letterSpacing: 3, marginBottom: 8 }}>GLOBAL MARKET</div>
                  {([
                    ['MKT CAP',    `$${(g.total_market_cap_usd / 1e12).toFixed(2)}T`, C.textBright],
                    ['24H CHANGE', pct(g.market_cap_change_24h), g.market_cap_change_24h >= 0 ? C.green : C.red],
                    ['BTC.D',      `${g.btc_dominance_pct}%`, C.text],
                  ] as const).map(([label, value, color]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 7, color: C.textDim }}>{label}</span>
                      <span style={{ fontFamily: 'monospace', fontSize: 9, color, fontWeight: 600 }}>{value}</span>
                    </div>
                  ))}
                  <div style={{ fontFamily: 'monospace', fontSize: 7, color: C.textDim, marginTop: 6, lineHeight: 1.6 }}>{macro.derived.bias_note}</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── WORKFLOW PANEL ──────────────────────────────────────────────────────────

interface WfTemplate { id: string; name: string; description?: string; nodeCount: number; nodes: Array<{ id: string; skill: string; dependsOn: string[] }> }
interface WfRunNode { id: string; nodeId: string; skill: string; status: string; attempt: number; error?: string }
interface WfRun { id: string; workflowId: string; name: string; status: string; createdAt: string; nodes: WfRunNode[]; scratchboard: Record<string, unknown>; progress?: { total: number; completed: number; failed: number; running: number; pending: number; percent: number } }

function WorkflowPanel() {
  const [templates, setTemplates] = useState<WfTemplate[]>([])
  const [runs, setRuns] = useState<WfRun[]>([])
  const [selected, setSelected] = useState<WfTemplate | null>(null)
  const [activeRun, setActiveRun] = useState<WfRun | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const res = await apiFetch('/api/workflows')
      const data = await res.json()
      setTemplates(data.templates || [])
      setRuns(data.runs || [])
    } catch { /* silent */ }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const startWorkflow = async (id: string) => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/workflows', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workflowId: id }) })
      const data = await res.json()
      if (data.runId) {
        await fetchData()
        const runRes = await apiFetch(`/api/workflows/${data.runId}`)
        setActiveRun(await runRes.json())
      }
    } catch { /* silent */ }
    setLoading(false)
  }

  const refreshRun = async (runId: string) => {
    try {
      const res = await apiFetch(`/api/workflows/${runId}`)
      setActiveRun(await res.json())
    } catch { /* silent */ }
  }

  const cancelRun = async (runId: string) => {
    try {
      await apiFetch(`/api/workflows/${runId}`, { method: 'DELETE' })
      setActiveRun(null)
      await fetchData()
    } catch { /* silent */ }
  }

  // Status colors
  const sc = (s: string) => s === 'completed' ? C.green : s === 'running' ? C.orange : s === 'failed' ? C.red : s === 'pending' ? C.textDim : C.amber

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {/* LEFT: Templates & runs */}
      <div style={{ width: 280, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <PanelLabel text="WORKFLOW TEMPLATES" sub={`${templates.length} PIPELINES`} color={C.cyan} />
        <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {templates.map(t => (
            <div key={t.id}
              onClick={() => setSelected(selected?.id === t.id ? null : t)}
              style={{ padding: '8px 10px', background: selected?.id === t.id ? `${C.cyan}12` : `${C.border}18`, border: `1px solid ${selected?.id === t.id ? `${C.cyan}50` : C.border}`, cursor: 'pointer', position: 'relative' }}
            >
              <Brackets size={4} color={C.cyan} />
              <div style={{ fontFamily: 'monospace', fontSize: 9, color: C.textBright, letterSpacing: 1, fontWeight: 700 }}>{t.name}</div>
              <div style={{ fontFamily: 'monospace', fontSize: 7, color: C.textDim, marginTop: 2 }}>{t.nodeCount} NODES · {t.id.toUpperCase()}</div>
              {t.description && <div style={{ fontFamily: 'monospace', fontSize: 7, color: C.text, marginTop: 3, lineHeight: 1.4 }}>{t.description}</div>}
            </div>
          ))}

          {/* Runs list */}
          {runs.length > 0 && (
            <>
              <div style={{ fontFamily: 'monospace', fontSize: 7, letterSpacing: 2, color: C.textDim, marginTop: 8, paddingLeft: 4 }}>RECENT RUNS</div>
              {runs.slice(0, 10).map(r => (
                <div key={r.id}
                  onClick={() => refreshRun(r.id)}
                  style={{ padding: '6px 10px', background: activeRun?.id === r.id ? `${sc(r.status)}12` : 'transparent', border: `1px solid ${activeRun?.id === r.id ? `${sc(r.status)}40` : C.border}`, cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: sc(r.status), boxShadow: `0 0 4px ${sc(r.status)}` }} />
                    <span style={{ fontFamily: 'monospace', fontSize: 8, color: C.textBright }}>{r.name}</span>
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: 6, color: C.textDim, marginTop: 2, paddingLeft: 11 }}>
                    {r.status.toUpperCase()} · {new Date(r.createdAt).toLocaleTimeString()}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Launch button */}
        {selected && (
          <div style={{ borderTop: `1px solid ${C.border}`, padding: 8 }}>
            <button
              onClick={() => startWorkflow(selected.id)}
              disabled={loading}
              style={{ width: '100%', padding: '6px 12px', background: loading ? 'transparent' : `${C.cyan}20`, border: `1px solid ${loading ? C.border : C.cyan}`, color: loading ? C.textDim : C.cyan, fontFamily: 'monospace', fontSize: 8, letterSpacing: 2, cursor: loading ? 'not-allowed' : 'pointer' }}
            >
              {loading ? 'DISPATCHING...' : `▶ LAUNCH ${selected.id.toUpperCase()}`}
            </button>
          </div>
        )}
      </div>

      {/* RIGHT: DAG visualization & run detail */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {activeRun ? (
          <>
            {/* Run header */}
            <div style={{ padding: '8px 14px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: sc(activeRun.status), boxShadow: `0 0 6px ${sc(activeRun.status)}`, animation: activeRun.status === 'running' ? 'nge-pulse 1s infinite' : 'none' }} />
              <span style={{ fontFamily: 'monospace', fontSize: 9, color: C.textBright, letterSpacing: 1, fontWeight: 700 }}>{activeRun.name}</span>
              <span style={{ fontFamily: 'monospace', fontSize: 7, color: sc(activeRun.status), letterSpacing: 2 }}>{activeRun.status.toUpperCase()}</span>
              {activeRun.progress && (
                <span style={{ fontFamily: 'monospace', fontSize: 7, color: C.textDim }}>{activeRun.progress.percent}% ({activeRun.progress.completed}/{activeRun.progress.total})</span>
              )}
              <span style={{ flex: 1 }} />
              {activeRun.status === 'running' && (
                <button onClick={() => cancelRun(activeRun.id)} style={{ padding: '2px 8px', background: `${C.red}20`, border: `1px solid ${C.red}50`, color: C.red, fontFamily: 'monospace', fontSize: 7, letterSpacing: 1, cursor: 'pointer' }}>ABORT</button>
              )}
              <button onClick={() => refreshRun(activeRun.id)} style={{ padding: '2px 8px', background: 'transparent', border: `1px solid ${C.border}`, color: C.textDim, fontFamily: 'monospace', fontSize: 7, letterSpacing: 1, cursor: 'pointer' }}>↻</button>
              <button onClick={() => setActiveRun(null)} style={{ padding: '2px 8px', background: 'transparent', border: `1px solid ${C.border}`, color: C.textDim, fontFamily: 'monospace', fontSize: 7, cursor: 'pointer' }}>✕</button>
            </div>

            {/* Node list as DAG */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {activeRun.nodes.map(node => (
                  <div key={node.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: `${sc(node.status)}08`, border: `1px solid ${sc(node.status)}30`, position: 'relative' }}>
                    <Brackets size={4} color={sc(node.status)} />
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: sc(node.status), boxShadow: `0 0 5px ${sc(node.status)}`, flexShrink: 0, animation: node.status === 'running' ? 'nge-pulse 0.8s infinite' : 'none' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: 'monospace', fontSize: 9, color: C.textBright, letterSpacing: 1 }}>{node.skill.toUpperCase()}</div>
                      <div style={{ fontFamily: 'monospace', fontSize: 7, color: C.textDim, marginTop: 1 }}>
                        {node.nodeId} · attempt {node.attempt} · {node.status.toUpperCase()}
                      </div>
                      {node.error && <div style={{ fontFamily: 'monospace', fontSize: 7, color: C.red, marginTop: 2 }}>ERR: {node.error}</div>}
                    </div>
                    <span style={{ fontFamily: 'monospace', fontSize: 7, color: sc(node.status), letterSpacing: 2 }}>{node.status === 'completed' ? '✓' : node.status === 'failed' ? '✗' : node.status === 'running' ? '▶' : '○'}</span>
                  </div>
                ))}
              </div>

              {/* Scratchboard preview */}
              {activeRun.scratchboard && Object.keys(activeRun.scratchboard).filter(k => !k.startsWith('_')).length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontFamily: 'monospace', fontSize: 7, letterSpacing: 2, color: C.cyan, marginBottom: 6 }}>SCRATCHBOARD</div>
                  <div style={{ padding: '8px 12px', background: `${C.cyan}08`, border: `1px solid ${C.cyan}30`, fontFamily: 'monospace', fontSize: 8, color: C.text, whiteSpace: 'pre-wrap', lineHeight: 1.6, maxHeight: 200, overflowY: 'auto' }}>
                    {Object.entries(activeRun.scratchboard).filter(([k]) => !k.startsWith('_')).map(([k, v]) => (
                      <div key={k}><span style={{ color: C.cyan }}>{k}:</span> {typeof v === 'object' ? JSON.stringify(v) : String(v)}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : selected ? (
          /* Template preview — DAG visualization */
          <div style={{ flex: 1, padding: 20, overflowY: 'auto' }}>
            <div style={{ fontFamily: 'monospace', fontSize: 10, color: C.textBright, letterSpacing: 2, marginBottom: 4 }}>{selected.name.toUpperCase()}</div>
            <div style={{ fontFamily: 'monospace', fontSize: 8, color: C.textDim, marginBottom: 16 }}>{selected.description}</div>

            {/* Simple DAG layout */}
            <div style={{ fontFamily: 'monospace', fontSize: 7, letterSpacing: 2, color: C.cyan, marginBottom: 8 }}>EXECUTION GRAPH</div>
            {(() => {
              // Group nodes into waves by dependency depth
              const depth: Record<string, number> = {}
              const getDepth = (id: string): number => {
                if (depth[id] !== undefined) return depth[id]
                const node = selected.nodes.find(n => n.id === id)
                if (!node || node.dependsOn.length === 0) { depth[id] = 0; return 0 }
                depth[id] = 1 + Math.max(...node.dependsOn.map(getDepth))
                return depth[id]
              }
              selected.nodes.forEach(n => getDepth(n.id))
              const maxD = Math.max(...Object.values(depth), 0)
              const waves: typeof selected.nodes[] = Array.from({ length: maxD + 1 }, () => [])
              selected.nodes.forEach(n => waves[depth[n.id]].push(n))

              return waves.map((wave, wi) => (
                <div key={wi}>
                  <div style={{ fontFamily: 'monospace', fontSize: 6, color: C.textDim, letterSpacing: 2, marginBottom: 4 }}>WAVE {wi} {wi === 0 ? '(PARALLEL)' : ''}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                    {wave.map(n => {
                      const group = Object.entries({
                        HYPERLIQUID: ['hl-intel','hl-scan','hl-monitor','hl-alpha','hl-report','hl-trade'],
                        INTEL: ['morning-brief','rss-digest','hacker-news-digest','paper-digest','tweet-digest'],
                        OPERATIONS: ['issue-triage','pr-review','github-monitor'],
                        FINANCIAL: ['token-alert','wallet-digest','on-chain-monitor','defi-monitor'],
                        META: ['goal-tracker','skill-health','self-review','reflect','memory-flush','weekly-review','heartbeat'],
                      }).find(([, skills]) => skills.includes(n.skill))?.[0] || 'CREATIVE'
                      const gc: Record<string, string> = { HYPERLIQUID: C.red, INTEL: C.blue, OPERATIONS: C.orange, FINANCIAL: C.amber, CREATIVE: C.purple, META: '#ff2244' }
                      const color = gc[group] || C.cyan
                      return (
                        <div key={n.id} style={{ padding: '6px 10px', background: `${color}10`, border: `1px solid ${color}40`, position: 'relative', minWidth: 100 }}>
                          <Brackets size={3} color={color} />
                          <div style={{ fontFamily: 'monospace', fontSize: 8, color: C.textBright, letterSpacing: 1 }}>{n.skill.toUpperCase()}</div>
                          <div style={{ fontFamily: 'monospace', fontSize: 6, color: C.textDim, marginTop: 1 }}>
                            {n.dependsOn.length > 0 ? `← ${n.dependsOn.join(', ')}` : 'ROOT'}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {wi < maxD && (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '2px 0 6px', color: C.textDim, fontSize: 10 }}>│</div>
                  )}
                </div>
              ))
            })()}
          </div>
        ) : (
          /* Empty state */
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontFamily: 'monospace', fontSize: 10, color: C.textDim, letterSpacing: 3 }}>SELECT A WORKFLOW</div>
            <div style={{ fontFamily: 'monospace', fontSize: 7, color: C.textMuted, letterSpacing: 1 }}>CHOOSE A TEMPLATE OR VIEW A RECENT RUN</div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

type CenterMode = 'terminal' | 'intel' | 'workflows'

export default function NervPage() {
  const [skills, setSkills]             = useState<Skill[]>([])
  const [runs, setRuns]                 = useState<Run[]>([])
  const [activeSkill, setActiveSkill]   = useState<string | null>(null)
  const [collapsed, setCollapsed]       = useState<Set<string>>(new Set())
  const [centerMode, setCenterMode]     = useState<CenterMode>('terminal')
  const [localMessages, setLocalMessages] = useState<Message[]>([{
    id: uid(), role: 'system', ts: Date.now(),
    text: 'NERV_02 COMMAND INTERFACE ONLINE\nMAGI SYSTEMS: ALL NOMINAL\nAWAITING ORDERS, COMMANDER.',
  }])
  const [aiMessages, setAiMessages] = useState<{ id: string; role: string; content: string; streaming?: boolean }[]>([])
  const [input, setInput]   = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const chatHistoryRef = useRef<{ role: 'user' | 'assistant'; content: string }[]>([])
  const chatRef   = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)
  const [voiceActive, setVoiceActive]   = useState(false)
  const [voiceSpeaking, setVoiceSpeaking] = useState(false)
  const [ttsEnabled, setTtsEnabled]     = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef  = useRef<any>(null)
  const isHoldingRef    = useRef(false)
  const prevLoadingRef  = useRef(false)


  const append = useCallback(async (userContent: string) => {
    const history = chatHistoryRef.current
    history.push({ role: 'user', content: userContent })
    const msgId = uid()
    setAiMessages(prev => [...prev, { id: uid(), role: 'user', content: userContent }, { id: msgId, role: 'assistant', content: '', streaming: true }])
    setIsLoading(true)
    try {
      const res = await apiFetch('/api/nerv', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history }) })
      if (!res.ok || !res.body) throw new Error(`API ${res.status}`)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let acc = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        acc += decoder.decode(value)
        setAiMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: acc } : m))
      }
      history.push({ role: 'assistant', content: acc })
      setAiMessages(prev => prev.map(m => m.id === msgId ? { ...m, streaming: false } : m))
      const match = acc.match(/DISPATCH:\{"skill":"([^"]+)"\}/)
      if (match) setTimeout(() => runSkill(match[1]), 100)
    } catch (err) {
      setAiMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: `ERROR: ${err instanceof Error ? err.message : 'Stream failed'}`, streaming: false } : m))
    } finally {
      setIsLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchSkills = useCallback(async () => {
    try { const r = await apiFetch('/api/skills'); const d = await r.json(); if (d.skills) setSkills(d.skills) } catch { /* silent */ }
  }, [])

  const fetchRuns = useCallback(async () => {
    try { const r = await apiFetch('/api/runs'); const d = await r.json(); if (d.runs) setRuns(d.runs) } catch { /* silent */ }
  }, [])

  useEffect(() => {
    fetchSkills()
    fetchRuns()
    const i = setInterval(fetchRuns, 8000)
    return () => clearInterval(i)
  }, [fetchSkills, fetchRuns])

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [localMessages, aiMessages])

  useEffect(() => {
    if (prevLoadingRef.current && !isLoading && ttsEnabled) {
      const last = aiMessages[aiMessages.length - 1]
      if (last?.role === 'assistant') {
        const clean = last.content.replace(/DISPATCH:\{"skill":"[^"]+"\}/g, '').trim()
        if (clean) {
          window.speechSynthesis.cancel()
          const utt = new SpeechSynthesisUtterance(clean)
          utt.rate = 0.92
          utt.pitch = 0.85
          const david = window.speechSynthesis.getVoices().find(v => v.name.includes('David'))
          if (david) utt.voice = david
          utt.onend = () => setVoiceSpeaking(false)
          setVoiceSpeaking(true)
          window.speechSynthesis.speak(utt)
        }
      }
    }
    prevLoadingRef.current = isLoading
  }, [isLoading, aiMessages, ttsEnabled])

  const addMsg = useCallback((msg: Omit<Message, 'id' | 'ts'>) => {
    setLocalMessages(prev => [...prev, { ...msg, id: uid(), ts: Date.now() }])
  }, [])

  const runSkill = useCallback(async (skillName: string, userText?: string) => {
    setActiveSkill(skillName)
    if (userText) addMsg({ role: 'user', text: userText })
    addMsg({ role: 'system', skill: skillName, text: `DISPATCHING AGENT: ${skillName.toUpperCase()}\nINITIATING GITHUB ACTIONS WORKFLOW...` })
    try {
      const r = await fetch(`/api/skills/${skillName}/run`, { method: 'POST' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      addMsg({ role: 'agent', skill: skillName, text: `UNIT ${skillName.toUpperCase()} DEPLOYED.\nMonitor mission status in the RUNS panel →\nResults delivered via Telegram (@nerv2bot).` })
      setTimeout(fetchRuns, 3000)
      setTimeout(fetchRuns, 10000)
    } catch (err: unknown) {
      addMsg({ role: 'system', text: `ERROR: ${err instanceof Error ? err.message : 'DISPATCH FAILED'}` })
    } finally {
      setActiveSkill(null)
    }
  }, [addMsg, fetchRuns])

  const executeCommand = useCallback(async (cmd: string) => {
    if (!cmd || isLoading) return
    if (cmd.toLowerCase() === 'list') {
      addMsg({ role: 'user', text: 'list' })
      addMsg({ role: 'system', text: `ACTIVE AGENTS (${skills.filter(s => s.enabled).length}/${skills.length}):\n\n${skills.map(s => `  ${s.enabled ? '●' : '○'} ${s.name}`).join('\n')}` })
      return
    }
    if (cmd.toLowerCase() === 'status') {
      addMsg({ role: 'user', text: 'status' })
      await fetchRuns()
      addMsg({ role: 'system', text: `RECENT MISSIONS:\n\n${runs.slice(0, 5).map(r => `  ${runStatusLabel(r.status, r.conclusion).padEnd(10)} ${r.workflow} (${timeAgo(r.created_at)})`).join('\n') || '  No recent runs.'}` })
      return
    }
    if (cmd.toLowerCase() === 'clear') {
      setLocalMessages([{ id: uid(), role: 'system', text: 'TERMINAL CLEARED.', ts: Date.now() }])
      setAiMessages([])
      return
    }
    if (cmd.toLowerCase() === 'intel') {
      setCenterMode('intel')
      addMsg({ role: 'user', text: 'intel' })
      addMsg({ role: 'system', text: 'SWITCHING TO HL INTELLIGENCE PANEL...' })
      return
    }
    append(cmd)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, skills, runs, addMsg, fetchRuns, append])

  const handleSend = useCallback(async () => {
    const cmd = input.trim()
    if (!cmd) return
    setInput('')
    await executeCommand(cmd)
  }, [input, executeCommand])

  const handleVoiceStart = useCallback(async () => {
    if (isHoldingRef.current) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!SR) {
      addMsg({ role: 'system', text: 'VOICE: Not supported in this browser. Use Chrome.' })
      return
    }
    // Explicitly request mic — forces Chrome to re-evaluate permission
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(t => t.stop())
    } catch {
      addMsg({ role: 'system', text: 'VOICE: Mic access denied. Go to chrome://settings/content/microphone and allow localhost:5555, then reload.' })
      return
    }
    isHoldingRef.current = true
    const rec = new SR()
    rec.continuous = true
    rec.interimResults = false
    rec.lang = 'en-US'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const results = Array.from(e.results as SpeechRecognitionResultList)
      const text = results.map((r: SpeechRecognitionResult) => r[0].transcript).join(' ').trim()
      if (text) {
        recognitionRef.current?.stop()
        isHoldingRef.current = false
        setVoiceActive(false)
        executeCommand(text)
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      isHoldingRef.current = false
      setVoiceActive(false)
      if (e.error === 'not-allowed') addMsg({ role: 'system', text: 'VOICE: Mic blocked. Allow microphone in browser settings and reload.' })
      else if (e.error === 'no-speech') addMsg({ role: 'system', text: 'VOICE: No speech detected. Try again.' })
    }
    rec.onend = () => { if (!isHoldingRef.current) setVoiceActive(false) }
    recognitionRef.current = rec
    rec.start()
    setVoiceActive(true)
  }, [addMsg, executeCommand])

  const handleVoiceStop = useCallback(() => {
    if (!isHoldingRef.current) return
    isHoldingRef.current = false
    recognitionRef.current?.stop()
    setVoiceActive(false)
  }, [])

  const toggleGroup = (g: string) => {
    setCollapsed(prev => { const next = new Set(prev); next.has(g) ? next.delete(g) : next.add(g); return next })
  }

  const hasActive = runs.some(r => r.status === 'in_progress')

  return (
    <div style={{ width: '100vw', height: '100vh', background: C.bg, display: 'flex', flexDirection: 'column', fontFamily: 'monospace', overflow: 'hidden', position: 'relative' }}>

      {/* ── Background layers ── */}

      {/* Hex grid */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.018, pointerEvents: 'none', zIndex: 0 }}>
        <defs>
          <pattern id="hexgrid" x="0" y="0" width="60" height="52" patternUnits="userSpaceOnUse">
            <polygon points="30,2 56,16 56,44 30,58 4,44 4,16" fill="none" stroke={C.orange} strokeWidth="0.6" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#hexgrid)" />
      </svg>

      {/* Scanlines */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1, background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.05) 2px, rgba(0,0,0,0.05) 4px)' }} />

      {/* Data cascade */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1, overflow: 'hidden', opacity: 0.025 }}>
        {[12, 31, 52, 68, 84].map((left, i) => (
          <pre key={i} style={{ position: 'absolute', left: `${left}%`, top: 0, fontFamily: 'monospace', fontSize: 7, color: C.orange, lineHeight: 1.5, margin: 0, animation: `nge-cascade ${14 + i * 4}s linear infinite`, animationDelay: `-${i * 5}s` }}>
            {CASCADE_CONTENT}
          </pre>
        ))}
      </div>

      {/* Flicker */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2, animation: 'nge-flicker 9s infinite' }} />

      {/* Warning stripe top */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, zIndex: 20, background: `repeating-linear-gradient(90deg, ${C.orange} 0px, ${C.orange} 18px, transparent 18px, transparent 36px)`, animation: 'nge-stripe 2s linear infinite', opacity: hasActive ? 1 : 0.4 }} />

      {/* ── Top bar ── */}
      <div style={{ position: 'relative', zIndex: 10, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 16, padding: '0 20px', height: 46, background: C.bgPanel, borderBottom: `1px solid ${C.border}` }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 0, height: 0, borderLeft: '10px solid transparent', borderRight: '10px solid transparent', borderBottom: `17px solid ${C.orange}`, filter: `drop-shadow(0 0 8px ${C.orange}88)` }} />
          <span style={{ color: C.orange, fontSize: 14, letterSpacing: 7, fontWeight: 700, textShadow: `0 0 12px ${C.orange}55` }}>NERV_02</span>
        </div>

        <div style={{ width: 1, height: 18, background: C.border }} />

        {/* MAGI system indicators */}
        <div style={{ display: 'flex', gap: 14 }}>
          {[
            { name: 'BALTHASAR', color: C.blue },
            { name: 'CASPAR',    color: C.green },
            { name: 'MELCHIOR',  color: C.amber },
          ].map(m => (
            <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 4, height: 4, background: m.color, boxShadow: `0 0 4px ${m.color}`, animation: 'nge-pulse 2.5s infinite', animationDelay: m.name === 'CASPAR' ? '0.8s' : m.name === 'MELCHIOR' ? '1.6s' : '0s' }} />
              <span style={{ color: C.textDim, fontSize: 7, letterSpacing: 1 }}>{m.name}</span>
            </div>
          ))}
        </div>

        <span style={{ flex: 1 }} />

        {hasActive && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.orange, animation: 'nge-pulse 0.7s infinite', boxShadow: `0 0 10px ${C.orange}` }} />
            <span style={{ color: C.orange, fontSize: 7, letterSpacing: 3 }}>MISSION ACTIVE</span>
          </div>
        )}

        <span style={{ color: C.textDim, fontSize: 7, letterSpacing: 2 }}>
          AGENTS: <span style={{ color: C.green }}>{skills.filter(s => s.enabled).length}</span>
        </span>

        <Clock />

        <a href="/" style={{ color: C.textDim, fontSize: 8, letterSpacing: 2, textDecoration: 'none', border: `1px solid ${C.borderHi}`, padding: '4px 10px' }}>◀ DASH</a>
      </div>

      {/* ── 3-column layout ── */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '220px 1fr 260px', overflow: 'hidden', position: 'relative', zIndex: 5 }}>

        {/* LEFT: Agent roster */}
        <div style={{ borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.bgPanel }}>
          <PanelLabel text="AGENTS" sub={`${skills.length} UNITS`} />
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
            {Object.entries(SKILL_GROUPS).map(([group, groupSkills]) => {
              const color = GROUP_COLORS[group] || C.orange
              const isCollapsed = collapsed.has(group)
              const available = skills.filter(s => groupSkills.includes(s.name))
              if (available.length === 0) return null
              return (
                <div key={group}>
                  <button onClick={() => toggleGroup(group)} style={{ width: '100%', textAlign: 'left', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', cursor: 'pointer', color, fontSize: 7, letterSpacing: 3 }}>
                    <span>{isCollapsed ? '▶' : '▼'}</span>
                    <span>{group}</span>
                    <span style={{ marginLeft: 'auto', color: C.textDim, fontSize: 7 }}>{available.filter(s => s.enabled).length}/{available.length}</span>
                  </button>
                  {!isCollapsed && available.map(skill => {
                    const isActive = activeSkill === skill.name
                    const recentRun = runs.find(r => r.workflow.includes(skill.name))
                    return (
                      <button key={skill.name} onClick={() => !isLoading && runSkill(skill.name)} disabled={isLoading}
                        style={{ width: '100%', textAlign: 'left', padding: '5px 12px 5px 20px', display: 'flex', alignItems: 'center', gap: 8, background: isActive ? `${color}15` : 'transparent', border: 'none', borderLeft: `2px solid ${isActive ? color : 'transparent'}`, cursor: isLoading ? 'not-allowed' : 'pointer' }}
                        onMouseEnter={e => { if (!isLoading) (e.currentTarget as HTMLElement).style.background = `${color}0d` }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isActive ? `${color}15` : 'transparent' }}
                      >
                        <span style={{ width: 4, height: 4, borderRadius: '50%', flexShrink: 0, background: recentRun ? runStatusColor(recentRun.status, recentRun.conclusion, C) : skill.enabled ? `${color}88` : C.textDim, boxShadow: recentRun?.status === 'in_progress' ? `0 0 6px ${C.orange}` : 'none' }} />
                        <span style={{ color: isActive ? color : C.text, fontSize: 9, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{skill.name}</span>
                        {isActive && <span style={{ color, fontSize: 8, animation: 'nge-blink 0.8s infinite' }}>▶</span>}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
          <div style={{ borderTop: `1px solid ${C.border}`, padding: '8px 12px' }}>
            <button onClick={fetchSkills} style={{ width: '100%', padding: '4px 8px', background: 'transparent', border: `1px solid ${C.border}`, color: C.textDim, fontSize: 7, letterSpacing: 2, cursor: 'pointer' }}>↻ REFRESH</button>
          </div>
        </div>

        {/* CENTER */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Mode toggle tab bar */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, background: C.bgPanel, flexShrink: 0, alignItems: 'stretch' }}>
            {([
              { mode: 'terminal' as const, label: '◈ COMMAND', sub: 'MAGI INTERFACE' },
              { mode: 'intel' as const,    label: '◈ HL INTEL', sub: 'INTELLIGENCE' },
              { mode: 'workflows' as const, label: '◈ WORKFLOWS', sub: 'DAG PIPELINES' },
            ]).map(({ mode, label, sub }) => {
              const active = centerMode === mode
              return (
                <button key={mode} onClick={() => setCenterMode(mode)} style={{ padding: '0 18px', height: 38, background: active ? `${C.orange}0a` : 'transparent', border: 'none', borderBottom: `2px solid ${active ? C.orange : 'transparent'}`, borderRight: `1px solid ${C.border}`, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 1 }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 8, letterSpacing: 3, color: active ? C.orange : C.textDim, fontWeight: active ? 700 : 400 }}>{label}</span>
                  <span style={{ fontFamily: 'monospace', fontSize: 6, letterSpacing: 1, color: C.textMuted }}>{sub}</span>
                </button>
              )
            })}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 14 }}>
              <span style={{ fontFamily: 'monospace', fontSize: 6, color: C.textMuted, letterSpacing: 2 }}>
                {centerMode === 'terminal' ? 'TYPE · DISPATCH · MONITOR' : centerMode === 'intel' ? 'HYPERLIQUID MARKET INTELLIGENCE' : 'AGENTFLOW DAG ORCHESTRATION'}
              </span>
            </div>
          </div>

          {/* TERMINAL MODE */}
          {centerMode === 'terminal' && (
            <>
              <div ref={chatRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {localMessages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
                {aiMessages.map(msg => (
                  <MessageBubble key={msg.id} msg={{
                    id: msg.id,
                    role: msg.role === 'user' ? 'user' : 'claude',
                    text: msg.content.replace(/DISPATCH:\{"skill":"[^"]+"\}/g, '').trim(),
                    streaming: isLoading && msg === aiMessages[aiMessages.length - 1] && msg.role === 'assistant',
                    ts: Date.now(),
                  }} />
                ))}
              </div>
              <div style={{ borderTop: `1px solid ${C.border}`, padding: '10px 16px', display: 'flex', gap: 8, alignItems: 'center', background: C.bgPanel, flexShrink: 0 }}>
                <span style={{ color: C.orange, fontSize: 12, letterSpacing: 1 }}>❯</span>
                <input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSend()}
                  placeholder='talk to Claude or dispatch an agent... (try "intel" to open HL dashboard)'
                  disabled={isLoading}
                  style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: C.textBright, fontFamily: 'monospace', fontSize: 12, caretColor: C.orange }}
                  autoFocus
                />
                {/* TTS toggle */}
                <button
                  onClick={() => { window.speechSynthesis.cancel(); setVoiceSpeaking(false); setTtsEnabled(v => !v) }}
                  title={ttsEnabled ? 'Disable voice response' : 'Enable voice response'}
                  style={{ position: 'relative', background: 'transparent', border: `1px solid ${ttsEnabled ? C.blue : C.border}`, color: ttsEnabled ? C.blue : C.textDim, fontFamily: 'monospace', fontSize: 10, cursor: 'pointer', padding: '3px 8px', lineHeight: 1 }}
                >
                  {voiceSpeaking ? <span style={{ animation: 'nge-pulse 0.6s infinite' }}>◈</span> : '◈'}
                </button>
                {/* Mic button */}
                <button
                  onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); handleVoiceStart() }}
                  onPointerUp={e => { e.currentTarget.releasePointerCapture(e.pointerId); handleVoiceStop() }}
                  onPointerCancel={handleVoiceStop}
                  title={voiceActive ? 'Release to send' : 'Hold to speak'}
                  style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, flexShrink: 0, background: voiceActive ? `${C.red}30` : `${C.border}18`, border: `2px solid ${voiceActive ? C.red : C.textDim}`, borderRadius: '50%', color: voiceActive ? C.red : C.textBright, fontSize: 16, cursor: 'pointer', userSelect: 'none', touchAction: 'none', transition: 'border-color 0.1s, background 0.1s' }}
                >
                  {voiceActive ? <span style={{ animation: 'nge-pulse 0.4s infinite', fontSize: 14 }}>⏺</span> : '🎤'}
                </button>
                {aiMessages.length > 0 && (
                  <button onClick={() => { setAiMessages([]); chatHistoryRef.current = []; setLocalMessages([{ id: uid(), role: 'system', text: 'SESSION RESET.', ts: Date.now() }]) }}
                    style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.textDim, fontFamily: 'monospace', fontSize: 7, letterSpacing: 1, cursor: 'pointer', padding: '3px 8px' }}>↺</button>
                )}
                <button onClick={handleSend} disabled={isLoading || !input.trim()}
                  style={{ padding: '4px 14px', background: isLoading || !input.trim() ? 'transparent' : `${C.orange}20`, border: `1px solid ${isLoading || !input.trim() ? C.border : C.orange}`, color: isLoading || !input.trim() ? C.textDim : C.orange, fontFamily: 'monospace', fontSize: 8, letterSpacing: 2, cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer' }}>
                  EXECUTE
                </button>
              </div>
            </>
          )}

          {/* INTEL MODE */}
          {centerMode === 'intel' && <IntelPanel onDispatch={runSkill} />}

          {/* WORKFLOW MODE */}
          {centerMode === 'workflows' && <WorkflowPanel />}
        </div>

        {/* RIGHT: Mission status */}
        <div style={{ borderLeft: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.bgPanel }}>
          <PanelLabel text="MISSION STATUS" sub={`${runs.length} RUNS`} />
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {runs.length === 0
              ? <div style={{ padding: 16, color: C.textDim, fontSize: 9, textAlign: 'center' }}>NO RECENT MISSIONS</div>
              : runs.map(run => <RunCard key={run.id} run={run} />)
            }
          </div>
          <div style={{ borderTop: `1px solid ${C.border}`, padding: '8px 12px' }}>
            <button onClick={fetchRuns} style={{ width: '100%', padding: '4px 8px', background: 'transparent', border: `1px solid ${C.border}`, color: C.textDim, fontSize: 7, letterSpacing: 2, cursor: 'pointer' }}>↻ REFRESH</button>
          </div>
        </div>
      </div>

      {/* ── NGE Animations ── */}
      <style>{`
        @keyframes nge-pulse   { 0%,100%{opacity:1} 50%{opacity:0.2} }
        @keyframes nge-blink   { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes nge-fadein  { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
        @keyframes nge-cascade { 0%{transform:translateY(-160px)} 100%{transform:translateY(100vh)} }
        @keyframes nge-stripe  { 0%{background-position:0 0} 100%{background-position:36px 0} }
        @keyframes nge-flicker { 0%,86%,88%,93%,100%{opacity:1} 87%{opacity:0.88} 89%{opacity:0.94} 91%{opacity:0.86} 92%{opacity:1} }
        @keyframes nge-bar     { 0%,100%{transform:scaleY(0.4);opacity:0.4} 50%{transform:scaleY(1);opacity:1} }
        @keyframes nge-ring    { 0%{transform:scale(0.8);opacity:0.8} 100%{transform:scale(2.5);opacity:0} }
        *::-webkit-scrollbar { width: 3px }
        *::-webkit-scrollbar-track { background: transparent }
        *::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px }
        input::placeholder { color: ${C.textDim}; font-size: 10px }
      `}</style>
    </div>
  )
}
