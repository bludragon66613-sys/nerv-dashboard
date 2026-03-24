import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { buildCatalog } from '@/lib/catalog'

export async function POST(req: NextRequest) {
  const authErr = requireAuth(req); if (authErr) return authErr
  try {
    const agents = await buildCatalog()
    return NextResponse.json({ ok: true, count: agents.length })
  } catch (err) {
    console.error('[agents/refresh]', err)
    return NextResponse.json({ error: 'Failed to rebuild catalog' }, { status: 500 })
  }
}
