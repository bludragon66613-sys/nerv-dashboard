import { NextRequest, NextResponse } from 'next/server'

const PAPERCLIP_URL = process.env.PAPERCLIP_URL || 'http://localhost:3100'

export async function GET(req: NextRequest) {
  const sub = req.nextUrl.searchParams.get('path') || ''
  const target = sub ? `${PAPERCLIP_URL}/api/${sub}` : `${PAPERCLIP_URL}/api/companies`

  try {
    const res = await fetch(target, { headers: { 'Accept': 'application/json' } })
    const data = await res.json()
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Paperclip not reachable' }, { status: 502 })
  }
}
