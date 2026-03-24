import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const authError = requireAuth(req)
  if (authError) return authError

  const { command } = (await req.json()) as { command: string }

  if (!command?.trim()) {
    return NextResponse.json({ error: 'empty command' }, { status: 400 })
  }

  // Parse DISPATCH: prefix for direct skill dispatch
  if (command.startsWith('DISPATCH:')) {
    try {
      const payload = JSON.parse(command.slice('DISPATCH:'.length).trim())
      const r = await fetch('http://localhost:5555/api/agency/dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: req.headers.get('Authorization') ?? '',
        },
        body: JSON.stringify(payload),
      })
      return NextResponse.json(await r.json())
    } catch (e) {
      console.error('[nerv/command] dispatch error:', e)
      return NextResponse.json({ error: 'Invalid DISPATCH payload' }, { status: 400 })
    }
  }

  // Echo unknown commands — future: Claude interpretation
  return NextResponse.json({
    ok: true,
    echo: command,
    message: 'Command received. Full NERV interpreter coming in a future release.',
  })
}
