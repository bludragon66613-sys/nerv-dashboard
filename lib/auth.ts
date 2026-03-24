import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'

const SECRET = process.env.DASHBOARD_SECRET ?? (() => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('DASHBOARD_SECRET env var is required in production')
  }
  console.warn('[auth] DASHBOARD_SECRET not set — using insecure default (dev only)')
  return 'change-me-32-char-secret-xxxxxxxx'
})()
const TTL = parseInt(process.env.JWT_TTL_SECONDS || '86400', 10)

export function issueToken(): string {
  const now = Math.floor(Date.now() / 1000)
  return jwt.sign({ iat: now, exp: now + TTL }, SECRET, { algorithm: 'HS256' })
}

export function verifyToken(token: string): boolean {
  try {
    jwt.verify(token, SECRET, { algorithms: ['HS256'] })
    return true
  } catch {
    return false
  }
}

export function requireAuth(req: NextRequest): NextResponse | null {
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}
