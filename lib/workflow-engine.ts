/**
 * Workflow Engine — AgentFlow-inspired DAG orchestration for Aeon skills.
 *
 * Core concepts (borrowed from github.com/shouc/agentflow):
 *   - Nodes: individual skill executions with unique IDs
 *   - Edges: dependency relationships (node A must complete before node B)
 *   - Fan-out: spawn N parallel copies of a node
 *   - Merge: collect outputs from fan-out into a single node
 *   - Iterative cycles: retry on failure with max_iterations + success_criteria
 *   - Scratchboard: shared JSON state all nodes can read/write
 */

import { randomUUID } from 'crypto'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NodeStatus = 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'skipped'

export interface WorkflowNode {
  id: string
  skill: string
  /** Variable passed to the skill (like aeon.yml var) */
  var?: string
  /** IDs of nodes this node depends on */
  dependsOn: string[]
  /** Named outputs this node produces (stored in scratchboard) */
  outputs?: string[]
  /** Fan-out config: number of parallel copies, or array of vars to fan over */
  fanOut?: number | string[]
  /** Merge config: collect outputs from a fan-out source node */
  mergeFrom?: string
  /** Iterative cycle config */
  retry?: {
    maxIterations: number
    /** Scratchboard key to check — truthy = success */
    successKey?: string
  }
  /** Model override for this node */
  model?: string
}

export interface WorkflowEdge {
  from: string
  to: string
  /** Only traverse on this condition */
  condition?: 'on_success' | 'on_failure'
}

export interface WorkflowDefinition {
  id: string
  name: string
  description?: string
  nodes: WorkflowNode[]
  edges?: WorkflowEdge[]
  /** Enable shared scratchboard for all nodes */
  scratchboard?: boolean
}

export interface WorkflowRunNode {
  id: string
  nodeId: string
  skill: string
  var?: string
  status: NodeStatus
  startedAt?: string
  completedAt?: string
  output?: string
  error?: string
  attempt: number
  /** GitHub Actions run ID if dispatched there */
  ghRunId?: string
  /** Fan-out index (0-based) */
  fanIndex?: number
}

export interface WorkflowRun {
  id: string
  workflowId: string
  name: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  createdAt: string
  updatedAt: string
  completedAt?: string
  nodes: WorkflowRunNode[]
  scratchboard: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// DAG Resolution — Topological Sort (Kahn's algorithm)
// ---------------------------------------------------------------------------

export function topologicalSort(nodes: WorkflowNode[]): string[][] {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const inDegree = new Map<string, number>()
  const adjacency = new Map<string, string[]>()

  for (const node of nodes) {
    inDegree.set(node.id, 0)
    adjacency.set(node.id, [])
  }

  for (const node of nodes) {
    for (const dep of node.dependsOn) {
      if (!adjacency.has(dep)) continue
      adjacency.get(dep)!.push(node.id)
      inDegree.set(node.id, (inDegree.get(node.id) || 0) + 1)
    }
  }

  const waves: string[][] = []
  const visited = new Set<string>()

  while (visited.size < nodes.length) {
    const wave: string[] = []
    for (const [id, degree] of inDegree) {
      if (!visited.has(id) && degree === 0) {
        wave.push(id)
      }
    }

    if (wave.length === 0) {
      // Cycle detected — collect remaining nodes
      const remaining = nodes.filter(n => !visited.has(n.id)).map(n => n.id)
      throw new Error(`Cycle detected in workflow DAG involving nodes: ${remaining.join(', ')}`)
    }

    waves.push(wave)
    for (const id of wave) {
      visited.add(id)
      for (const neighbor of adjacency.get(id) || []) {
        inDegree.set(neighbor, (inDegree.get(neighbor) || 0) - 1)
      }
    }
  }

  return waves
}

// ---------------------------------------------------------------------------
// Fan-out Expansion
// ---------------------------------------------------------------------------

export function expandFanOut(nodes: WorkflowNode[]): WorkflowNode[] {
  const expanded: WorkflowNode[] = []

  for (const node of nodes) {
    if (!node.fanOut) {
      expanded.push(node)
      continue
    }

    const count = typeof node.fanOut === 'number' ? node.fanOut : node.fanOut.length
    const vars = typeof node.fanOut === 'number'
      ? Array.from({ length: count }, (_, i) => `${node.var || ''}#${i}`)
      : node.fanOut

    for (let i = 0; i < count; i++) {
      expanded.push({
        ...node,
        id: `${node.id}__fan_${i}`,
        var: vars[i],
        fanOut: undefined,
        outputs: node.outputs?.map(o => `${o}__fan_${i}`),
      })
    }

    // If there's a merge node, update its dependsOn to point at fan-out children
    const mergeNode = nodes.find(n => n.mergeFrom === node.id)
    if (mergeNode) {
      mergeNode.dependsOn = Array.from({ length: count }, (_, i) => `${node.id}__fan_${i}`)
    }
  }

  return expanded
}

// ---------------------------------------------------------------------------
// Workflow Compilation — from definition to executable plan
// ---------------------------------------------------------------------------

export function compileWorkflow(def: WorkflowDefinition): { waves: string[][]; nodeMap: Map<string, WorkflowNode> } {
  // 1. Expand fan-out nodes
  const expanded = expandFanOut([...def.nodes])

  // 2. Apply edge-based dependencies on top of declarative dependsOn
  if (def.edges) {
    const nodeMap = new Map(expanded.map(n => [n.id, n]))
    for (const edge of def.edges) {
      const target = nodeMap.get(edge.to)
      if (target && !target.dependsOn.includes(edge.from)) {
        target.dependsOn.push(edge.from)
      }
    }
  }

  // 3. Sort into parallel waves
  const waves = topologicalSort(expanded)
  const nodeMap = new Map(expanded.map(n => [n.id, n]))

  return { waves, nodeMap }
}

// ---------------------------------------------------------------------------
// Workflow Run Factory
// ---------------------------------------------------------------------------

export function createWorkflowRun(def: WorkflowDefinition): WorkflowRun {
  const { waves, nodeMap } = compileWorkflow(def)

  const runNodes: WorkflowRunNode[] = []
  for (const wave of waves) {
    for (const nodeId of wave) {
      const node = nodeMap.get(nodeId)!
      runNodes.push({
        id: randomUUID(),
        nodeId,
        skill: node.skill,
        var: node.var,
        status: 'pending',
        attempt: 0,
      })
    }
  }

  return {
    id: randomUUID(),
    workflowId: def.id,
    name: def.name,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nodes: runNodes,
    scratchboard: {},
  }
}

// ---------------------------------------------------------------------------
// Workflow Advancement — find next executable wave
// ---------------------------------------------------------------------------

export function getNextExecutableNodes(run: WorkflowRun, def: WorkflowDefinition): WorkflowRunNode[] {
  const { nodeMap } = compileWorkflow(def)
  const completedNodeIds = new Set(
    run.nodes.filter(n => n.status === 'completed').map(n => n.nodeId)
  )

  return run.nodes.filter(n => {
    if (n.status !== 'pending') return false
    const nodeDef = nodeMap.get(n.nodeId)
    if (!nodeDef) return false
    return nodeDef.dependsOn.every(dep => completedNodeIds.has(dep))
  })
}

// ---------------------------------------------------------------------------
// Pre-built workflow templates (from aeon.yml dependency graph)
// ---------------------------------------------------------------------------

export function buildMorningPipeline(): WorkflowDefinition {
  return {
    id: 'morning-pipeline',
    name: 'Morning Intelligence Pipeline',
    description: 'Gathers RSS, HN, papers, tweets in parallel → synthesizes morning brief',
    scratchboard: true,
    nodes: [
      { id: 'rss', skill: 'rss-digest', dependsOn: [], outputs: ['feed-highlights'] },
      { id: 'hn', skill: 'hacker-news-digest', dependsOn: [], outputs: ['hn-stories'] },
      { id: 'papers', skill: 'paper-digest', dependsOn: [], outputs: ['papers'] },
      { id: 'tweets', skill: 'tweet-digest', dependsOn: [], outputs: ['tweet-highlights'] },
      { id: 'brief', skill: 'morning-brief', dependsOn: ['rss', 'hn', 'papers', 'tweets'] },
    ],
  }
}

export function buildCryptoSweep(): WorkflowDefinition {
  return {
    id: 'crypto-sweep',
    name: 'Crypto Intelligence Sweep',
    description: 'Parallel crypto monitors → consolidated alert',
    scratchboard: true,
    nodes: [
      { id: 'tokens', skill: 'token-alert', dependsOn: [], outputs: ['token-alerts'] },
      { id: 'wallets', skill: 'wallet-digest', dependsOn: [], outputs: ['wallet-summary'] },
      { id: 'onchain', skill: 'on-chain-monitor', dependsOn: [], outputs: ['on-chain-events'] },
      { id: 'defi', skill: 'defi-monitor', dependsOn: [], outputs: ['defi-alerts'] },
      { id: 'intel', skill: 'hl-intel', dependsOn: ['tokens', 'wallets', 'onchain', 'defi'] },
    ],
  }
}

export function buildEveningReflection(): WorkflowDefinition {
  return {
    id: 'evening-reflection',
    name: 'Evening Reflection Pipeline',
    description: 'Self-review → reflect → memory-flush chain',
    scratchboard: true,
    nodes: [
      { id: 'goals', skill: 'goal-tracker', dependsOn: [] },
      { id: 'health', skill: 'skill-health', dependsOn: [] },
      { id: 'review', skill: 'self-review', dependsOn: [], outputs: ['review-findings'] },
      { id: 'reflect', skill: 'reflect', dependsOn: ['review'], outputs: ['reflections'] },
      { id: 'flush', skill: 'memory-flush', dependsOn: ['reflect'] },
    ],
  }
}

export function buildCodeReviewCycle(): WorkflowDefinition {
  return {
    id: 'code-review-cycle',
    name: 'Iterative Code Review',
    description: 'Triage issues → implement feature → review → fix (iterative)',
    scratchboard: true,
    nodes: [
      { id: 'triage', skill: 'issue-triage', dependsOn: [], outputs: ['triaged-issues'] },
      { id: 'implement', skill: 'feature', dependsOn: ['triage'] },
      {
        id: 'review',
        skill: 'pr-review',
        dependsOn: ['implement'],
        retry: { maxIterations: 3, successKey: 'review-passed' },
      },
      { id: 'health', skill: 'code-health', dependsOn: ['review'] },
    ],
  }
}

export const BUILTIN_WORKFLOWS: WorkflowDefinition[] = [
  buildMorningPipeline(),
  buildCryptoSweep(),
  buildEveningReflection(),
  buildCodeReviewCycle(),
]
