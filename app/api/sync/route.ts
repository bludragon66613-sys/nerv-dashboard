import { NextResponse } from 'next/server'
import { execSync } from 'child_process'
import { resolve } from 'path'

const REPO_ROOT = resolve(process.cwd(), '..')

function isRemote() {
  return !!(process.env.GITHUB_TOKEN && process.env.GITHUB_REPO)
}

function run(cmd: string) {
  return execSync(cmd, { stdio: 'pipe', cwd: REPO_ROOT }).toString().trim()
}

export async function GET() {
  // On Vercel: changes go directly to GitHub via API — no local git needed
  if (isRemote()) {
    return NextResponse.json({ hasChanges: false, changedFiles: 0 })
  }

  try {
    const status = run('git status --porcelain')
    const hasChanges = status.length > 0
    const changedFiles = hasChanges ? status.split('\n').length : 0
    return NextResponse.json({ hasChanges, changedFiles })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to check status'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST() {
  // On Vercel: changes are already committed to GitHub via the GitHub API — nothing to sync
  if (isRemote()) {
    return NextResponse.json({ ok: true, message: 'Changes are saved directly to GitHub via API' })
  }

  try {
    const status = run('git status --porcelain')
    if (!status) {
      return NextResponse.json({ ok: true, message: 'Already in sync' })
    }

    run('git add -A')

    try {
      run('git commit -m "chore: update config from dashboard"')
    } catch {
      return NextResponse.json({ ok: true, message: 'Nothing to commit' })
    }

    try {
      run('git push')
    } catch (e: unknown) {
      const pushErr = e instanceof Error ? e.message : 'Push failed'
      // Commit succeeded but push failed — still useful feedback
      return NextResponse.json({
        error: `Committed locally but push failed: ${pushErr.slice(0, 200)}`,
      }, { status: 500 })
    }

    return NextResponse.json({ ok: true, message: 'Pushed to GitHub' })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to sync'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
