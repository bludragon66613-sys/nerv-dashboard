import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getWorkflowRun, saveWorkflowRun } from '@/lib/workflow-runs'

/**
 * GET /api/workflows/:id — get workflow run status
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authErr = requireAuth(req)
  if (authErr) return authErr

  const { id } = await params
  const run = await getWorkflowRun(id)
  if (!run) {
    return NextResponse.json({ error: 'Workflow run not found' }, { status: 404 })
  }

  const completed = run.nodes.filter(n => n.status === 'completed').length
  const failed = run.nodes.filter(n => n.status === 'failed').length
  const running = run.nodes.filter(n => n.status === 'running').length
  const pending = run.nodes.filter(n => n.status === 'pending').length

  return NextResponse.json({
    ...run,
    progress: {
      total: run.nodes.length,
      completed,
      failed,
      running,
      pending,
      percent: Math.round((completed / run.nodes.length) * 100),
    },
  })
}

/**
 * DELETE /api/workflows/:id — cancel a workflow run
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authErr = requireAuth(req)
  if (authErr) return authErr

  const { id } = await params
  const run = await getWorkflowRun(id)
  if (!run) {
    return NextResponse.json({ error: 'Workflow run not found' }, { status: 404 })
  }

  run.status = 'cancelled'
  run.updatedAt = new Date().toISOString()
  run.completedAt = new Date().toISOString()

  // Mark pending/running nodes as skipped
  for (const node of run.nodes) {
    if (node.status === 'pending' || node.status === 'running') {
      node.status = 'skipped'
      node.completedAt = new Date().toISOString()
    }
  }

  await saveWorkflowRun(run)
  return NextResponse.json({ ok: true, status: 'cancelled' })
}
