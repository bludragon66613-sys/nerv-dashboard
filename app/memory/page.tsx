'use client'
import { apiFetch } from '@/lib/client-auth'

import { useState, useEffect, useCallback } from 'react'

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface MemoryFile {
  filename: string
  name: string
  description: string
  type: 'user' | 'feedback' | 'project' | 'reference' | 'index' | 'savepoint'
  body: string
  mtime: number
}

// ─── DESIGN SYSTEM ────────────────────────────────────────────────────────────

const C = {
  bg:         '#04040a',
  bgPanel:    '#06070d',
  bgDeep:     '#020206',
  border:     '#12161e',
  borderHi:   '#1c2230',
  orange:     '#ff6600',
  orangeDim:  '#7a3200',
  green:      '#00ff88',
  blue:       '#0088ff',
  amber:      '#ffaa00',
  purple:     '#aa55ff',
  teal:       '#00ccaa',
  text:       '#a8b4c4',
  textDim:    '#2e3848',
  textBright: '#d8e4f0',
  textMuted:  '#181e28',
}

const TYPE_META: Record<string, { label: string; color: string; icon: string }> = {
  index:     { label: 'INDEX',     color: C.orange, icon: '◈' },
  user:      { label: 'USER',      color: C.blue,   icon: '◉' },
  project:   { label: 'PROJECT',   color: C.green,  icon: '◆' },
  feedback:  { label: 'FEEDBACK',  color: C.amber,  icon: '◇' },
  reference: { label: 'REF',       color: C.teal,   icon: '◎' },
  savepoint: { label: 'SAVEPOINT', color: C.purple, icon: '▣' },
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function timeAgo(mtime: number): string {
  const diff = Date.now() - mtime
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ─── COMPONENTS ──────────────────────────────────────────────────────────────

function Badge({ type }: { type: string }) {
  const meta = TYPE_META[type] ?? { label: type.toUpperCase(), color: C.text, icon: '○' }
  return (
    <span style={{
      fontSize: 9, fontFamily: 'monospace', letterSpacing: '0.1em',
      color: meta.color, border: `1px solid ${meta.color}22`,
      background: `${meta.color}10`, borderRadius: 2,
      padding: '1px 5px', whiteSpace: 'nowrap',
    }}>
      {meta.icon} {meta.label}
    </span>
  )
}

function MemoryCard({
  file, selected, onClick,
}: {
  file: MemoryFile
  selected: boolean
  onClick: () => void
}) {
  const meta = TYPE_META[file.type] ?? TYPE_META.user
  return (
    <div
      onClick={onClick}
      style={{
        background: selected ? `${meta.color}08` : C.bgPanel,
        border: `1px solid ${selected ? meta.color + '44' : C.border}`,
        borderRadius: 4, padding: '10px 12px', cursor: 'pointer',
        transition: 'all 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ color: meta.color, fontSize: 13 }}>{meta.icon}</span>
        <span style={{ color: C.textBright, fontSize: 12, fontWeight: 600, flex: 1 }}>
          {file.name}
        </span>
        <Badge type={file.type} />
      </div>
      {file.description && (
        <div style={{ color: C.text, fontSize: 11, lineHeight: 1.4, marginBottom: 4 }}>
          {file.description}
        </div>
      )}
      <div style={{ color: C.textDim, fontSize: 10, fontFamily: 'monospace' }}>
        {file.filename} · {timeAgo(file.mtime)}
      </div>
    </div>
  )
}

function MemoryViewer({ file }: { file: MemoryFile }) {
  const meta = TYPE_META[file.type] ?? TYPE_META.user
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px', borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
      }}>
        <span style={{ color: meta.color, fontSize: 16 }}>{meta.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ color: C.textBright, fontSize: 13, fontWeight: 700 }}>{file.name}</div>
          {file.description && (
            <div style={{ color: C.text, fontSize: 11, marginTop: 2 }}>{file.description}</div>
          )}
        </div>
        <Badge type={file.type} />
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        <pre style={{
          margin: 0, color: C.text, fontSize: 12, lineHeight: 1.7,
          fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {file.body || <span style={{ color: C.textDim, fontStyle: 'italic' }}>Empty file</span>}
        </pre>
      </div>

      {/* Footer */}
      <div style={{
        padding: '8px 16px', borderTop: `1px solid ${C.border}`,
        display: 'flex', gap: 16, flexShrink: 0,
      }}>
        <span style={{ color: C.textDim, fontSize: 10, fontFamily: 'monospace' }}>
          {file.filename}
        </span>
        <span style={{ color: C.textDim, fontSize: 10, fontFamily: 'monospace' }}>
          {new Date(file.mtime).toLocaleString()}
        </span>
      </div>
    </div>
  )
}

// ─── MAIN PAGE ───────────────────────────────────────────────────────────────

export default function MemoryPage() {
  const [files, setFiles] = useState<MemoryFile[]>([])
  const [selected, setSelected] = useState<MemoryFile | null>(null)
  const [filter, setFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState(Date.now())

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/memory')
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setFiles(data.files)
      setLastRefresh(Date.now())
      setError(null)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const types = ['all', ...Array.from(new Set(files.map(f => f.type)))]

  const visible = files.filter(f => {
    if (filter !== 'all' && f.type !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      return f.name.toLowerCase().includes(q) ||
             f.description.toLowerCase().includes(q) ||
             f.body.toLowerCase().includes(q)
    }
    return true
  })

  const counts = files.reduce<Record<string, number>>((acc, f) => {
    acc[f.type] = (acc[f.type] ?? 0) + 1
    return acc
  }, {})

  return (
    <div style={{
      background: C.bg, minHeight: '100vh', color: C.text,
      fontFamily: "'Geist Mono', monospace", display: 'flex', flexDirection: 'column',
    }}>
      {/* Top bar */}
      <div style={{
        borderBottom: `1px solid ${C.border}`, padding: '10px 20px',
        display: 'flex', alignItems: 'center', gap: 16, background: C.bgDeep,
      }}>
        <span style={{ color: C.orange, fontSize: 13, fontWeight: 700, letterSpacing: '0.12em' }}>
          ◈ MEMORY
        </span>
        <span style={{ color: C.textDim, fontSize: 10 }}>
          {files.length} files · refreshed {timeAgo(lastRefresh)}
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={load}
          style={{
            background: 'none', border: `1px solid ${C.border}`, borderRadius: 3,
            color: C.text, fontSize: 10, padding: '3px 10px', cursor: 'pointer',
            fontFamily: 'monospace',
          }}
        >
          ↺ REFRESH
        </button>
        <a href="/" style={{ color: C.textDim, fontSize: 10, textDecoration: 'none' }}>
          ← BACK
        </a>
      </div>

      {/* Filter bar */}
      <div style={{
        borderBottom: `1px solid ${C.border}`, padding: '8px 20px',
        display: 'flex', gap: 8, alignItems: 'center', background: C.bgDeep,
      }}>
        {types.map(t => {
          const meta = TYPE_META[t]
          const active = filter === t
          const count = t === 'all' ? files.length : (counts[t] ?? 0)
          return (
            <button
              key={t}
              onClick={() => setFilter(t)}
              style={{
                background: active ? (meta ? `${meta.color}18` : `${C.orange}18`) : 'none',
                border: `1px solid ${active ? (meta?.color ?? C.orange) + '55' : C.border}`,
                borderRadius: 3, color: active ? (meta?.color ?? C.orange) : C.textDim,
                fontSize: 10, padding: '3px 10px', cursor: 'pointer',
                fontFamily: 'monospace', letterSpacing: '0.08em',
              }}
            >
              {t === 'all' ? 'ALL' : (TYPE_META[t]?.label ?? t.toUpperCase())} ({count})
            </button>
          )
        })}
        <div style={{ flex: 1 }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search memory..."
          style={{
            background: C.bgPanel, border: `1px solid ${C.border}`, borderRadius: 3,
            color: C.textBright, fontSize: 11, padding: '4px 10px',
            fontFamily: 'monospace', outline: 'none', width: 200,
          }}
        />
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left: file list */}
        <div style={{
          width: 320, borderRight: `1px solid ${C.border}`,
          overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 6,
          flexShrink: 0,
        }}>
          {loading && (
            <div style={{ color: C.textDim, fontSize: 11, padding: 8, textAlign: 'center' }}>
              Loading memory...
            </div>
          )}
          {error && (
            <div style={{ color: '#ff4444', fontSize: 11, padding: 8 }}>{error}</div>
          )}
          {!loading && visible.length === 0 && (
            <div style={{ color: C.textDim, fontSize: 11, padding: 8, textAlign: 'center' }}>
              No files match
            </div>
          )}
          {visible.map(f => (
            <MemoryCard
              key={f.filename}
              file={f}
              selected={selected?.filename === f.filename}
              onClick={() => setSelected(f)}
            />
          ))}
        </div>

        {/* Right: viewer */}
        <div style={{ flex: 1, overflow: 'hidden', background: C.bgPanel }}>
          {selected ? (
            <MemoryViewer file={selected} />
          ) : (
            <div style={{
              height: '100%', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 12,
            }}>
              <div style={{ color: C.orange, fontSize: 32, opacity: 0.3 }}>◈</div>
              <div style={{ color: C.textDim, fontSize: 12 }}>
                Select a memory file to view
              </div>
              <div style={{ color: C.textMuted, fontSize: 10, fontFamily: 'monospace' }}>
                {files.length} files · {Object.entries(counts).map(([t, n]) => `${n} ${t}`).join(' · ')}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
