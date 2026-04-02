/**
 * Workflow Run persistence — stores workflow execution state.
 *
 * Mirrors the pattern from lib/jobs.ts but for workflow runs.
 */

import fs from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import writeFileAtomic from 'write-file-atomic'
import type { WorkflowRun } from './workflow-engine'

const RUNS_DIR = path.join(process.cwd(), '.workflow-runs')

async function ensureDir() {
  await fs.mkdir(RUNS_DIR, { recursive: true })
}

export async function saveWorkflowRun(run: WorkflowRun): Promise<void> {
  await ensureDir()
  const p = path.join(RUNS_DIR, `${run.id}.json`)
  await writeFileAtomic(p, JSON.stringify(run, null, 2))
}

export async function getWorkflowRun(id: string): Promise<WorkflowRun | null> {
  const p = path.join(RUNS_DIR, `${id}.json`)
  try {
    const raw = await fs.readFile(p, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function listWorkflowRuns(): Promise<WorkflowRun[]> {
  if (!existsSync(RUNS_DIR)) return []
  const files = await fs.readdir(RUNS_DIR)
  const runs: WorkflowRun[] = []
  for (const f of files) {
    if (!f.endsWith('.json')) continue
    try {
      const raw = await fs.readFile(path.join(RUNS_DIR, f), 'utf-8')
      runs.push(JSON.parse(raw))
    } catch { /* skip corrupt files */ }
  }
  return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function deleteWorkflowRun(id: string): Promise<void> {
  const p = path.join(RUNS_DIR, `${id}.json`)
  try {
    await fs.unlink(p)
  } catch { /* ignore */ }
}
