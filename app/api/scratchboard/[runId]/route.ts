import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import {
  readScratchboard,
  writeScratchboard,
  mergeScratchboard,
  deleteScratchboard,
} from '@/lib/scratchboard'

/**
 * GET /api/scratchboard/:runId — read scratchboard contents
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const authErr = requireAuth(req)
  if (authErr) return authErr

  const { runId } = await params
  const data = await readScratchboard(runId)
  return NextResponse.json(data)
}

/**
 * PUT /api/scratchboard/:runId — write a key to the scratchboard
 *
 * Body: { key: string, value: any }
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const authErr = requireAuth(req)
  if (authErr) return authErr

  const { runId } = await params
  const body = await req.json().catch(() => ({})) as { key?: string; value?: unknown }

  if (!body.key) {
    return NextResponse.json({ error: 'Missing key' }, { status: 400 })
  }

  const updated = await writeScratchboard(runId, body.key, body.value)
  return NextResponse.json(updated)
}

/**
 * PATCH /api/scratchboard/:runId — merge multiple keys
 *
 * Body: Record<string, any>
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const authErr = requireAuth(req)
  if (authErr) return authErr

  const { runId } = await params
  const data = await req.json().catch(() => ({})) as Record<string, unknown>
  const updated = await mergeScratchboard(runId, data)
  return NextResponse.json(updated)
}

/**
 * DELETE /api/scratchboard/:runId — delete a scratchboard
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const authErr = requireAuth(req)
  if (authErr) return authErr

  const { runId } = await params
  await deleteScratchboard(runId)
  return NextResponse.json({ ok: true })
}
