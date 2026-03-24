import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createHash } from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import Anthropic from '@anthropic-ai/sdk'

// In-memory classify cache: idempotencyKey → result, expires 5 min
const cache = new Map<string, { result: ClassifyResult; expires: number }>()

// Strategy file path
const STRATEGY_PATH = path.join(os.homedir(), 'aigency02', 'strategy', 'nexus-strategy.md')

export interface ClassifyResult {
  skill: string
  mode: 'micro' | 'sprint' | 'full'
  dispatchType: 'aeon' | 'local' | 'nexus-scenario'
  readOnly: boolean
  ambiguous: boolean
  suggestions: Array<{
    skill: string
    mode: string
    dispatchType: string
    readOnly: boolean
    label: string
    description: string
  }>
  reasoning: string
  strategyHash: string
}

async function getStrategyHash(): Promise<{ content: string; hash: string }> {
  try {
    const content = await fs.readFile(STRATEGY_PATH, 'utf-8')
    const hash = createHash('sha256').update(content).digest('hex')
    return { content, hash }
  } catch {
    return { content: '', hash: '' }
  }
}

const client = new Anthropic()

async function classify(intent: string, strategyContent: string, strategyHash: string): Promise<ClassifyResult> {
  const systemPrompt = strategyContent
    ? `You are an AI intent classifier for the NEXUS agent orchestration system.\n\n${strategyContent}`
    : 'You are an AI intent classifier for the NEXUS agent orchestration system.'

  const userPrompt = `Classify this request and return ONLY valid JSON matching this schema exactly:
{
  "skill": "string",
  "mode": "micro" | "sprint" | "full",
  "dispatchType": "aeon" | "local" | "nexus-scenario",
  "readOnly": boolean,
  "ambiguous": boolean,
  "suggestions": [{ "skill": "string", "mode": "string", "dispatchType": "string", "readOnly": boolean, "label": "string", "description": "string" }],
  "reasoning": "string",
  "strategyHash": "${strategyHash}"
}

Rules:
- readOnly=true for intel/research/monitoring skills (hl-intel, hl-scan, morning-brief, etc.)
- readOnly=false for trading/destructive skills (hl-trade, hl-alpha, memory-flush, etc.)
- ambiguous=true if the intent is unclear — populate suggestions with up to 3 alternatives
- suggestions=[] when ambiguous=false
- dispatchType="aeon" for aeon skills dispatched to GitHub Actions
- dispatchType="local" for local ~/.claude/agents skills dispatched via OpenClaw
- dispatchType="nexus-scenario" for multi-agent scenario pipelines

Request: "${intent}"`

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: userPrompt }],
    system: systemPrompt,
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Classifier returned no JSON')

  const parsed = JSON.parse(jsonMatch[0]) as ClassifyResult
  parsed.strategyHash = strategyHash
  return parsed
}

export async function POST(req: NextRequest) {
  const authErr = requireAuth(req); if (authErr) return authErr

  const body = await req.json().catch(() => ({})) as { intent?: string; idempotencyKey?: string }
  const { intent, idempotencyKey } = body
  if (!intent || !idempotencyKey) {
    return NextResponse.json({ error: 'Missing intent or idempotencyKey' }, { status: 400 })
  }

  // Check cache
  const now = Date.now()
  const cached = cache.get(idempotencyKey)
  if (cached && cached.expires > now) {
    return NextResponse.json(cached.result)
  }
  // Evict expired entries; hard cap at 500 to bound memory
  if (cache.size > 100) {
    for (const [k, v] of cache) { if (v.expires <= now) cache.delete(k) }
  }
  if (cache.size >= 500) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }

  try {
    const { content, hash } = await getStrategyHash()
    const result = await classify(intent, content, hash)
    cache.set(idempotencyKey, { result, expires: now + 5 * 60 * 1000 })
    return NextResponse.json(result)
  } catch (err) {
    console.error('[classify] error:', err)
    return NextResponse.json({ error: 'Classification failed' }, { status: 500 })
  }
}
