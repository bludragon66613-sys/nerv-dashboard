// ─── Shared Utility Functions ────────────────────────────────────────────────

// Price formatting
export const fmtPrice = (n: number): string => {
  if (n >= 1000) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
  if (n >= 1) return `$${n.toFixed(3)}`
  return `$${n.toFixed(6)}`
}

export const fmtM = (n: number): string =>
  n >= 1000 ? `$${(n / 1000).toFixed(1)}B` : `$${n.toFixed(1)}M`

export const pct = (n: number): string =>
  `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`

// Fear & Greed color
export const fgColor = (v: number): string => {
  if (v <= 20) return '#ff1100'
  if (v <= 35) return '#ff6600'
  if (v <= 55) return '#ffaa00'
  if (v <= 75) return '#00ff88'
  return '#00cc66'
}

// Direction / conviction / bias colors
export const biasColor = (b: string): string =>
  b === 'RISK_ON' ? '#00ff88' : b === 'RISK_OFF' ? '#cc0000' : '#ffaa00'

export const dirColor = (d: string): string =>
  d === 'LONG' ? '#00ff88' : '#cc0000'

export const convColor = (c: string): string =>
  c === 'HIGH' ? '#cc0000' : c === 'MEDIUM' ? '#ffaa00' : '#2e3848'

// Time formatting
export function timeAgo(input: string | number): string {
  const ms = typeof input === 'number' ? Date.now() - input : Date.now() - new Date(input).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// Run status helpers
export function runStatusColor(status: string, conclusion: string | null, colors: { orange: string; green: string; red: string; yellow: string; textDim: string }): string {
  if (status === 'in_progress') return colors.orange
  if (conclusion === 'success') return colors.green
  if (conclusion === 'failure') return colors.red
  if (status === 'queued') return colors.yellow
  return colors.textDim
}

export function runStatusLabel(status: string, conclusion: string | null): string {
  if (status === 'in_progress') return 'RUNNING'
  if (status === 'queued') return 'QUEUED'
  if (conclusion === 'success') return 'SUCCESS'
  if (conclusion === 'failure') return 'FAILURE'
  if (conclusion === 'cancelled') return 'CANCELLED'
  return status.toUpperCase()
}

// Skill group lookup
export function getGroup(name: string, skillGroups: Record<string, string[]>): string {
  for (const [g, skills] of Object.entries(skillGroups)) {
    if (skills.includes(name)) return g
  }
  return 'META'
}

// Simple UID (no crypto dependency)
export function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}

// Timezone helpers
export function getUtcOffsetMinutes(): number {
  return -(new Date().getTimezoneOffset())
}

export function getLocalTzAbbr(): string {
  try {
    return Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(new Date())
      .find(p => p.type === 'timeZoneName')?.value || 'Local'
  } catch {
    return 'Local'
  }
}

export function utcToLocal(utcH: number, utcM: number): { h: number; m: number } {
  const total = ((utcH * 60 + utcM + getUtcOffsetMinutes()) % (24 * 60) + 24 * 60) % (24 * 60)
  return { h: Math.floor(total / 60), m: total % 60 }
}

export function localToUtc(localH: number, localM: number): { h: number; m: number } {
  const total = ((localH * 60 + localM - getUtcOffsetMinutes()) % (24 * 60) + 24 * 60) % (24 * 60)
  return { h: Math.floor(total / 60), m: total % 60 }
}
