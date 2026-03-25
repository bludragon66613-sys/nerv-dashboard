import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import fs from 'fs/promises'
import path from 'path'
import { resolve } from 'path'
import { execSync, execFileSync } from 'child_process'

const REPO_ROOT = resolve(process.cwd(), '..')
const LOGS_DIR = path.join(REPO_ROOT, 'memory', 'logs')

export interface Memo {
  filename: string
  date: string
  focus: string
  excerpt: string
  body: string
  mtime: number
}

function extractExcerpt(body: string): string {
  const execMatch = body.match(/## Executive Summary\n+([\s\S]*?)(?:\n---|\n##)/m)
  if (execMatch) return execMatch[1].trim().slice(0, 200)
  return body.replace(/^#.*/gm, '').trim().slice(0, 200)
}

function extractFocus(body: string): string {
  const m = body.match(/Focus:\s*\*\*(.+?)\*\*/)
  return m ? m[1] : 'All domains'
}

export async function GET(req: NextRequest) {
  const authErr = requireAuth(req); if (authErr) return authErr
  try {
    const dirEntries = await fs.readdir(LOGS_DIR).catch(() => null)
    if (!dirEntries) {
      return NextResponse.json({ memos: [], lastRun: null })
    }
    const files = dirEntries
      .filter(f => f.startsWith('rd-council-') && f.endsWith('.md'))
      .sort().reverse()

    const memos: Memo[] = await Promise.all(files.map(async filename => {
      const fp = path.join(LOGS_DIR, filename)
      const [body, stat] = await Promise.all([fs.readFile(fp, 'utf-8'), fs.stat(fp)])
      const dateMatch = filename.match(/rd-council-(\d{4}-\d{2}-\d{2})/)
      return {
        filename,
        date: dateMatch ? dateMatch[1] : filename,
        focus: extractFocus(body),
        excerpt: extractExcerpt(body),
        body,
        mtime: stat.mtimeMs,
      }
    }))

    // last gh run for rd-council
    let lastRun: string | null = null
    try {
      const out = execSync(
        'gh run list --workflow=rd-council-cron.yml --json createdAt,conclusion,status --limit 1',
        { stdio: 'pipe', cwd: REPO_ROOT }
      ).toString()
      const runs = JSON.parse(out)
      if (runs[0]) lastRun = JSON.stringify(runs[0])
    } catch { /* silent */ }

    return NextResponse.json({ memos, lastRun })
  } catch (err) {
    console.error('[rnd GET]', err)
    return NextResponse.json({ memos: [], lastRun: null, error: 'Failed to load R&D memos' })
  }
}

export async function POST(request: NextRequest) {
  const authErr = requireAuth(request); if (authErr) return authErr
  try {
    const body = await request.json().catch(() => ({}))
    const focus = (body.focus || '').replace(/[^a-zA-Z0-9_ .\-/#@]/g, '').slice(0, 80)
    const model = (body.model || 'claude-sonnet-4-6').replace(/[^a-zA-Z0-9_\-]/g, '')

    const args = ['workflow', 'run', 'rd-council-cron.yml']
    if (focus) args.push('-f', `focus=${focus}`)
    if (model) args.push('-f', `model=${model}`)

    execFileSync('gh', args, { stdio: 'pipe', cwd: REPO_ROOT })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[rnd POST]', err)
    return NextResponse.json({ error: 'Failed to trigger R&D run' }, { status: 500 })
  }
}
