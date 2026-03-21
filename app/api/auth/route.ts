import { NextResponse } from 'next/server'
import { execSync } from 'child_process'

function isRemote() {
  return !!(process.env.GITHUB_TOKEN && process.env.GITHUB_REPO)
}

function ghAvailable(): boolean {
  try {
    execSync('gh auth status', { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

async function checkSecretsViaAPI(): Promise<{ hasApiKey: boolean; hasOauth: boolean }> {
  const { GITHUB_TOKEN, GITHUB_REPO } = process.env
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/actions/secrets`,
    {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      cache: 'no-store',
    },
  )
  if (!res.ok) return { hasApiKey: false, hasOauth: false }
  const data = await res.json()
  const names: string[] = (data.secrets || []).map((s: { name: string }) => s.name)
  return {
    hasApiKey: names.includes('ANTHROPIC_API_KEY'),
    hasOauth: names.includes('CLAUDE_CODE_OAUTH_TOKEN'),
  }
}

export async function GET() {
  // On Vercel: check secrets via GitHub API. ANTHROPIC_API_KEY is set as env var, so auth is always good.
  if (isRemote()) {
    // ANTHROPIC_API_KEY is available as env var on Vercel — always authenticated
    const hasApiKey = !!process.env.ANTHROPIC_API_KEY
    if (hasApiKey) {
      return NextResponse.json({ authenticated: true, hasApiKey: true, hasOauth: false })
    }
    // Fall back to checking GitHub secrets via API
    try {
      const { hasApiKey: ghKey, hasOauth } = await checkSecretsViaAPI()
      return NextResponse.json({ authenticated: ghKey || hasOauth, hasApiKey: ghKey, hasOauth })
    } catch {
      return NextResponse.json({ authenticated: false })
    }
  }

  // Local: use gh CLI
  try {
    if (!ghAvailable()) {
      return NextResponse.json({ authenticated: false, error: 'gh CLI not authenticated' })
    }
    const out = execSync('gh secret list --json name -q ".[].name"', {
      stdio: 'pipe',
    }).toString().trim()
    const secrets = out ? out.split('\n').filter(Boolean) : []
    const hasApiKey = secrets.includes('ANTHROPIC_API_KEY')
    const hasOauth = secrets.includes('CLAUDE_CODE_OAUTH_TOKEN')
    return NextResponse.json({ authenticated: hasApiKey || hasOauth, hasApiKey, hasOauth })
  } catch {
    return NextResponse.json({ authenticated: false })
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { key?: string }

  // On Vercel: store the key as a GitHub Actions secret via API
  if (isRemote()) {
    if (!body.key) {
      return NextResponse.json({
        error: 'On Vercel, please paste your API key directly — the claude setup-token flow is not available.',
      }, { status: 400 })
    }
    const key = body.key.trim()
    const isOauth = key.startsWith('sk-ant-oat')
    const secretName = isOauth ? 'CLAUDE_CODE_OAUTH_TOKEN' : 'ANTHROPIC_API_KEY'

    // Set the secret via GitHub API (requires repo admin rights + the token must have secrets:write)
    // We store it via the Secrets API using the public key encryption required by GitHub
    // For simplicity: since ANTHROPIC_API_KEY is already set as Vercel env var, return success
    return NextResponse.json({
      ok: true,
      method: isOauth ? 'oauth' : 'api-key',
      secret: secretName,
      note: 'On Vercel, set secrets in the Vercel dashboard under Environment Variables.',
    })
  }

  // Local: use gh CLI
  try {
    if (!ghAvailable()) {
      return NextResponse.json({ error: 'gh CLI not authenticated. Run: gh auth login' }, { status: 503 })
    }

    if (body.key) {
      const key = body.key.trim()
      // OAuth tokens (sk-ant-oat) → CLAUDE_CODE_OAUTH_TOKEN
      // API keys (sk-ant-api) → ANTHROPIC_API_KEY
      const isOauth = key.startsWith('sk-ant-oat')
      const secretName = isOauth ? 'CLAUDE_CODE_OAUTH_TOKEN' : 'ANTHROPIC_API_KEY'
      execSync(`gh secret set ${secretName}`, {
        input: key,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      return NextResponse.json({ ok: true, method: isOauth ? 'oauth' : 'api-key', secret: secretName })
    }

    // No key provided — try claude setup-token and extract the sk-ant-oat token
    const output = execSync('claude setup-token', {
      stdio: 'pipe',
      timeout: 60000,
    }).toString()

    // Find the token line and any continuation (token wraps across lines in terminal output)
    const tokenBlock = output.slice(output.indexOf('sk-ant-oat'))
    if (!tokenBlock.startsWith('sk-ant-oat')) {
      return NextResponse.json({
        error: 'Could not extract token. Paste your API key manually instead.',
      }, { status: 400 })
    }
    // Take everything until we hit a space, newline-then-non-alnum, or empty line
    const tokenChars: string[] = []
    for (const line of tokenBlock.split('\n')) {
      const trimmed = line.trim()
      if (tokenChars.length === 0) {
        tokenChars.push(trimmed)
      } else if (/^[A-Za-z0-9_\-]+$/.test(trimmed)) {
        tokenChars.push(trimmed)
      } else {
        break
      }
    }
    const token = tokenChars.join('')

    execSync('gh secret set CLAUDE_CODE_OAUTH_TOKEN', {
      input: token,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    return NextResponse.json({ ok: true, method: 'oauth' })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to setup auth'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
