import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import path from 'path'
import fs from 'fs/promises'

// Resolve path to memory/logs/intel-latest.json relative to repo root
// dashboard/ is one level inside the repo, so ../memory/logs/...
const INTEL_PATH = path.join(process.cwd(), '..', 'memory', 'logs', 'intel-latest.json')

export async function GET(req: NextRequest) {
  const authErr = requireAuth(req); if (authErr) return authErr
  try {
    const raw = await fs.readFile(INTEL_PATH, 'utf-8')
    const data = JSON.parse(raw)
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json(
        {
          error: 'No intel data yet. Run the hl-intel skill or the cron workflow to generate it.',
          path: INTEL_PATH,
        },
        { status: 404 },
      )
    }
    console.error('Intel API error:', err)
    return NextResponse.json({ error: 'Failed to read intel data' }, { status: 500 })
  }
}
