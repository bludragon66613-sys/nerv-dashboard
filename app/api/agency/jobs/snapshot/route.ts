import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { listJobs } from '@/lib/jobs'

export async function GET(req: NextRequest) {
  const authErr = requireAuth(req); if (authErr) return authErr
  try {
    const jobs = await listJobs()
    return NextResponse.json({ jobs })
  } catch (err) {
    console.error('[jobs/snapshot]', err)
    return NextResponse.json({ error: 'Failed to load jobs' }, { status: 500 })
  }
}
