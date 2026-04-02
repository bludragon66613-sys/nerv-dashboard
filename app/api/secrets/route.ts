import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { execSync } from 'child_process'

const BUILTIN_SECRETS = [
  { name: 'CLAUDE_CODE_OAUTH_TOKEN', group: 'Core', description: 'Claude Code OAuth token (set via Authenticate button)', either: 'auth' },
  { name: 'ANTHROPIC_API_KEY', group: 'Core', description: 'Anthropic API key for Claude Code', either: 'auth' },
  { name: 'TELEGRAM_BOT_TOKEN', group: 'Telegram', description: 'Bot token from @BotFather' },
  { name: 'TELEGRAM_CHAT_ID', group: 'Telegram', description: 'Your chat ID' },
  { name: 'DISCORD_BOT_TOKEN', group: 'Discord', description: 'Discord bot token' },
  { name: 'DISCORD_CHANNEL_ID', group: 'Discord', description: 'Channel ID for messages' },
  { name: 'DISCORD_WEBHOOK_URL', group: 'Discord', description: 'Webhook URL for notifications' },
  { name: 'SLACK_BOT_TOKEN', group: 'Slack', description: 'Slack bot OAuth token' },
  { name: 'SLACK_CHANNEL_ID', group: 'Slack', description: 'Channel ID for messages' },
  { name: 'SLACK_WEBHOOK_URL', group: 'Slack', description: 'Webhook URL for notifications' },
  { name: 'XAI_API_KEY', group: 'Skill Keys', description: 'xAI/Grok API key (for tweet skills)' },
  { name: 'COINGECKO_API_KEY', group: 'Skill Keys', description: 'CoinGecko API key (for crypto skills)' },
  { name: 'ALCHEMY_API_KEY', group: 'Skill Keys', description: 'Alchemy API key (for on-chain skills)' },
  { name: 'GH_GLOBAL', group: 'Skill Keys', description: 'GitHub PAT with cross-repo access' },
]

const BUILTIN_NAMES = new Set(BUILTIN_SECRETS.map(s => s.name))

// Valid env var name pattern
const VALID_SECRET_NAME = /^[A-Z][A-Z0-9_]{1,}$/

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

function listSecrets(): string[] {
  try {
    const out = execSync('gh secret list --json name -q ".[].name"', {
      stdio: 'pipe',
      cwd: process.cwd(),
    }).toString().trim()
    return out ? out.split('\n').filter(Boolean) : []
  } catch {
    return []
  }
}

async function listSecretsViaAPI(): Promise<string[]> {
  const { GITHUB_TOKEN, GITHUB_REPO } = process.env
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/actions/secrets?per_page=100`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        cache: 'no-store',
      },
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data.secrets || []).map((s: { name: string }) => s.name)
  } catch {
    return []
  }
}

export async function GET(req: NextRequest) {
  const authErr = requireAuth(req); if (authErr) return authErr
  if (isRemote()) {
    // On Vercel: check GitHub Actions secrets via API
    const secretNames = await listSecretsViaAPI()
    const setSecrets = new Set(secretNames)

    const secrets = BUILTIN_SECRETS.map(s => ({
      ...s,
      isSet: setSecrets.has(s.name),
    }))

    for (const name of setSecrets) {
      if (!BUILTIN_NAMES.has(name)) {
        secrets.push({ name, group: 'Skill Keys', description: 'Custom secret', isSet: true })
      }
    }

    return NextResponse.json({ secrets, ghReady: true })
  }

  // Local: use gh CLI
  if (!ghAvailable()) {
    return NextResponse.json({
      error: 'GitHub CLI not authenticated. Run: gh auth login',
      ghReady: false,
    }, { status: 503 })
  }

  const setSecrets = new Set(listSecrets())

  // Start with builtin secrets
  const secrets = BUILTIN_SECRETS.map(s => ({
    ...s,
    isSet: setSecrets.has(s.name),
  }))

  // Add any GitHub secrets not in builtins as custom "Skill Keys"
  for (const name of setSecrets) {
    if (!BUILTIN_NAMES.has(name)) {
      secrets.push({ name, group: 'Skill Keys', description: 'Custom secret', isSet: true })
    }
  }

  return NextResponse.json({ secrets, ghReady: true })
}

export async function POST(request: NextRequest) {
  const authErr = requireAuth(request); if (authErr) return authErr
  const body = await request.json().catch(() => ({})) as { name?: string; value?: string }
  const { name, value } = body

  if (!name || !value) {
    return NextResponse.json({ error: 'name and value required' }, { status: 400 })
  }

  if (!VALID_SECRET_NAME.test(name)) {
    return NextResponse.json({ error: 'Invalid secret name — use UPPER_SNAKE_CASE' }, { status: 400 })
  }

  if (isRemote()) {
    // On Vercel: secrets must be set via the Vercel dashboard or GitHub API (requires public key encryption)
    return NextResponse.json({
      error: 'On Vercel, set GitHub Actions secrets in your GitHub repository settings → Secrets and variables → Actions.',
    }, { status: 503 })
  }

  if (!ghAvailable()) {
    return NextResponse.json({ error: 'GitHub CLI not authenticated' }, { status: 503 })
  }

  try {
    // Use stdin to avoid shell injection
    execSync(`gh secret set ${name}`, {
      input: value,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return NextResponse.json({ ok: true })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to set secret'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const authErr = requireAuth(request); if (authErr) return authErr
  const body = await request.json().catch(() => ({})) as { name?: string }
  const { name } = body

  if (!name || !VALID_SECRET_NAME.test(name)) {
    return NextResponse.json({ error: 'Invalid secret name' }, { status: 400 })
  }

  if (isRemote()) {
    return NextResponse.json({
      error: 'On Vercel, delete GitHub Actions secrets in your GitHub repository settings → Secrets and variables → Actions.',
    }, { status: 503 })
  }

  if (!ghAvailable()) {
    return NextResponse.json({ error: 'GitHub CLI not authenticated' }, { status: 503 })
  }

  try {
    execSync(`gh secret delete ${name}`, { stdio: 'pipe', cwd: process.cwd() })
    return NextResponse.json({ ok: true })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to delete secret'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
