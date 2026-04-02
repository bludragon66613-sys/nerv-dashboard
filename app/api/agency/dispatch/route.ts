import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createHash } from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { createJob, writeJob } from '@/lib/jobs'

const STRATEGY_PATH = path.join(os.homedir(), 'aigency02', 'strategy', 'nexus-strategy.md')
const AEON_REPO = process.env.AEON_REPO || ''
const AEON_WORKFLOW_FILE = process.env.AEON_WORKFLOW_FILE || 'aeon.yml'
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || ''
const OPENCLAW_PROXY_URL = process.env.OPENCLAW_PROXY_URL || 'http://localhost:5557'
const OPENCLAW_PROXY_SECRET = process.env.OPENCLAW_PROXY_SECRET || ''

async function currentStrategyHash(): Promise<string> {
  try {
    const content = await fs.readFile(STRATEGY_PATH, 'utf-8')
    return createHash('sha256').update(content).digest('hex')
  } catch {
    return ''
  }
}

function mapGhStatus(status: number): string {
  if (status === 401 || status === 403) return 'failed:auth'
  if (status === 422) return 'failed:invalid-skill'
  if (status === 429) return 'failed:rate-limited'
  if (status >= 500) return 'failed:github-error'
  return 'failed:unknown'
}

export async function POST(req: NextRequest) {
  const authErr = requireAuth(req); if (authErr) return authErr

  const body = await req.json().catch(() => ({})) as {
    skill?: string
    mode?: string
    dispatchType?: string
    readOnly?: boolean
    strategyHash?: string
    scenarioName?: string
    activationPrompt?: string
  }

  const { skill, mode = 'micro', dispatchType = 'aeon', readOnly = true, strategyHash = '', scenarioName } = body
  if (!skill) return NextResponse.json({ error: 'Missing skill' }, { status: 400 })

  // Verify strategy hash if provided
  if (strategyHash) {
    const current = await currentStrategyHash()
    if (current && current !== strategyHash) {
      return NextResponse.json(
        { error: 'Strategy file changed since classification. Please re-submit.' },
        { status: 409 }
      )
    }
  }

  const job = createJob({
    skill: scenarioName || skill,
    mode,
    dispatchType,
    status: 'pending',
    readOnly,
    strategyHash,
  })
  await writeJob({ ...job, status: 'running' })

  try {
    if (dispatchType === 'aeon') {
      // Dispatch to GitHub Actions
      const res = await fetch(
        `https://api.github.com/repos/${AEON_REPO}/actions/workflows/${AEON_WORKFLOW_FILE}/dispatches`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${GITHUB_TOKEN}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          body: JSON.stringify({ ref: 'main', inputs: { skill } }),
        }
      )
      if (!res.ok) {
        const errText = await res.text()
        const errStatus = mapGhStatus(res.status) as typeof job.status
        await writeJob({ ...job, status: errStatus, error: errText.slice(0, 500), completed_at: new Date().toISOString() })
        return NextResponse.json({ error: errText, status: errStatus }, { status: res.status })
      }
      await writeJob({ ...job, status: 'running' })
      return NextResponse.json({ ok: true, jobId: job.id })
    }

    if (dispatchType === 'local') {
      // Dispatch via OpenClaw proxy
      const prompt = body.activationPrompt || `NERV Command Center — Authorized dispatch from Totoro\n\nActivate agent: ${skill}\n\nComplete your task and report back with a structured summary of your output.`
      const res = await fetch(`${OPENCLAW_PROXY_URL}/dispatch`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENCLAW_PROXY_SECRET}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ agent: skill, prompt }),
      })
      if (!res.ok) {
        const errText = await res.text()
        await writeJob({ ...job, status: 'failed:unknown', error: errText.slice(0, 500), completed_at: new Date().toISOString() })
        return NextResponse.json({ error: errText }, { status: res.status })
      }
      const data = await res.json()
      await writeJob({ ...job, status: 'completed', output: (typeof data.result === 'object' ? JSON.stringify(data.result) : String(data.result || '')).slice(0, 2000), completed_at: new Date().toISOString() })
      return NextResponse.json({ ok: true, jobId: job.id })
    }

    if (dispatchType === 'nexus-scenario') {
      // Phase 0 only — parse runbook and dispatch each Phase 0 agent
      const runbookName = scenarioName || skill
      const runbookPath = path.join(os.homedir(), 'aigency02', 'strategy', 'runbooks', `scenario-${runbookName}.md`)
      let runbookContent: string
      try {
        runbookContent = await fs.readFile(runbookPath, 'utf-8')
      } catch {
        await writeJob({ ...job, status: 'failed:parse-error', error: `Runbook not found: ${runbookPath}`, completed_at: new Date().toISOString() })
        return NextResponse.json({ error: `Runbook not found: scenario-${runbookName}.md` }, { status: 404 })
      }

      // Extract Phase 0 agents — lines under "## Phase 0" heading containing kebab-case agent names
      const phase0Match = runbookContent.match(/##\s*phase\s*0[:\s\S]*?(?=\n##|$)/i)
      const phase0Agents: string[] = []
      if (phase0Match) {
        const agentLines = phase0Match[0].match(/[-*]\s+([a-z][a-z0-9-]+)/gi) || []
        for (const line of agentLines) {
          const name = line.replace(/^[-*]\s+/, '').toLowerCase().trim()
          if (name) phase0Agents.push(name)
        }
      }
      if (phase0Agents.length === 0) phase0Agents.push(skill)

      // Extract agent role descriptions from the Agent Roster table for richer prompts
      const agentRoles: Record<string, string> = {}
      const rosterRows = runbookContent.matchAll(/\|\s*\*?\*?([^|]+?)\*?\*?\s*\|\s*([^|]+?)\s*\|/g)
      for (const row of rosterRows) {
        const label = row[1].trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
        const role = row[2].trim()
        if (label && role && !role.toLowerCase().includes('role') && !role.toLowerCase().includes('---')) {
          agentRoles[label] = role
        }
      }

      // Build authorized prompt for a given agent
      function buildPhase0Prompt(agentName: string): string {
        const role = agentRoles[agentName] || agentRoles[agentName.replace(/-/g, '')] || ''
        const roleContext = role ? `Your role in this scenario: ${role}` : ''
        return [
          `NERV Command Center — Authorized dispatch from Totoro`,
          ``,
          `Scenario: ${runbookName}`,
          `Phase: 0 (Kickoff)`,
          `Agent: ${agentName}`,
          roleContext,
          ``,
          `You are being activated as part of a coordinated multi-agent scenario kickoff.`,
          `Review the scenario name and your role, then complete your Phase 0 responsibilities.`,
          `Deliver your output as a structured report back via this channel.`,
          ``,
          `Phase 0 context:`,
          (phase0Match?.[0] || '').slice(0, 800).trim(),
        ].filter(Boolean).join('\n')
      }

      // Write parent job
      const parentJob = { ...job, status: 'running' as const }
      await writeJob(parentJob)

      // Dispatch child jobs
      const { createJob: mkJob, writeJob: wJob } = await import('@/lib/jobs')
      for (const agentSkill of phase0Agents) {
        const child = mkJob({
          skill: agentSkill,
          mode: 'micro',
          dispatchType: 'local',
          status: 'pending',
          readOnly: true,
          strategyHash,
          parentId: job.id,
          phase: 0,
        })
        await wJob({ ...child, status: 'running' })

        // Best-effort local dispatch (fire and forget)
        fetch(`${OPENCLAW_PROXY_URL}/dispatch`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${OPENCLAW_PROXY_SECRET}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent: agentSkill, prompt: buildPhase0Prompt(agentSkill) }),
        }).then(async r => {
          const d = await r.json().catch(() => ({}))
          const childStatus = r.ok ? 'completed' : 'failed:unknown'
          await wJob({
            ...child,
            status: childStatus,
            output: (typeof d.result === 'object' ? JSON.stringify(d.result) : String(d.result || '')).slice(0, 2000),
            error: !r.ok ? (String(d.error || d.message || JSON.stringify(d)).slice(0, 500) || `HTTP ${r.status}`) : undefined,
            completed_at: new Date().toISOString(),
          })
        }).catch(async err => {
          await wJob({ ...child, status: 'failed:unknown', error: String(err), completed_at: new Date().toISOString() })
        })
      }

      return NextResponse.json({
        ok: true,
        jobId: job.id,
        phase0Agents,
        message: 'Phase 0 dispatched. Manual phase advancement coming soon.',
      })
    }

    return NextResponse.json({ error: 'Unknown dispatchType' }, { status: 400 })
  } catch (err) {
    console.error('[dispatch]', err)
    await writeJob({ ...job, status: 'failed:unknown', error: String(err), completed_at: new Date().toISOString() })
    return NextResponse.json({ error: 'Dispatch failed' }, { status: 500 })
  }
}
