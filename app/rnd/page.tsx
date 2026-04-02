'use client'
import { apiFetch } from '@/lib/client-auth'
import { C, MODELS } from '@/lib/theme'
import { timeAgo } from '@/lib/utils'

import { useState, useEffect, useCallback } from 'react'

interface Memo {
  filename: string
  date: string
  focus: string
  excerpt: string
  body: string
  mtime: number
}

// ─── MARKDOWN RENDERER ───────────────────────────────────────────────────────

function renderMarkdown(md: string) {
  const lines = md.split('\n')
  const elements: React.ReactNode[] = []
  let i = 0
  let key = 0

  const inlineParse = (text: string): React.ReactNode => {
    const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g)
    return parts.map((p, pi) => {
      if (p.startsWith('**') && p.endsWith('**'))
        return <strong key={pi} style={{ color: C.textBright }}>{p.slice(2, -2)}</strong>
      if (p.startsWith('*') && p.endsWith('*'))
        return <em key={pi} style={{ color: C.amber }}>{p.slice(1, -1)}</em>
      if (p.startsWith('`') && p.endsWith('`'))
        return <code key={pi} style={{ color: C.cyan, background: '#0a1a1e', padding: '1px 5px', borderRadius: 3, fontSize: 11 }}>{p.slice(1, -1)}</code>
      return p
    })
  }

  while (i < lines.length) {
    const line = lines[i]

    // Skip details/summary tags
    if (line.trim().startsWith('<details') || line.trim().startsWith('<summary') ||
        line.trim() === '</details>' || line.trim() === '</summary>') { i++; continue }

    // HR
    if (/^---+$/.test(line.trim())) {
      elements.push(<hr key={key++} style={{ border: 'none', borderTop: `1px solid ${C.border}`, margin: '14px 0' }} />)
      i++; continue
    }

    // H1
    if (line.startsWith('# ')) {
      elements.push(
        <div key={key++} style={{ color: C.cyan, fontFamily: 'monospace', fontSize: 15, fontWeight: 700, letterSpacing: 1, marginTop: 20, marginBottom: 8 }}>
          {line.slice(2)}
        </div>
      )
      i++; continue
    }

    // H2
    if (line.startsWith('## ')) {
      elements.push(
        <div key={key++} style={{ color: C.textBright, fontFamily: 'monospace', fontSize: 12, fontWeight: 700, letterSpacing: 2, marginTop: 18, marginBottom: 6, textTransform: 'uppercase', borderBottom: `1px solid ${C.border}`, paddingBottom: 4 }}>
          {line.slice(3)}
        </div>
      )
      i++; continue
    }

    // H3
    if (line.startsWith('### ')) {
      elements.push(
        <div key={key++} style={{ color: C.amber, fontFamily: 'monospace', fontSize: 11, fontWeight: 700, letterSpacing: 1, marginTop: 14, marginBottom: 4 }}>
          ▸ {line.slice(4)}
        </div>
      )
      i++; continue
    }

    // Blockquote
    if (line.startsWith('> ')) {
      elements.push(
        <div key={key++} style={{ borderLeft: `2px solid ${C.cyanDim}`, paddingLeft: 10, color: C.textDim, fontSize: 11, fontStyle: 'italic', margin: '6px 0' }}>
          {inlineParse(line.slice(2))}
        </div>
      )
      i++; continue
    }

    // Checkbox
    if (line.match(/^- \[[ x]\] /)) {
      const checked = line[3] === 'x'
      elements.push(
        <div key={key++} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11, color: C.text, margin: '3px 0 3px 8px' }}>
          <span style={{ color: checked ? C.green : C.textDim, fontFamily: 'monospace', flexShrink: 0 }}>{checked ? '✓' : '○'}</span>
          <span>{inlineParse(line.slice(6))}</span>
        </div>
      )
      i++; continue
    }

    // Bullet
    if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <div key={key++} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11, color: C.text, margin: '2px 0 2px 8px' }}>
          <span style={{ color: C.cyan, flexShrink: 0, fontFamily: 'monospace' }}>·</span>
          <span>{inlineParse(line.slice(2))}</span>
        </div>
      )
      i++; continue
    }

    // Bold label lines like **Why:** or **Do this:**
    if (line.match(/^\*\*[^*]+:\*\*/)) {
      elements.push(
        <div key={key++} style={{ fontSize: 11, color: C.text, margin: '3px 0 1px 0', lineHeight: 1.6 }}>
          {inlineParse(line)}
        </div>
      )
      i++; continue
    }

    // Empty line
    if (line.trim() === '') {
      elements.push(<div key={key++} style={{ height: 6 }} />)
      i++; continue
    }

    // Numbered list
    if (/^\d+\. /.test(line)) {
      const num = line.match(/^(\d+)\. /)?.[1]
      elements.push(
        <div key={key++} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11, color: C.text, margin: '2px 0 2px 8px' }}>
          <span style={{ color: C.cyan, fontFamily: 'monospace', flexShrink: 0, minWidth: 16 }}>{num}.</span>
          <span>{inlineParse(line.replace(/^\d+\. /, ''))}</span>
        </div>
      )
      i++; continue
    }

    // Plain paragraph
    elements.push(
      <div key={key++} style={{ fontSize: 11, color: C.text, lineHeight: 1.7, margin: '1px 0' }}>
        {inlineParse(line)}
      </div>
    )
    i++
  }

  return elements
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function RndPage() {
  const [memos, setMemos] = useState<Memo[]>([])
  const [selected, setSelected] = useState<Memo | null>(null)
  const [loading, setLoading] = useState(true)
  const [dispatching, setDispatching] = useState(false)
  const [dispatchOk, setDispatchOk] = useState(false)
  const [showDispatch, setShowDispatch] = useState(false)
  const [focus, setFocus] = useState('')
  const [model, setModel] = useState('claude-sonnet-4-6')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await apiFetch('/api/rnd', { cache: 'no-store' })
      const d = await r.json()
      setMemos(d.memos || [])
      if (d.memos?.length && !selected) setSelected(d.memos[0])
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [selected])

  useEffect(() => { load() }, [load])

  const dispatch = async () => {
    setDispatching(true)
    setError('')
    try {
      const r = await apiFetch('/api/rnd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ focus, model }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Dispatch failed')
      setDispatchOk(true)
      setShowDispatch(false)
      setTimeout(() => setDispatchOk(false), 4000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setDispatching(false)
    }
  }

  // Next scheduled: Mon/Thu 09:00 IST
  const nextScheduled = () => {
    const now = new Date()
    const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
    const day = ist.getDay() // 0=Sun,1=Mon...4=Thu
    const h = ist.getHours(), m = ist.getMinutes()
    const targets = [1, 4] // Mon, Thu
    for (let offset = 0; offset <= 7; offset++) {
      const d = (day + offset) % 7
      if (targets.includes(d)) {
        if (offset === 0 && (h > 9 || (h === 9 && m > 0))) continue
        const label = offset === 0 ? 'today' : offset === 1 ? 'tomorrow' : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]
        return `${label} 09:00 IST`
      }
    }
    return 'Mon 09:00 IST'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: C.bg, color: C.text, fontFamily: 'monospace' }}>

      {/* ── TOP BAR ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 20px', borderBottom: `1px solid ${C.border}`, flexShrink: 0, background: C.bgPanel }}>
        <a href="/" style={{ textDecoration: 'none' }}>
          <span style={{ color: C.orange, fontWeight: 700, letterSpacing: 3, fontSize: 13 }}>NERV_02</span>
        </a>
        <span style={{ color: C.textDim }}>›</span>
        <span style={{ color: C.cyan, letterSpacing: 2, fontSize: 11 }}>R&D COUNCIL</span>

        <div style={{ flex: 1 }} />

        {/* Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, fontSize: 10, color: C.textDim }}>
          <span>NEXT RUN: <span style={{ color: C.text }}>{nextScheduled()}</span></span>
          <span>CADENCE: <span style={{ color: C.text }}>MON + THU</span></span>
          <span>MEMOS: <span style={{ color: C.cyan }}>{memos.length}</span></span>
        </div>

        {dispatchOk && (
          <span style={{ color: C.green, fontSize: 10, letterSpacing: 1 }}>✓ DISPATCHED</span>
        )}

        <button
          onClick={() => setShowDispatch(true)}
          style={{ background: `${C.cyan}18`, border: `1px solid ${C.cyan}66`, color: C.cyan, fontSize: 10, letterSpacing: 2, padding: '5px 14px', cursor: 'pointer', fontFamily: 'monospace' }}
        >
          ▶ CONVENE COUNCIL
        </button>

        <a href="/" style={{ color: C.textDim, fontSize: 10, textDecoration: 'none', letterSpacing: 1 }}>← BACK</a>
      </div>

      {/* ── DISPATCH MODAL ── */}
      {showDispatch && (
        <div style={{ position: 'fixed', inset: 0, background: '#00000088', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowDispatch(false)}>
          <div style={{ background: C.bgPanel, border: `1px solid ${C.cyan}44`, padding: 28, width: 420, maxWidth: '90vw' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ color: C.cyan, fontSize: 12, letterSpacing: 2, fontWeight: 700, marginBottom: 20 }}>◈ CONVENE R&D COUNCIL</div>

            <div style={{ fontSize: 10, color: C.textDim, marginBottom: 6 }}>FOCUS AREA (optional)</div>
            <input
              value={focus}
              onChange={e => setFocus(e.target.value)}
              placeholder="e.g. crypto, NERV dashboard, investments..."
              style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`, color: C.textBright, fontSize: 11, padding: '7px 10px', fontFamily: 'monospace', outline: 'none', marginBottom: 14, boxSizing: 'border-box' }}
            />

            <div style={{ fontSize: 10, color: C.textDim, marginBottom: 6 }}>MODEL</div>
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`, color: C.text, fontSize: 11, padding: '7px 10px', fontFamily: 'monospace', outline: 'none', marginBottom: 20 }}
            >
              {MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>

            {error && <div style={{ color: C.red, fontSize: 10, marginBottom: 12 }}>{error}</div>}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={dispatch}
                disabled={dispatching}
                style={{ flex: 1, background: dispatching ? C.cyanDim : `${C.cyan}22`, border: `1px solid ${C.cyan}`, color: C.cyan, fontSize: 11, letterSpacing: 1, padding: '8px 0', cursor: dispatching ? 'not-allowed' : 'pointer', fontFamily: 'monospace' }}
              >
                {dispatching ? 'DISPATCHING...' : '▶ DISPATCH'}
              </button>
              <button
                onClick={() => setShowDispatch(false)}
                style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.textDim, fontSize: 11, padding: '8px 16px', cursor: 'pointer', fontFamily: 'monospace' }}
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── BODY ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── LEFT: MEMO LIST ── */}
        <div style={{ width: 260, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', flexShrink: 0, background: C.bgPanel }}>
          <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: C.textDim, letterSpacing: 2 }}>COUNCIL MEMOS</span>
            <button onClick={load} style={{ background: 'none', border: 'none', color: C.textDim, fontSize: 9, cursor: 'pointer', letterSpacing: 1 }}>↻ REFRESH</button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading && (
              <div style={{ padding: 20, color: C.textDim, fontSize: 10, textAlign: 'center' }}>LOADING...</div>
            )}
            {!loading && memos.length === 0 && (
              <div style={{ padding: 20, color: C.textDim, fontSize: 10, textAlign: 'center', lineHeight: 1.8 }}>
                NO MEMOS YET<br />
                <span style={{ color: C.textDim }}>Council meets Mon + Thu</span><br />
                <button onClick={() => setShowDispatch(true)}
                  style={{ marginTop: 12, background: 'none', border: `1px solid ${C.cyan}44`, color: C.cyan, fontSize: 9, padding: '4px 10px', cursor: 'pointer', fontFamily: 'monospace', letterSpacing: 1 }}>
                  CONVENE NOW
                </button>
              </div>
            )}
            {memos.map(m => (
              <div
                key={m.filename}
                onClick={() => setSelected(m)}
                style={{
                  padding: '12px 14px',
                  borderBottom: `1px solid ${C.border}`,
                  cursor: 'pointer',
                  background: selected?.filename === m.filename ? `${C.cyan}0a` : 'transparent',
                  borderLeft: selected?.filename === m.filename ? `2px solid ${C.cyan}` : '2px solid transparent',
                  transition: 'background 0.1s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                  <span style={{ color: selected?.filename === m.filename ? C.cyan : C.textBright, fontSize: 11, fontWeight: 700 }}>{m.date}</span>
                  <span style={{ color: C.textDim, fontSize: 9 }}>{timeAgo(m.mtime)}</span>
                </div>
                <div style={{ color: C.amber, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                  {m.focus !== 'All domains' ? `◈ ${m.focus}` : '◈ ALL DOMAINS'}
                </div>
                <div style={{ color: C.textDim, fontSize: 10, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                  {m.excerpt}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── RIGHT: MEMO VIEWER ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!selected ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
              <div style={{ color: C.cyan, fontSize: 32, opacity: 0.15 }}>◈</div>
              <div style={{ color: C.textDim, fontSize: 11, letterSpacing: 2 }}>SELECT A MEMO</div>
            </div>
          ) : (
            <>
              {/* Memo header */}
              <div style={{ padding: '12px 24px', borderBottom: `1px solid ${C.border}`, background: C.bgPanel, flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <span style={{ color: C.cyan, fontSize: 13, fontWeight: 700 }}>R&D COUNCIL MEMO — {selected.date}</span>
                  <span style={{ color: C.amber, fontSize: 10 }}>◈ {selected.focus}</span>
                  <div style={{ flex: 1 }} />
                  <span style={{ color: C.textDim, fontSize: 9 }}>{timeAgo(selected.mtime)}</span>
                </div>
              </div>

              {/* Memo content */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
                {renderMarkdown(selected.body)}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
