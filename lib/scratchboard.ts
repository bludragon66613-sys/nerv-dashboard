/**
 * Scratchboard — shared JSON state for cross-skill coordination.
 *
 * Inspired by AgentFlow's scratchboard pattern: a shared memory file
 * that all nodes in a workflow can read/write during execution.
 *
 * Each workflow run gets its own scratchboard. Skills write outputs
 * (keyed by output name), and downstream skills read them.
 *
 * Storage: .scratchboard/ directory with one JSON file per workflow run.
 */

import fs from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import writeFileAtomic from 'write-file-atomic'

const SCRATCHBOARD_DIR = path.join(process.cwd(), '.scratchboard')

async function ensureDir() {
  await fs.mkdir(SCRATCHBOARD_DIR, { recursive: true })
}

function filePath(runId: string): string {
  return path.join(SCRATCHBOARD_DIR, `${runId}.json`)
}

// ---------------------------------------------------------------------------
// Core CRUD
// ---------------------------------------------------------------------------

export async function createScratchboard(runId: string): Promise<Record<string, unknown>> {
  await ensureDir()
  const initial: Record<string, unknown> = {
    _runId: runId,
    _createdAt: new Date().toISOString(),
    _updatedAt: new Date().toISOString(),
  }
  await writeFileAtomic(filePath(runId), JSON.stringify(initial, null, 2))
  return initial
}

export async function readScratchboard(runId: string): Promise<Record<string, unknown>> {
  const p = filePath(runId)
  if (!existsSync(p)) return {}
  try {
    const raw = await fs.readFile(p, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export async function writeScratchboard(
  runId: string,
  key: string,
  value: unknown
): Promise<Record<string, unknown>> {
  await ensureDir()
  const current = await readScratchboard(runId)
  const updated = {
    ...current,
    [key]: value,
    _updatedAt: new Date().toISOString(),
  }
  await writeFileAtomic(filePath(runId), JSON.stringify(updated, null, 2))
  return updated
}

export async function mergeScratchboard(
  runId: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  await ensureDir()
  const current = await readScratchboard(runId)
  const updated = {
    ...current,
    ...data,
    _updatedAt: new Date().toISOString(),
  }
  await writeFileAtomic(filePath(runId), JSON.stringify(updated, null, 2))
  return updated
}

export async function deleteScratchboard(runId: string): Promise<void> {
  const p = filePath(runId)
  try {
    await fs.unlink(p)
  } catch { /* ignore if doesn't exist */ }
}

// ---------------------------------------------------------------------------
// Listing & cleanup
// ---------------------------------------------------------------------------

export async function listScratchboards(): Promise<string[]> {
  if (!existsSync(SCRATCHBOARD_DIR)) return []
  const files = await fs.readdir(SCRATCHBOARD_DIR)
  return files
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''))
}

export async function cleanupOldScratchboards(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
  const ids = await listScratchboards()
  let cleaned = 0
  const now = Date.now()

  for (const id of ids) {
    const data = await readScratchboard(id)
    const updatedAt = data._updatedAt as string | undefined
    if (updatedAt && now - new Date(updatedAt).getTime() > maxAgeMs) {
      await deleteScratchboard(id)
      cleaned++
    }
  }

  return cleaned
}
