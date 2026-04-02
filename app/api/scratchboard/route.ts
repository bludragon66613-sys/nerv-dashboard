import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { listScratchboards, cleanupOldScratchboards } from '@/lib/scratchboard'

/**
 * GET /api/scratchboard — list active scratchboards
 */
export async function GET(req: NextRequest) {
  const authErr = requireAuth(req)
  if (authErr) return authErr

  const ids = await listScratchboards()
  return NextResponse.json({ scratchboards: ids })
}

/**
 * DELETE /api/scratchboard — cleanup old scratchboards (>24h)
 */
export async function DELETE(req: NextRequest) {
  const authErr = requireAuth(req)
  if (authErr) return authErr

  const cleaned = await cleanupOldScratchboards()
  return NextResponse.json({ ok: true, cleaned })
}
