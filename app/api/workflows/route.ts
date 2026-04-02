import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import {
  BUILTIN_WORKFLOWS,
  createWorkflowRun,
  getNextExecutableNodes,
  compileWorkflow,
  type WorkflowDefinition,
} from '@/lib/workflow-engine'
import { saveWorkflowRun, listWorkflowRuns } from '@/lib/workflow-runs'
import { createScratchboard } from '@/lib/scratchboard'
import { triggerWorkflow } from '@/lib/github'

/**
 * GET /api/workflows — list built-in workflow templates + recent runs
 */
export async function GET(req: NextRequest) {
  const authErr = requireAuth(req)
  if (authErr) return authErr

  const runs = await listWorkflowRuns()

  return NextResponse.json({
    templates: BUILTIN_WORKFLOWS.map(w => ({
      id: w.id,
      name: w.name,
      description: w.description,
      nodeCount: w.nodes.length,
      nodes: w.nodes.map(n => ({ id: n.id, skill: n.skill, dependsOn: n.dependsOn })),
    })),
    runs: runs.slice(0, 20),
  })
}

/**
 * POST /api/workflows — start a workflow run
 *
 * Body: { workflowId: string } for built-in, or { workflow: WorkflowDefinition } for custom
 */
export async function POST(req: NextRequest) {
  const authErr = requireAuth(req)
  if (authErr) return authErr

  const body = await req.json().catch(() => ({})) as {
    workflowId?: string
    workflow?: WorkflowDefinition
  }

  // Resolve workflow definition
  let def: WorkflowDefinition | undefined
  if (body.workflowId) {
    def = BUILTIN_WORKFLOWS.find(w => w.id === body.workflowId)
    if (!def) {
      return NextResponse.json({ error: `Unknown workflow: ${body.workflowId}` }, { status: 404 })
    }
  } else if (body.workflow) {
    def = body.workflow
  } else {
    return NextResponse.json({ error: 'Provide workflowId or workflow' }, { status: 400 })
  }

  // Validate DAG compiles without cycles
  try {
    compileWorkflow(def)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid workflow DAG' },
      { status: 400 }
    )
  }

  // Create run + scratchboard
  const run = createWorkflowRun(def)
  run.status = 'running'
  run.updatedAt = new Date().toISOString()

  if (def.scratchboard) {
    await createScratchboard(run.id)
  }

  // Dispatch first wave (nodes with no dependencies)
  const executable = getNextExecutableNodes(run, def)
  for (const node of executable) {
    node.status = 'running'
    node.startedAt = new Date().toISOString()
    node.attempt = 1

    // Dispatch to GitHub Actions
    try {
      await triggerWorkflow(node.skill)
    } catch (err) {
      node.status = 'failed'
      node.error = err instanceof Error ? err.message : 'Dispatch failed'
      node.completedAt = new Date().toISOString()
    }
  }

  await saveWorkflowRun(run)

  return NextResponse.json({
    ok: true,
    runId: run.id,
    name: run.name,
    dispatched: executable.map(n => n.skill),
    totalNodes: run.nodes.length,
  })
}
