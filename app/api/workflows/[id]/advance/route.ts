import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getWorkflowRun, saveWorkflowRun } from '@/lib/workflow-runs'
import {
  BUILTIN_WORKFLOWS,
  getNextExecutableNodes,
  type WorkflowDefinition,
} from '@/lib/workflow-engine'
import { writeScratchboard, readScratchboard } from '@/lib/scratchboard'
import { triggerWorkflow } from '@/lib/github'

/**
 * POST /api/workflows/:id/advance — mark nodes complete and dispatch next wave
 *
 * Body: {
 *   completedNodes: Array<{ nodeId: string; output?: string; error?: string }>
 *   scratchboardWrites?: Record<string, unknown>
 * }
 *
 * Called by a webhook or polling mechanism after GH Actions skills finish.
 * Advances the DAG: marks nodes done, writes outputs to scratchboard,
 * dispatches the next wave of executable nodes.
 */
export async function POST(
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

  if (run.status !== 'running') {
    return NextResponse.json({ error: `Workflow is ${run.status}, cannot advance` }, { status: 400 })
  }

  const body = await req.json().catch(() => ({})) as {
    completedNodes?: Array<{ nodeId: string; output?: string; error?: string }>
    scratchboardWrites?: Record<string, unknown>
  }

  // 1. Mark completed nodes
  const completed = body.completedNodes || []
  for (const update of completed) {
    const node = run.nodes.find(n => n.nodeId === update.nodeId)
    if (!node) continue

    if (update.error) {
      // Check retry config
      const def = BUILTIN_WORKFLOWS.find(w => w.id === run.workflowId)
      const nodeDef = def?.nodes.find(n => n.id === update.nodeId)
      const maxRetries = nodeDef?.retry?.maxIterations || 0

      if (node.attempt < maxRetries) {
        // Retry — reset to pending for next dispatch
        node.status = 'pending'
        node.attempt += 1
        node.error = update.error
      } else {
        node.status = 'failed'
        node.error = update.error
        node.completedAt = new Date().toISOString()
      }
    } else {
      node.status = 'completed'
      node.output = update.output
      node.completedAt = new Date().toISOString()
    }
  }

  // 2. Write to scratchboard
  if (body.scratchboardWrites) {
    for (const [key, value] of Object.entries(body.scratchboardWrites)) {
      await writeScratchboard(run.id, key, value)
    }
    run.scratchboard = await readScratchboard(run.id)
  }

  // 3. Check if workflow is done
  const allDone = run.nodes.every(n => n.status === 'completed' || n.status === 'failed' || n.status === 'skipped')
  const anyFailed = run.nodes.some(n => n.status === 'failed')

  if (allDone) {
    run.status = anyFailed ? 'failed' : 'completed'
    run.completedAt = new Date().toISOString()
    run.updatedAt = new Date().toISOString()
    await saveWorkflowRun(run)
    return NextResponse.json({
      ok: true,
      status: run.status,
      dispatched: [],
      progress: { completed: run.nodes.filter(n => n.status === 'completed').length, total: run.nodes.length },
    })
  }

  // 4. Find and dispatch next wave
  const def = BUILTIN_WORKFLOWS.find(w => w.id === run.workflowId)
  if (!def) {
    return NextResponse.json({ error: 'Workflow definition not found' }, { status: 500 })
  }

  const nextNodes = getNextExecutableNodes(run, def)
  const dispatched: string[] = []

  for (const node of nextNodes) {
    node.status = 'running'
    node.startedAt = new Date().toISOString()
    if (node.attempt === 0) node.attempt = 1

    try {
      await triggerWorkflow(node.skill)
      dispatched.push(node.skill)
    } catch (err) {
      node.status = 'failed'
      node.error = err instanceof Error ? err.message : 'Dispatch failed'
      node.completedAt = new Date().toISOString()
    }
  }

  run.updatedAt = new Date().toISOString()
  await saveWorkflowRun(run)

  return NextResponse.json({
    ok: true,
    status: run.status,
    dispatched,
    progress: {
      completed: run.nodes.filter(n => n.status === 'completed').length,
      total: run.nodes.length,
    },
  })
}
