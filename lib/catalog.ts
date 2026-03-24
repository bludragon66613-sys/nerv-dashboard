import fs from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import os from 'os'
import writeFileAtomic from 'write-file-atomic'

const REPO_ROOT = process.env.AEON_REPO_ROOT
const CACHE_DIR = path.join(process.cwd(), '.cache')
const CATALOG_PATH = path.join(CACHE_DIR, 'agents.json')

// Static fallback list of always-destructive skills (checked when frontmatter is absent)
const DESTRUCTIVE_FALLBACK = new Set([
  'hl-trade', 'hl-alpha', 'hl-monitor', 'memory-flush',
  'self-review', 'build-skill', 'feature', 'article',
  'changelog', 'idea-capture',
])

export interface CatalogAgent {
  slug: string
  name: string
  description: string
  source: 'local' | 'aeon'
  destructive: boolean
  division: string
  file: string
}

// Aeon skill slug → category (explicit lookup, not keyword guessing)
const AEON_DIVISION: Record<string, string> = {
  // Intel / research
  'morning-brief': 'Intel', 'rss-digest': 'Intel', 'hacker-news-digest': 'Intel',
  'paper-digest': 'Intel', 'tweet-digest': 'Intel', 'reddit-digest': 'Intel',
  'research-brief': 'Intel', 'search-papers': 'Intel', 'security-digest': 'Intel',
  'fetch-tweets': 'Intel', 'search-skill': 'Intel', 'idea-capture': 'Intel',
  // Crypto / Hyperliquid
  'hl-intel': 'Crypto', 'hl-scan': 'Crypto', 'hl-monitor': 'Crypto',
  'hl-trade': 'Crypto', 'hl-report': 'Crypto', 'hl-alpha': 'Crypto',
  'token-alert': 'Crypto', 'wallet-digest': 'Crypto',
  'on-chain-monitor': 'Crypto', 'defi-monitor': 'Crypto',
  // GitHub
  'issue-triage': 'GitHub', 'pr-review': 'GitHub', 'github-monitor': 'GitHub',
  // Build / output
  'article': 'Build', 'digest': 'Build', 'feature': 'Build',
  'code-health': 'Build', 'changelog': 'Build', 'build-skill': 'Build',
  // System / maintenance
  'goal-tracker': 'System', 'skill-health': 'System', 'self-review': 'System',
  'reflect': 'System', 'memory-flush': 'System', 'weekly-review': 'System',
  'heartbeat': 'System', 'rd-council': 'System',
}

// Local agent filename prefix → division
const LOCAL_PREFIX_DIVISION: Record<string, string> = {
  design: 'Design',
  engineering: 'Engineering',
  game: 'Game Dev',
  godot: 'Game Dev',
  unity: 'Game Dev',
  unreal: 'Game Dev',
  roblox: 'Game Dev',
  level: 'Game Dev',
  marketing: 'Marketing',
  sales: 'Sales',
  testing: 'Testing',
  product: 'Product',
  project: 'Project Mgmt',
  security: 'Security',
  blockchain: 'Security',
  xr: 'Spatial',
  visionos: 'Spatial',
  macos: 'Spatial',
  academic: 'Research',
  // language/tool prefixes → Engineering
  python: 'Engineering', go: 'Engineering', rust: 'Engineering',
  java: 'Engineering', kotlin: 'Engineering', cpp: 'Engineering',
  typescript: 'Engineering', flutter: 'Engineering', swift: 'Engineering',
  pytorch: 'Engineering', gsd: 'Engineering', tdd: 'Engineering',
  code: 'Engineering', build: 'Engineering', refactor: 'Engineering',
  doc: 'Engineering', docs: 'Engineering', e2e: 'Engineering',
  data: 'Engineering', database: 'Engineering', lsp: 'Engineering',
  // support/ops
  support: 'Support', supply: 'Operations', recruitment: 'Operations',
  compliance: 'Operations', corporate: 'Operations',
}

function inferDivision(source: CatalogAgent['source'], slug: string, filePath: string): string {
  if (source === 'aeon') {
    return AEON_DIVISION[slug] ?? 'System'
  }
  // local: use filename prefix (first dash-segment)
  const prefix = path.basename(filePath, '.md').split('-')[0].toLowerCase()
  return LOCAL_PREFIX_DIVISION[prefix] ?? 'Specialized'
}

function deriveSlug(filePath: string): string {
  const base = path.basename(filePath, '.md').toLowerCase()
  // SKILL.md files live inside named directories — use the dir name as slug
  if (base === 'skill') {
    return path.basename(path.dirname(filePath)).toLowerCase().replace(/[^a-z0-9]+/g, '-')
  }
  return base.replace(/[^a-z0-9]+/g, '-')
}

async function parseFrontmatter(filePath: string): Promise<{
  name: string
  description: string
  destructive: boolean
}> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    const match = raw.match(/^---\n([\s\S]*?)\n---/)
    if (match) {
      const meta: Record<string, string> = {}
      for (const line of match[1].split('\n')) {
        const idx = line.indexOf(':')
        if (idx === -1) continue
        meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
      }
      const name = meta.name || path.basename(filePath, '.md')
      const description = meta.description || ''
      const destructive = meta.destructive === 'true'
      return { name, description, destructive }
    }
    // No frontmatter — try first H1
    const h1 = raw.match(/^#\s+(.+)$/m)
    return {
      name: h1 ? h1[1].trim() : path.basename(filePath, '.md'),
      description: '',
      destructive: false,
    }
  } catch {
    return { name: path.basename(filePath, '.md'), description: '', destructive: false }
  }
}

async function globMd(dir: string, excludeDirs: string[] = []): Promise<string[]> {
  const results: string[] = []
  async function walk(current: string) {
    let entries
    try { entries = await fs.readdir(current, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const fullPath = path.join(current, e.name)
      if (e.isDirectory()) {
        if (!excludeDirs.includes(e.name)) await walk(fullPath)
      } else if (e.isFile() && e.name.endsWith('.md') && !/^(README|CONTRIBUTING|LICENSE)/i.test(e.name)) {
        results.push(fullPath)
      }
    }
  }
  await walk(dir)
  return results
}

export async function buildCatalog(): Promise<CatalogAgent[]> {
  const repoRoot = process.env.AEON_REPO_ROOT
  if (!repoRoot) {
    console.warn('[catalog] AEON_REPO_ROOT not set — skipping aeon skills source')
  }

  await fs.mkdir(CACHE_DIR, { recursive: true })

  const home = os.homedir()
  const sources: Array<{ dir: string; source: CatalogAgent['source']; excludeDirs?: string[] }> = [
    {
      dir: path.join(home, '.claude', 'agents'),
      source: 'local',
    },
    ...(repoRoot ? [{ dir: path.join(repoRoot, 'skills'), source: 'aeon' as const }] : []),
  ]

  // Priority: local > aeon
  const seen = new Map<string, CatalogAgent>()

  for (const { dir, source, excludeDirs } of sources) {
    if (!existsSync(dir)) continue
    const files = await globMd(dir, excludeDirs)
    for (const file of files) {
      const slug = deriveSlug(file)
      if (seen.has(slug)) continue // lower-priority duplicate, skip
      const { name, description, destructive: fmDestructive } = await parseFrontmatter(file)
      const destructive = fmDestructive || DESTRUCTIVE_FALLBACK.has(slug)
      seen.set(slug, {
        slug,
        name,
        description,
        source,
        destructive,
        division: inferDivision(source, slug, file),
        file,
      })
    }
  }

  const agents = Array.from(seen.values())
  await writeFileAtomic(CATALOG_PATH, JSON.stringify(agents, null, 2))
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[catalog] Built ${agents.length} agents → ${CATALOG_PATH}`)
  }
  return agents
}

export async function readCatalog(): Promise<CatalogAgent[]> {
  try {
    const raw = await fs.readFile(CATALOG_PATH, 'utf-8')
    return JSON.parse(raw)
  } catch {
    // Cache miss — build on demand
    return buildCatalog()
  }
}
