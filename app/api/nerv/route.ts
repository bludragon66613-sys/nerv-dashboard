import { spawn } from 'child_process'
import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'

const SYSTEM_PROMPT = `You are the NERV_02 AI Command Interface — an autonomous agent orchestration system.

You have access to the following agents that can be dispatched to GitHub Actions:

INTEL:
- morning-brief: Daily morning briefing with news, AI updates, and priorities
- rss-digest: RSS feed digest from curated sources
- hacker-news-digest: Top Hacker News stories
- paper-digest: AI/ML research paper summaries
- tweet-digest: Twitter/X digest

CRYPTO TRADING (Hyperliquid):
- hl-intel: FLAGSHIP — full intelligence brief: top whale positions + win rates + market structure + macro + geopolitics → ranked strategies with entry/exit levels. Run this first.
- hl-scan: Eagle Eye — scan all 229 Hyperliquid perps for setups (funding extremes, volume spikes, momentum)
- hl-monitor: Radar — monitor open positions, PnL, liquidation risk, funding costs
- hl-trade: Execute a trade on Hyperliquid. Pass instruction as var, e.g. "BUY BTC 0.01" or "CLOSE ETH"
- hl-report: Portfolio report — positions, realized PnL, 7d funding, recent fills
- hl-alpha: Deep alpha synthesis — market data + news + on-chain + sentiment → ranked trade ideas

CRYPTO MONITORING:
- token-alert: Crypto token price alerts
- wallet-digest: Crypto wallet summary
- on-chain-monitor: On-chain activity monitoring
- defi-monitor: DeFi protocol monitoring

GITHUB:
- issue-triage: GitHub issue triage and prioritization
- pr-review: Pull request review
- github-monitor: GitHub activity monitoring

BUILD:
- article: Write a long-form article
- digest: Create a digest report
- feature: Build a new feature
- code-health: Code health check
- changelog: Generate changelog
- build-skill: Build a new skill

SYSTEM:
- goal-tracker: Track and review goals
- skill-health: Check skill health
- self-review: Self-review and improvement
- reflect: Reflect on recent activity
- memory-flush: Consolidate memory
- weekly-review: Weekly review (Mondays)
- heartbeat: System heartbeat check

When the user asks you to run, trigger, or dispatch an agent, respond with exactly this on its own line (no extra text around it):
DISPATCH:{"skill":"<skill-name>"}

For hl-trade with a specific instruction, include the var:
DISPATCH:{"skill":"hl-trade","var":"BUY BTC 0.01"}

You understand Hyperliquid deeply: it's a high-performance on-chain perpetuals DEX with 229+ markets.

hl-intel is the flagship — it runs in ~8s and produces: (1) live whale consensus from top 20 traders by all-time PnL (includes BobbyBigSize, traders with $100M+ all-time PnL), (2) fear/greed index, (3) BTC market regime, (4) funding rate extremes across all markets, (5) geopolitical overlay, (6) ranked trade strategies with specific entry/stop/target levels and ready-to-execute hl-trade commands.

Workflow: hl-intel (full picture) → hl-trade (execute) → hl-monitor (watch risk) → hl-report (end of day).

Otherwise respond conversationally. Be concise, direct, and use a slightly military/technical tone that fits the NERV aesthetic. No fluff.`

type ChatMessage = { role: 'user' | 'assistant'; content: string }

function buildPrompt(messages: ChatMessage[]): string {
  const parts: string[] = [SYSTEM_PROMPT]
  if (messages.length > 1) {
    parts.push('\n\n--- CONVERSATION HISTORY ---')
    for (const m of messages.slice(0, -1)) {
      parts.push(`\n${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    }
    parts.push('\n--- END HISTORY ---')
  }
  const last = messages[messages.length - 1]
  parts.push(`\n\n${last.content}`)
  return parts.join('')
}

// On Vercel: use Anthropic SDK with OAuth token as Bearer auth
function streamViaSDK(messages: ChatMessage[]): ReadableStream {
  const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN
  const client = new Anthropic(
    oauthToken
      ? { authToken: oauthToken }
      : { apiKey: process.env.ANTHROPIC_API_KEY ?? '' }
  )
  const encoder = new TextEncoder()
  const anthropicMessages = messages.map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))
  return new ReadableStream({
    async start(controller) {
      try {
        const response = await client.messages.stream({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: anthropicMessages,
        })
        for await (const chunk of response) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(chunk.delta.text))
          }
        }
      } catch (err) {
        controller.enqueue(encoder.encode(`\n[ERROR: ${err instanceof Error ? err.message : 'Stream error'}]`))
      } finally {
        controller.close()
      }
    },
  })
}

// Locally: shell out to claude CLI (uses OAuth session, no key needed)
function streamViaCLI(messages: ChatMessage[]): ReadableStream {
  const prompt = buildPrompt(messages)
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      const proc = spawn('claude', ['-p', '-', '--model', 'claude-haiku-4-5-20251001'], {
        shell: true,
        env: { ...process.env },
      })
      proc.stdin.write(prompt)
      proc.stdin.end()
      proc.stdout.on('data', (chunk: Buffer) => controller.enqueue(encoder.encode(chunk.toString())))
      proc.stderr.on('data', (chunk: Buffer) => console.error('[nerv/route]', chunk.toString()))
      proc.on('close', (code) => {
        if (code !== 0 && code !== null) {
          controller.enqueue(encoder.encode(`\n[ERROR: claude exited with code ${code}]`))
        }
        controller.close()
      })
      proc.on('error', (err) => {
        controller.enqueue(encoder.encode(`\n[ERROR: ${err.message}]`))
        controller.close()
      })
    },
  })
}

export async function POST(request: Request) {
  let messages: ChatMessage[]
  try {
    const body = await request.json()
    if (!Array.isArray(body.messages)) {
      return NextResponse.json({ error: 'messages must be an array' }, { status: 400 })
    }
    messages = body.messages as ChatMessage[]
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (messages.length === 0) {
    return NextResponse.json({ error: 'No messages' }, { status: 400 })
  }

  const stream = process.env.VERCEL
    ? streamViaSDK(messages)
    : streamViaCLI(messages)

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
    },
  })
}
