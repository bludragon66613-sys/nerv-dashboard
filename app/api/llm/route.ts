import { NextRequest, NextResponse } from 'next/server'
import { execSync } from 'child_process'
import { requireAuth } from '@/lib/auth'

export interface LLMProvider {
  id: string
  name: string
  secretName: string
  autoDetectable: boolean
  keyPlaceholder: string
  connected: boolean
}

const PROVIDERS: Omit<LLMProvider, 'connected'>[] = [
  { id: 'claude',  name: 'Claude',  secretName: 'CLAUDE_CODE_OAUTH_TOKEN', autoDetectable: true,  keyPlaceholder: 'sk-ant-oat... or sk-ant-api...' },
  { id: 'openai',  name: 'OpenAI',  secretName: 'OPENAI_API_KEY',          autoDetectable: false, keyPlaceholder: 'sk-proj-...' },
  { id: 'gemini',  name: 'Gemini',  secretName: 'GEMINI_API_KEY',          autoDetectable: false, keyPlaceholder: 'AIza...' },
  { id: 'grok',    name: 'Grok',    secretName: 'XAI_API_KEY',             autoDetectable: false, keyPlaceholder: 'xai-...' },
]

function ghAvailable(): boolean {
  try { execSync('gh auth status', { stdio: 'pipe' }); return true } catch { return false }
}

function getConnectedSecrets(): Set<string> {
  try {
    if (!ghAvailable()) return new Set()
    const out = execSync('gh secret list --json name -q ".[].name"', { stdio: 'pipe' }).toString().trim()
    return new Set(out ? out.split('\n').filter(Boolean) : [])
  } catch {
    return new Set()
  }
}

export async function GET(req: NextRequest) {
  const authErr = requireAuth(req)
  if (authErr) return authErr

  const connected = getConnectedSecrets()
  const providers: LLMProvider[] = PROVIDERS.map(p => ({
    ...p,
    connected: connected.has(p.secretName),
  }))
  return NextResponse.json({ providers })
}

export async function POST(req: NextRequest) {
  const authErr = requireAuth(req)
  if (authErr) return authErr

  const body = await req.json().catch(() => ({})) as { provider?: string; key?: string }
  const { provider: providerId, key } = body

  const provider = PROVIDERS.find(p => p.id === providerId)
  if (!provider) return NextResponse.json({ error: 'Unknown provider' }, { status: 400 })

  if (!ghAvailable()) {
    return NextResponse.json({ error: 'gh CLI not authenticated. Run: gh auth login' }, { status: 503 })
  }

  // Manual key provided — validate and save
  if (key) {
    const trimmed = key.trim()
    // Claude: detect OAuth vs API key and route to correct secret
    const secretName = (provider.id === 'claude' && trimmed.startsWith('sk-ant-api'))
      ? 'ANTHROPIC_API_KEY'
      : provider.secretName
    execSync(`gh secret set ${secretName}`, {
      input: trimmed,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return NextResponse.json({ ok: true, method: 'manual', secret: secretName })
  }

  // Auto-detect — only supported for Claude via ~/.claude/.credentials.json
  if (provider.autoDetectable) {
    const os = await import('os')
    const path = await import('path')
    const fs = await import('fs/promises')
    const credPath = path.join(os.homedir(), '.claude', '.credentials.json')
    const raw = await fs.readFile(credPath, 'utf8').catch(() => null)
    if (!raw) {
      return NextResponse.json({ error: 'No Claude credentials found', needsKey: true }, { status: 400 })
    }
    const creds = JSON.parse(raw)
    const token = creds?.claudeAiOauth?.accessToken
    if (!token || !token.startsWith('sk-ant-oat')) {
      return NextResponse.json({ error: 'No OAuth token found', needsKey: true }, { status: 400 })
    }
    execSync(`gh secret set ${provider.secretName}`, {
      input: token,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return NextResponse.json({ ok: true, method: 'auto' })
  }

  // Non-auto provider with no key
  return NextResponse.json({ error: 'Paste an API key to connect', needsKey: true }, { status: 400 })
}
