import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import { readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const run = promisify(exec)

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '')
}

async function sh(cmd: string, timeout = 15000): Promise<{ ok: boolean; out: string }> {
  try {
    const { stdout, stderr } = await run(cmd, { timeout, shell: 'bash' })
    return { ok: true, out: (stdout || stderr).trim() }
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string }
    return { ok: false, out: (err.stdout || err.stderr || err.message || '').trim() }
  }
}

function readConfig() {
  try {
    const configPath = join(homedir(), '.openclaw', 'openclaw.json')
    return JSON.parse(readFileSync(configPath, 'utf8'))
  } catch {
    return null
  }
}

// GET — full diagnostics dashboard data
export async function GET() {
  const config = readConfig()

  // Run checks in parallel for speed
  const [healthRes, tgRes, statusRes, authRes, gwProc, zombieRes] = await Promise.all([
    sh('curl -sf http://localhost:18789/health'),
    sh('curl -sf "https://api.telegram.org/bot8573892946:AAFzDV6eDwiOr_Azj-eKOODV9UD-Fpf-LD4/getMe"'),
    sh('openclaw status 2>&1'),
    sh('openclaw models status 2>&1'),
    sh(`powershell -c "(Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { (Get-CimInstance Win32_Process -Filter \\"ProcessId=\\$(\\$_.Id)\\").CommandLine -like '*openclaw*' }).Count"`),
    sh(`powershell -c "(Get-CimInstance Win32_Process | Where-Object { \\$_.Name -eq 'cmd.exe' -and \\$_.CommandLine -like '*gateway.cmd*' }).Count"`),
  ])

  const gatewayAlive = healthRes.ok && healthRes.out.length > 0
  const gwCount = parseInt(gwProc.out) || 0
  const zombieCount = parseInt(zombieRes.out) || 0
  const authClean = stripAnsi(authRes.out)
  const statusClean = stripAnsi(statusRes.out)

  // Parse gateway health JSON
  let gatewayHealth: Record<string, unknown> = {}
  try { gatewayHealth = JSON.parse(healthRes.out) } catch { /* ignore */ }

  // Parse telegram bot info
  let botInfo: Record<string, unknown> = {}
  try {
    const parsed = JSON.parse(tgRes.out)
    botInfo = parsed.result || {}
  } catch { /* ignore */ }

  // Build checks array
  const checks: Array<{ id: string; name: string; status: 'ok' | 'warn' | 'fail'; detail: string; fixCmd?: string }> = []

  // Gateway process
  if (gwCount === 1 || (gwCount === 0 && (gatewayHealth as { ok?: boolean }).ok)) {
    checks.push({ id: 'gateway_proc', name: 'Gateway Process', status: 'ok', detail: 'Running' })
  } else if (gwCount > 1) {
    checks.push({ id: 'gateway_proc', name: 'Gateway Process', status: 'fail', detail: `${gwCount} duplicate instances`, fixCmd: 'restart_gateway' })
  } else {
    checks.push({ id: 'gateway_proc', name: 'Gateway Process', status: 'fail', detail: 'Not running', fixCmd: 'start_gateway' })
  }

  // Gateway HTTP
  if ((gatewayHealth as { ok?: boolean }).ok) {
    checks.push({ id: 'gateway_http', name: 'Gateway HTTP', status: 'ok', detail: 'Responding on :18789' })
  } else {
    checks.push({ id: 'gateway_http', name: 'Gateway HTTP', status: 'fail', detail: 'Not responding', fixCmd: 'restart_gateway' })
  }

  // Telegram bot
  if (tgRes.ok && tgRes.out.includes('"ok":true')) {
    checks.push({ id: 'tg_bot', name: 'Telegram Bot', status: 'ok', detail: `@${(botInfo as { username?: string }).username || 'kaneda6bot'} active` })
  } else {
    checks.push({ id: 'tg_bot', name: 'Telegram Bot', status: 'fail', detail: 'Unreachable or token invalid' })
  }

  // Telegram channel
  if (statusClean.includes('Telegram') && statusClean.includes('OK')) {
    checks.push({ id: 'tg_channel', name: 'Telegram Channel', status: 'ok', detail: 'ON + OK' })
  } else {
    checks.push({ id: 'tg_channel', name: 'Telegram Channel', status: 'warn', detail: 'Channel issue', fixCmd: 'restart_gateway' })
  }

  // 409 conflicts - Claude plugin
  let pluginConflict = false
  try {
    const settings = JSON.parse(readFileSync(join(homedir(), '.claude', 'settings.json'), 'utf8'))
    pluginConflict = settings?.plugins?.['telegram@claude-plugins-official'] === true
  } catch { /* ignore */ }
  checks.push({
    id: 'plugin_409',
    name: 'Claude TG Plugin',
    status: pluginConflict ? 'fail' : 'ok',
    detail: pluginConflict ? 'ENABLED — causes 409' : 'Disabled (safe)',
    ...(pluginConflict ? { fixCmd: 'disable_plugin' } : {}),
  })

  // GitHub Actions Messages workflow
  const ghWf = await sh('gh api repos/bludragon66613-sys/NERV_02/actions/workflows --jq \'.workflows[] | select(.name == "Messages") | .state\' 2>/dev/null')
  if (ghWf.out === 'active') {
    checks.push({ id: 'gh_wf', name: 'GH Messages Workflow', status: 'fail', detail: 'ACTIVE — causes 409', fixCmd: 'disable_gh_workflow' })
  } else if (ghWf.out === 'disabled_manually') {
    checks.push({ id: 'gh_wf', name: 'GH Messages Workflow', status: 'ok', detail: 'Disabled' })
  } else {
    checks.push({ id: 'gh_wf', name: 'GH Messages Workflow', status: 'ok', detail: 'Unknown (likely safe)' })
  }

  // OpenAI Codex auth
  if (/openai.codex.*(ok|valid|authenticated)/i.test(authClean)) {
    checks.push({ id: 'auth_openai', name: 'OpenAI Codex Auth', status: 'ok', detail: 'Valid' })
  } else {
    checks.push({ id: 'auth_openai', name: 'OpenAI Codex Auth', status: 'fail', detail: 'Expired', fixCmd: 'reauth_openai' })
  }

  // Anthropic auth
  if (/anthropic.*(ok|valid|authenticated)/i.test(authClean)) {
    checks.push({ id: 'auth_anthropic', name: 'Anthropic Auth', status: 'ok', detail: 'Valid' })
  } else {
    checks.push({ id: 'auth_anthropic', name: 'Anthropic Auth', status: 'warn', detail: 'Expired — run refresh-openclaw-auth.bat' })
  }

  // Zombie shells
  if (zombieCount <= 1) {
    checks.push({ id: 'zombies', name: 'Zombie Shells', status: 'ok', detail: 'Clean' })
  } else {
    checks.push({ id: 'zombies', name: 'Zombie Shells', status: 'fail', detail: `${zombieCount} zombie cmd.exe`, fixCmd: 'kill_zombies' })
  }

  // Config info
  const primary = config?.agents?.defaults?.model?.primary || 'NOT SET'
  const fallbacks = config?.agents?.defaults?.model?.fallbacks || []
  const availableModels = Object.keys(config?.agents?.defaults?.models || {})
  const gatewayPort = config?.gateway?.port || 18789
  const tgEnabled = config?.channels?.telegram?.enabled || false
  const tgStreaming = config?.channels?.telegram?.streaming || 'off'
  const tgDmPolicy = config?.channels?.telegram?.dmPolicy || 'unknown'
  const tgGroupPolicy = config?.channels?.telegram?.groupPolicy || 'unknown'
  const toolsAllowed = config?.tools?.allow || []
  const hooksEnabled = config?.hooks?.enabled || false

  const allOk = checks.every(c => c.status === 'ok')
  const hasFailures = checks.some(c => c.status === 'fail')

  return NextResponse.json({
    status: allOk ? 'healthy' : hasFailures ? 'unhealthy' : 'degraded',
    checks,
    config: {
      primaryModel: primary,
      fallbackModel: fallbacks[0] || 'NONE',
      availableModels,
      gatewayPort,
      gatewayMode: config?.gateway?.mode || 'unknown',
      gatewayBind: config?.gateway?.bind || 'unknown',
    },
    telegram: {
      enabled: tgEnabled,
      streaming: tgStreaming,
      dmPolicy: tgDmPolicy,
      groupPolicy: tgGroupPolicy,
      botUsername: (botInfo as { username?: string }).username || null,
      botId: (botInfo as { id?: number }).id || null,
    },
    tools: { allowed: toolsAllowed },
    hooks: { enabled: hooksEnabled },
    timestamp: new Date().toISOString(),
  })
}

// POST — run targeted fix or full troubleshooter
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const action = (body as { action?: string }).action || 'full'

  const commands: Record<string, string> = {
    full: 'bash ~/fix-openclaw.sh 2>&1',
    nuclear: 'bash ~/fix-openclaw.sh --nuclear 2>&1',
    restart_gateway: 'openclaw gateway restart 2>&1',
    start_gateway: 'openclaw gateway start 2>&1',
    kill_zombies: `powershell -c "Get-CimInstance Win32_Process | Where-Object { \\$_.Name -eq 'cmd.exe' -and \\$_.CommandLine -like '*gateway.cmd*' } | Sort-Object ProcessId | Select-Object -Skip 1 | ForEach-Object { Stop-Process -Id \\$_.ProcessId -Force }" 2>&1`,
    disable_plugin: `node -e "const fs=require('fs');const f=require('os').homedir()+'/.claude/settings.json';const s=JSON.parse(fs.readFileSync(f,'utf8'));if(!s.plugins)s.plugins={};s.plugins['telegram@claude-plugins-official']=false;fs.writeFileSync(f,JSON.stringify(s,null,2));console.log('Disabled')"`,
    disable_gh_workflow: `gh api repos/bludragon66613-sys/NERV_02/actions/workflows --jq '.workflows[] | select(.name == "Messages") | .id' 2>/dev/null | xargs -I{} gh api -X PUT repos/bludragon66613-sys/NERV_02/actions/workflows/{}/disable 2>&1`,
    reauth_openai: 'openclaw models auth login --provider openai-codex 2>&1',
    switch_claude: 'openclaw models set anthropic/claude-sonnet-4-6 && openclaw gateway restart 2>&1',
    switch_gpt: 'openclaw models set openai-codex/gpt-5.4 && openclaw gateway restart 2>&1',
    switch_gpt_mini: 'openclaw models set openai-codex/gpt-5.4-mini && openclaw gateway restart 2>&1',
  }

  const cmd = commands[action]
  if (!cmd) {
    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 })
  }

  const timeout = action === 'full' || action === 'nuclear' ? 60000 : 20000
  const result = await sh(cmd, timeout)

  return NextResponse.json({
    success: result.ok,
    action,
    output: stripAnsi(result.out),
    timestamp: new Date().toISOString(),
  })
}
