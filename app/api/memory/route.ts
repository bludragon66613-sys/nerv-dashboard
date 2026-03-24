import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

const MEMORY_DIR = path.join(os.homedir(), '.claude', 'projects', 'C--Users-Rohan', 'memory')

interface MemoryFile {
  filename: string
  name: string
  description: string
  type: 'user' | 'feedback' | 'project' | 'reference' | 'index' | 'savepoint'
  body: string
  mtime: number
}

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) return { meta: {}, body: raw }
  const meta: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  }
  return { meta, body: match[2].trim() }
}

function inferType(filename: string, meta: Record<string, string>): MemoryFile['type'] {
  if (meta.type) return meta.type as MemoryFile['type']
  if (filename === 'MEMORY.md') return 'index'
  if (filename.startsWith('session_savepoint')) return 'savepoint'
  return 'user'
}

export async function GET(req: NextRequest) {
  const authErr = requireAuth(req); if (authErr) return authErr
  try {
    const dirEntries = await fs.readdir(MEMORY_DIR).catch(() => null)
    if (!dirEntries) {
      return NextResponse.json({ files: [], error: 'Memory directory not found' })
    }

    const filenames = dirEntries.filter(f => f.endsWith('.md'))
    const files: MemoryFile[] = await Promise.all(filenames.map(async filename => {
      const filepath = path.join(MEMORY_DIR, filename)
      const [raw, stat] = await Promise.all([
        fs.readFile(filepath, 'utf-8'),
        fs.stat(filepath),
      ])
      const { meta, body } = parseFrontmatter(raw)
      return {
        filename,
        name: meta.name || filename.replace('.md', ''),
        description: meta.description || '',
        type: inferType(filename, meta),
        body,
        mtime: stat.mtimeMs,
      }
    }))

    // Sort: index first, then by mtime desc
    files.sort((a, b) => {
      if (a.type === 'index') return -1
      if (b.type === 'index') return 1
      return b.mtime - a.mtime
    })

    return NextResponse.json({ files })
  } catch (err) {
    console.error('[memory]', err)
    return NextResponse.json({ files: [], error: 'Failed to load memory files' }, { status: 500 })
  }
}
