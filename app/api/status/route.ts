import { NextResponse } from 'next/server'

// Public status endpoint — no auth required, consumed by local desktop app
export async function GET() {
  return NextResponse.json({
    mcp: [
      { name: 'github',     tools: 12, status: 'ok' },
      { name: 'claude-mem', tools: 6,  status: 'ok' },
      { name: 'vercel',     tools: 18, status: 'ok' },
      { name: 'qmd',        tools: 0,  status: 'connecting' },
    ],
    openclawModel: 'claude-haiku-4-5',
    openclawRpm: 4,
    openclawRpmMax: 60,
    proxyConnected: true,
    activeJobs: [],
  })
}
