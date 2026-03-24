'use client'
import { apiFetch } from '@/lib/client-auth'
import { useState, useEffect, useCallback, useRef } from 'react'

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface Observation {
  id: number
  memory_session_id: string
  project: string
  type: string
  title: string
  subtitle: string | null
  narrative: string | null
  text: string | null
  facts: string | null       // JSON array string
  concepts: string | null    // JSON array string
  files_read: string | null  // JSON array string
  files_modified: string | null
  prompt_number: number
  created_at: string
  created_at_epoch: number
}

// ─── DESIGN SYSTEM ────────────────────────────────────────────────────────────

const C = {
  bg:         '#04040a',
  bgPanel:    '#06070d',
  bgDeep:     '#020206',
  border:     '#12161e',
  borderHi:   '#1c2230',
  cyan:       '#00ccff',
  orange:     '#ff6600',
  green:      '#00ff88',
  blue:       '#4488ff',
  amber:      '#ffaa00',
  purple:     '#aa55ff',
  red:        '#ff4455',
  teal:       '#00ccaa',
  text:       '#a8b4c4',
  textDim:    '#2e3848',
  textBright: '#d8e4f0',
}

const TYPE_META: Record<string, { icon: string; color: string; label: string }> = {
  discovery: { icon: '🔵', color: C.blue,   label: 'DISCOVERY' },
  bugfix:    { icon: '🔴', color: C.red,    label: 'BUGFIX'    },
  feature:   { icon: '🟣', color: C.purple, label: 'FEATURE'   },
  change:    { icon: '✅', color: C.green,  label: 'CHANGE'    },
  decision:  { icon: '⚖️', color: C.amber,  label: 'DECISION'  },
  refactor:  { icon: '🔄', color: C.teal,   label: 'REFACTOR'  },
}

const PAGE_SIZE = 40

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function timeAgo(epoch: number): string {
  const diff = Date.now() - epoch
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(epoch).toLocaleDateString()
}

function parseJsonArr(raw: string | null): string[] {
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [] }
}

function dayKey(epoch: number): string {
  return new Date(epoch).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// ─── COMPONENTS ──────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const meta = TYPE_META[type] ?? { icon: '○', color: C.text, label: type.toUpperCase() }
  return (
    <span style={{
      fontSize: 9, fontFamily: 'monospace', letterSpacing: '0.1em',
      color: meta.color, border: `1px solid ${meta.color}33`,
      background: `${meta.color}12`, borderRadius: 2,
      padding: '1px 6px', whiteSpace: 'nowrap',
    }}>
      {meta.icon} {meta.label}
    </span>
  )
}

function ObsCard({
  obs, expanded, onToggle,
}: {
  obs: Observation
  expanded: boolean
  onToggle: () => void
}) {
  const meta = TYPE_META[obs.type] ?? { icon: '○', color: C.text, label: obs.type }
  const facts = parseJsonArr(obs.facts)
  const filesRead = parseJsonArr(obs.files_read)
  const filesModified = parseJsonArr(obs.files_modified)

  return (
    <div
      style={{
        borderLeft: `2px solid ${expanded ? meta.color : meta.color + '44'}`,
        background: expanded ? `${meta.color}06` : 'transparent',
        transition: 'all 0.15s',
        paddingLeft: 12,
        paddingBottom: expanded ? 12 : 0,
      }}
    >
      {/* Row */}
      <div
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '8px 8px 8px 0', cursor: 'pointer',
        }}
      >
        <span style={{ color: C.textDim, fontSize: 10, fontFamily: 'monospace', minWidth: 32, paddingTop: 1 }}>
          #{obs.id}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{ color: C.textBright, fontSize: 12, fontWeight: 600, flex: 1, lineHeight: 1.3 }}>
              {obs.title}
            </span>
            <TypeBadge type={obs.type} />
          </div>
          {obs.subtitle && (
            <div style={{ color: C.text, fontSize: 11, lineHeight: 1.4, marginBottom: 2 }}>
              {obs.subtitle}
            </div>
          )}
          <div style={{ color: C.textDim, fontSize: 10, fontFamily: 'monospace' }}>
            {timeAgo(obs.created_at_epoch)}
          </div>
        </div>
        <span style={{ color: C.textDim, fontSize: 10, paddingTop: 2, flexShrink: 0 }}>
          {expanded ? '▲' : '▼'}
        </span>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ paddingRight: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {obs.narrative && (
            <div>
              <div style={{ color: C.textDim, fontSize: 9, fontFamily: 'monospace', letterSpacing: '0.1em', marginBottom: 4 }}>
                NARRATIVE
              </div>
              <p style={{ margin: 0, color: C.text, fontSize: 11, lineHeight: 1.7 }}>
                {obs.narrative}
              </p>
            </div>
          )}
          {facts.length > 0 && (
            <div>
              <div style={{ color: C.textDim, fontSize: 9, fontFamily: 'monospace', letterSpacing: '0.1em', marginBottom: 4 }}>
                FACTS
              </div>
              <ul style={{ margin: 0, padding: '0 0 0 16px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                {facts.map((f, i) => (
                  <li key={i} style={{ color: C.text, fontSize: 11, lineHeight: 1.5 }}>{f}</li>
                ))}
              </ul>
            </div>
          )}
          {(filesRead.length > 0 || filesModified.length > 0) && (
            <div style={{ display: 'flex', gap: 20 }}>
              {filesRead.length > 0 && (
                <div>
                  <div style={{ color: C.textDim, fontSize: 9, fontFamily: 'monospace', letterSpacing: '0.1em', marginBottom: 4 }}>
                    READ ({filesRead.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {filesRead.map((f, i) => (
                      <span key={i} style={{ color: C.teal, fontSize: 10, fontFamily: 'monospace' }}>
                        {f.replace(/^.*[/\\]/, '…/')}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {filesModified.length > 0 && (
                <div>
                  <div style={{ color: C.textDim, fontSize: 9, fontFamily: 'monospace', letterSpacing: '0.1em', marginBottom: 4 }}>
                    MODIFIED ({filesModified.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {filesModified.map((f, i) => (
                      <span key={i} style={{ color: C.amber, fontSize: 10, fontFamily: 'monospace' }}>
                        {f.replace(/^.*[/\\]/, '…/')}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── MAIN PAGE ───────────────────────────────────────────────────────────────

export default function TimelinePage() {
  const [obs, setObs] = useState<Observation[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [offset, setOffset] = useState(0)
  const [typeFilter, setTypeFilter] = useState('all')
  // typeCounts from API = accurate counts across full dataset, not just loaded page
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({})
  const [totalAll, setTotalAll] = useState(0)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)

  const fetchObs = useCallback(async (off: number, type: string, replace: boolean) => {
    if (replace) setLoading(true); else setLoadingMore(true)
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(off) })
      if (type !== 'all') params.set('type', type)
      const res = await apiFetch(`/api/memory/timeline?${params}`)
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setObs(prev => {
        if (replace) return data.items
        const seen = new Set(prev.map((o: Observation) => o.id))
        return [...prev, ...data.items.filter((o: Observation) => !seen.has(o.id))]
      })
      setHasMore(data.hasMore)
      setOffset(off + data.items.length)
      // Use server-provided counts (accurate across full dataset)
      if (data.typeCounts) setTypeCounts(data.typeCounts)
      if (data.totalAll != null) setTotalAll(data.totalAll)
      setError(null)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    setOffset(0)
    setExpanded(null)
    fetchObs(0, typeFilter, true)
  }, [typeFilter, fetchObs])

  const visible = search
    ? obs.filter(o => {
        const q = search.toLowerCase()
        return o.title.toLowerCase().includes(q) ||
               (o.subtitle ?? '').toLowerCase().includes(q) ||
               (o.narrative ?? '').toLowerCase().includes(q)
      })
    : obs

  // Group by day
  const grouped: { day: string; items: Observation[] }[] = []
  for (const o of visible) {
    const day = dayKey(o.created_at_epoch)
    if (grouped.length === 0 || grouped[grouped.length - 1].day !== day) {
      grouped.push({ day, items: [o] })
    } else {
      grouped[grouped.length - 1].items.push(o)
    }
  }

  // Derive all known types from full typeCounts (not just loaded items)
  const allTypes = Object.keys(typeCounts).sort()

  return (
    <div style={{
      background: C.bg, minHeight: '100vh', color: C.text,
      fontFamily: "'Geist Mono', monospace", display: 'flex', flexDirection: 'column',
    }}>
      {/* Top bar */}
      <div style={{
        borderBottom: `1px solid ${C.border}`, padding: '10px 20px',
        display: 'flex', alignItems: 'center', gap: 16, background: C.bgDeep, flexShrink: 0,
      }}>
        <span style={{ color: C.cyan, fontSize: 13, fontWeight: 700, letterSpacing: '0.12em' }}>
          ◈ TIMELINE
        </span>
        <span style={{ color: C.textDim, fontSize: 10 }}>
          {totalAll > 0 ? `${totalAll} total` : `${obs.length} loaded`}
          {typeFilter !== 'all' && ` · ${typeCounts[typeFilter] ?? 0} ${typeFilter}`}
        </span>
        <div style={{ flex: 1 }} />
        <a href="/memory" style={{ color: C.textDim, fontSize: 10, textDecoration: 'none' }}>
          ◈ MEMORY
        </a>
        <a href="/" style={{ color: C.textDim, fontSize: 10, textDecoration: 'none' }}>
          ← BACK
        </a>
      </div>

      {/* Filter bar */}
      <div style={{
        borderBottom: `1px solid ${C.border}`, padding: '8px 20px',
        display: 'flex', gap: 6, alignItems: 'center', background: C.bgDeep, flexShrink: 0,
        flexWrap: 'wrap',
      }}>
        {/* ALL button */}
        {[{ t: 'all', meta: null as typeof TYPE_META[string] | null }, ...allTypes.map(t => ({ t, meta: TYPE_META[t] ?? null }))]
          .map(({ t, meta }) => {
            const active = typeFilter === t
            const count = t === 'all' ? totalAll : (typeCounts[t] ?? 0)
            const color = meta?.color ?? C.cyan
            return (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                style={{
                  background: active ? `${color}18` : 'none',
                  border: `1px solid ${active ? color + '55' : C.border}`,
                  borderRadius: 3,
                  color: active ? color : C.textDim,
                  fontSize: 10, padding: '3px 10px', cursor: 'pointer',
                  fontFamily: 'monospace', letterSpacing: '0.06em',
                }}
              >
                {meta?.icon ?? '◈'} {t === 'all' ? 'ALL' : (meta?.label ?? t.toUpperCase())} ({count})
              </button>
            )
          })}
        <div style={{ flex: 1 }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="filter loaded..."
          style={{
            background: C.bgPanel, border: `1px solid ${C.border}`, borderRadius: 3,
            color: C.textBright, fontSize: 11, padding: '4px 10px',
            fontFamily: 'monospace', outline: 'none', width: 180,
          }}
        />
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px', maxWidth: 800, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        {loading && (
          <div style={{ color: C.textDim, fontSize: 11, textAlign: 'center', padding: 40 }}>
            Loading timeline...
          </div>
        )}
        {error && (
          <div style={{ color: '#ff4444', fontSize: 11, padding: 12, background: '#ff000010', borderRadius: 4, border: '1px solid #ff000030' }}>
            {error}
          </div>
        )}
        {!loading && visible.length === 0 && !error && (
          <div style={{ color: C.textDim, fontSize: 11, textAlign: 'center', padding: 40 }}>
            No observations found
          </div>
        )}

        {grouped.map(group => (
          <div key={group.day} style={{ marginBottom: 24 }}>
            {/* Day header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8,
            }}>
              <span style={{ color: C.cyan, fontSize: 10, fontFamily: 'monospace', letterSpacing: '0.1em' }}>
                {group.day.toUpperCase()}
              </span>
              <div style={{ flex: 1, height: 1, background: C.border }} />
              <span style={{ color: C.textDim, fontSize: 10 }}>{group.items.length}</span>
            </div>

            {/* Observations */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {group.items.map(o => (
                <ObsCard
                  key={o.id}
                  obs={o}
                  expanded={expanded === o.id}
                  onToggle={() => setExpanded(prev => prev === o.id ? null : o.id)}
                />
              ))}
            </div>
          </div>
        ))}

        {/* Load more */}
        {hasMore && !search && (
          <div style={{ textAlign: 'center', padding: '16px 0 32px' }}>
            <button
              onClick={() => fetchObs(offset, typeFilter, false)}
              disabled={loadingMore}
              style={{
                background: 'none', border: `1px solid ${C.border}`, borderRadius: 3,
                color: loadingMore ? C.textDim : C.cyan, fontSize: 11, padding: '6px 20px',
                cursor: loadingMore ? 'default' : 'pointer', fontFamily: 'monospace',
              }}
            >
              {loadingMore ? 'loading...' : `↓ LOAD MORE`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
