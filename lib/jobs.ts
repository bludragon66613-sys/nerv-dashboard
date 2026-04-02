import fs from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import writeFileAtomic from 'write-file-atomic'

export type JobStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed:auth'
  | 'failed:invalid-skill'
  | 'failed:rate-limited'
  | 'failed:github-error'
  | 'failed:parse-error'
  | 'failed:unknown'
  | 'cancelled'

export interface Job {
  id: string
  skill: string
  mode: string
  dispatchType: string
  status: JobStatus
  readOnly: boolean
  dispatched_at: string
  completed_at?: string
  output?: string
  error?: string
  phase?: number
  strategyHash: string
  parentId?: string
}

const JOBS_DIR = path.join(process.cwd(), '.jobs')

async function ensureDir() {
  await fs.mkdir(JOBS_DIR, { recursive: true })
}

export function createJob(fields: Omit<Job, 'id' | 'dispatched_at'>): Job {
  return {
    ...fields,
    id: randomUUID(),
    dispatched_at: new Date().toISOString(),
  }
}

export async function writeJob(job: Job): Promise<void> {
  await ensureDir()
  const p = path.join(JOBS_DIR, `${job.id}.json`)
  await writeFileAtomic(p, JSON.stringify(job, null, 2))
}

export async function readJob(id: string): Promise<Job | null> {
  const p = path.join(JOBS_DIR, `${id}.json`)
  try {
    const raw = await fs.readFile(p, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function listJobs(): Promise<Job[]> {
  if (!existsSync(JOBS_DIR)) return []
  const files = await fs.readdir(JOBS_DIR)
  const jobs: Job[] = []
  for (const f of files) {
    if (!f.endsWith('.json')) continue
    try {
      const raw = await fs.readFile(path.join(JOBS_DIR, f), 'utf-8')
      jobs.push(JSON.parse(raw))
    } catch { /* skip corrupt files */ }
  }
  return jobs.sort((a, b) => b.dispatched_at.localeCompare(a.dispatched_at))
}
