import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

const CLAUDE_MEM_URL = process.env.CLAUDE_MEM_URL || 'http://localhost:37777'
const CACHE_TTL_MS = 2 * 60 * 1000 // 2-minute server-side cache

// ─── Types ────────────────────────────────────────────────────────────────────

interface Observation {
  id: number
  memory_session_id: string
  project: string
  type: string
  title: string
  subtitle: string | null
  narrative: string | null
  text: string | null
  facts: string | null
  concepts: string | null
  files_read: string | null
  files_modified: string | null
  prompt_number: number
  created_at: string
  created_at_epoch: number
}

// ─── Server-side cache (module-level, persists across requests) ───────────────

let cachedAll: Observation[] = []
let cacheExpiry = 0

async function fetchAllObservations(): Promise<Observation[]> {
  if (cachedAll.length > 0 && Date.now() < cacheExpiry) return cachedAll

  const all: Observation[] = []
  const pageSize = 100
  let offset = 0
  let hasMore = true

  while (hasMore) {
    const url = new URL(`${CLAUDE_MEM_URL}/api/observations`)
    url.searchParams.set('limit', String(pageSize))
    url.searchParams.set('offset', String(offset))

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) })
    if (!res.ok) break

    const data = await res.json() as { items: Observation[]; hasMore: boolean }
    all.push(...data.items)
    hasMore = data.hasMore && data.items.length > 0
    offset += data.items.length
  }

  // Newest first
  all.sort((a, b) => b.created_at_epoch - a.created_at_epoch)

  cachedAll = all
  cacheExpiry = Date.now() + CACHE_TTL_MS
  return all
}

// ─── Route ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const authErr = requireAuth(req); if (authErr) return authErr

  const { searchParams } = req.nextUrl
  const limit = Math.min(parseInt(searchParams.get('limit') || '40', 10), 200)
  const offset = parseInt(searchParams.get('offset') || '0', 10)
  const type = searchParams.get('type') || ''

  if (searchParams.get('refresh') === '1') cacheExpiry = 0

  try {
    const all = await fetchAllObservations()

    // Accurate type counts across full dataset
    const typeCounts: Record<string, number> = {}
    for (const o of all) {
      typeCounts[o.type] = (typeCounts[o.type] ?? 0) + 1
    }

    // Server-side type filter
    const filtered = type && type !== 'all'
      ? all.filter(o => o.type === type)
      : all

    // Paginate filtered set
    const page = filtered.slice(offset, offset + limit)

    return NextResponse.json({
      items: page,
      hasMore: offset + page.length < filtered.length,
      total: filtered.length,
      totalAll: all.length,
      typeCounts,
    })
  } catch (err) {
    console.error('[memory/timeline]', err)
    return NextResponse.json({ error: 'Failed to load timeline' }, { status: 503 })
  }
}
