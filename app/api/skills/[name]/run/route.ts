import { NextResponse } from 'next/server'
import { execSync } from 'child_process'
import { resolve } from 'path'

const REPO_ROOT = resolve(process.cwd(), '..')

function isRemote() {
  return !!(process.env.GITHUB_TOKEN && process.env.GITHUB_REPO)
}

async function triggerViaAPI(skill: string, skillVar?: string, model?: string) {
  const { GITHUB_TOKEN, GITHUB_REPO } = process.env
  const inputs: Record<string, string> = { skill }
  if (skillVar) inputs.var = skillVar
  if (model) inputs.model = model

  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/aeon.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main', inputs }),
      cache: 'no-store',
    },
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`GitHub API ${res.status}: ${text}`)
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    const { name } = await params

    if (!/^[a-z][a-z0-9-]*$/.test(name)) {
      return NextResponse.json({ error: 'Invalid skill name' }, { status: 400 })
    }

    let skillVar = ''
    let model = ''
    try {
      const body = await request.json()
      if (body.var && typeof body.var === 'string') {
        skillVar = body.var.replace(/[^a-zA-Z0-9_ .\-/#@]/g, '')
      }
      if (body.model && typeof body.model === 'string') {
        model = body.model.replace(/[^a-zA-Z0-9_\-]/g, '')
      }
    } catch { /* no body is fine */ }

    if (isRemote()) {
      await triggerViaAPI(name, skillVar, model)
      return NextResponse.json({ ok: true })
    }

    let cmd = `gh workflow run aeon.yml -f skill=${name}`
    if (skillVar) cmd += ` -f var=${JSON.stringify(skillVar)}`
    if (model) cmd += ` -f model=${JSON.stringify(model)}`

    execSync(cmd, { stdio: 'pipe', cwd: REPO_ROOT })
    return NextResponse.json({ ok: true })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to trigger run'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
