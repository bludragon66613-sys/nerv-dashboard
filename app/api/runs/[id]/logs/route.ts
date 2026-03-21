import { NextResponse } from 'next/server'
import { execSync } from 'child_process'
import { resolve } from 'path'

const REPO_ROOT = resolve(process.cwd(), '..')

function isRemote() {
  return !!(process.env.GITHUB_TOKEN && process.env.GITHUB_REPO)
}

async function getRunInfoFromAPI(id: string) {
  const { GITHUB_TOKEN, GITHUB_REPO } = process.env
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/actions/runs/${id}`,
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
  return res.json()
}

async function getRunLogsFromAPI(id: string): Promise<string> {
  const { GITHUB_TOKEN, GITHUB_REPO } = process.env
  // GitHub returns a redirect to a zip download for logs — fetch the zip URL
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/actions/runs/${id}/logs`,
    {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      redirect: 'follow',
      cache: 'no-store',
    },
  )
  // The API returns a redirect to a zip. We can't unzip in-process easily.
  // Return a link instead so the user can open it on GitHub.
  if (res.status === 302 || res.redirected) {
    return `(Logs available as a zip download — click "Open on GitHub" to view full logs)`
  }
  if (!res.ok) return `(Logs not available: GitHub API ${res.status})`
  return `(Logs available — click "Open on GitHub" to view)`
}

function extractSummaryAndFilter(logs: string): { output: string; summaryLines: string[] } {
  // Extract the interesting part: the "Run" step output from Claude
  // Lines look like: "jobName<TAB>stepName<TAB>logLine"
  const lines = logs.split('\n')
  const runStepLines: string[] = []
  let inRunStep = false

  for (const line of lines) {
    const parts = line.split('\t')
    if (parts.length >= 3) {
      const stepName = parts[1]
      if (stepName === 'Run' || stepName === 'Collect and dispatch messages') {
        inRunStep = true
        runStepLines.push(parts.slice(2).join('\t'))
      } else if (inRunStep && stepName !== 'Run' && stepName !== 'Collect and dispatch messages') {
        inRunStep = false
      }
    } else if (inRunStep) {
      runStepLines.push(line)
    }
  }

  const output = runStepLines.length > 0 ? runStepLines.join('\n') : logs

  // Extract the ## Summary block that Claude outputs at the end of each skill run
  const outputLines = output.split('\n')
  const summaryLines: string[] = []
  let inSummary = false
  for (const line of outputLines) {
    // Strip ANSI escape codes and GitHub Actions timestamp prefix (e.g. "2026-03-19T23:20:35.6487406Z ")
    const clean = line
      .replace(/\x1b\[[0-9;]*m/g, '')
      .replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s?/, '')
    if (/^#{1,3}\s+Summary/.test(clean)) {
      inSummary = true
      summaryLines.push(line)
    } else if (inSummary) {
      // Stop at the next heading (## level) but allow ### subheadings
      if (/^#{1,2}\s+/.test(clean) && !/^###/.test(clean)) {
        break
      }
      summaryLines.push(line)
    }
  }

  return { output, summaryLines }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    // Validate run ID
    if (!/^\d+$/.test(id)) {
      return NextResponse.json({ error: 'Invalid run ID' }, { status: 400 })
    }

    if (isRemote()) {
      // Use GitHub REST API — no gh CLI available on Vercel
      const info = await getRunInfoFromAPI(id)
      const logsText = await getRunLogsFromAPI(id)

      return NextResponse.json({
        id,
        title: info.display_title || info.name,
        status: info.status,
        conclusion: info.conclusion,
        logs: logsText,
        summary: '',
      })
    }

    // Local: use gh CLI
    const infoRaw = execSync(
      `gh run view ${id} --json status,conclusion,displayTitle,jobs`,
      { stdio: 'pipe', cwd: REPO_ROOT, timeout: 15000 },
    ).toString()
    const info = JSON.parse(infoRaw)

    // Get logs — use --log-failed for failed runs, --log for completed
    let logs = ''
    try {
      const logCmd = info.conclusion === 'failure'
        ? `gh run view ${id} --log-failed`
        : `gh run view ${id} --log`
      logs = execSync(logCmd, {
        stdio: 'pipe',
        cwd: REPO_ROOT,
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024,
      }).toString()
    } catch {
      // Log fetch can fail for in-progress runs
      logs = '(Logs not available yet — run may still be in progress)'
    }

    const { output, summaryLines } = extractSummaryAndFilter(logs)

    // Trim to last 500 lines max
    const trimmedLines = output.split('\n')
    const trimmed = trimmedLines.length > 500
      ? '... (truncated, showing last 500 lines)\n' + trimmedLines.slice(-500).join('\n')
      : output

    return NextResponse.json({
      id,
      title: info.displayTitle,
      status: info.status,
      conclusion: info.conclusion,
      logs: trimmed,
      summary: summaryLines.length > 0 ? summaryLines.join('\n') : '',
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to fetch logs'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
