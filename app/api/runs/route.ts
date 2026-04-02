import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { execSync } from 'child_process'
import { resolve } from 'path'

const REPO_ROOT = resolve(process.cwd(), '..')

function isRemote() {
  return !!(process.env.GITHUB_TOKEN && process.env.GITHUB_REPO)
}

async function getRunsFromAPI() {
  const { GITHUB_TOKEN, GITHUB_REPO } = process.env
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/actions/runs?per_page=20`,
    {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      cache: 'no-store',
    },
  )
  if (!res.ok) throw new Error(`GitHub API ${res.status}`)
  const data = await res.json()
  return (data.workflow_runs || []).map((r: Record<string, unknown>) => ({
    id: r.id,
    workflow: r.display_title || r.name,
    status: r.status,
    conclusion: r.conclusion,
    created_at: r.created_at,
    url: r.html_url,
  }))
}

export async function GET(req: NextRequest) {
  const authErr = requireAuth(req); if (authErr) return authErr
  try {
    if (isRemote()) {
      const runs = await getRunsFromAPI()
      return NextResponse.json({ runs })
    }

    const out = execSync(
      'gh run list --json databaseId,name,status,conclusion,createdAt,url,displayTitle --limit 20',
      { stdio: 'pipe', cwd: REPO_ROOT },
    ).toString()
    const raw = JSON.parse(out)
    const runs = raw.map((r: Record<string, unknown>) => ({
      id: r.databaseId,
      workflow: r.displayTitle || r.name,
      status: r.status,
      conclusion: r.conclusion,
      created_at: r.createdAt,
      url: r.url,
    }))
    return NextResponse.json({ runs })
  } catch {
    return NextResponse.json({ runs: [] })
  }
}
