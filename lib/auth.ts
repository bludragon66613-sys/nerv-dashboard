import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'

function getSecret(): string {
  const s = process.env.DASHBOARD_SECRET
  if (!s) throw new Error('[auth] DASHBOARD_SECRET env var is required')
  return s
}

const _ttl = parseInt(process.env.JWT_TTL_SECONDS || '86400', 10)
const TTL = Number.isFinite(_ttl) && _ttl > 0 ? _ttl : 86400

export function issueToken(): string {
  const now = Math.floor(Date.now() / 1000)
  return jwt.sign({ iat: now, exp: now + TTL }, getSecret(), { algorithm: 'HS256' })
}

export function verifyToken(token: string): boolean {
  try {
    jwt.verify(token, getSecret(), { algorithms: ['HS256'] })
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
