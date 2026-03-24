import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { readCatalog } from '@/lib/catalog'

export async function GET(req: NextRequest) {
  const authErr = requireAuth(req); if (authErr) return authErr
  try {
    const agents = await readCatalog()
    return NextResponse.json({ agents, count: agents.length })
  } catch (err) {
    console.error('[agents/catalog]', err)
    return NextResponse.json({ error: 'Failed to load catalog' }, { status: 500 })
  }
}
