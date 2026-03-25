import { NextResponse } from 'next/server'
import { issueToken } from '@/lib/auth'

export async function POST() {
  const token = issueToken()
  return NextResponse.json({ token })
}
