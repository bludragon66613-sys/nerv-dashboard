// ─── Centralized Design Tokens ───────────────────────────────────────────────

export const C = {
  bg:           '#0A0A12',
  bgPanel:      '#101020',
  bgDeep:       '#0A0A12',
  border:       '#303050',
  borderHi:     '#454570',
  orange:       '#E8650D',
  orangeDim:    '#7a3200',
  red:          '#C43B2E',
  redBright:    '#ff1100',
  green:        '#3A9D5E',
  blue:         '#5580BB',
  amber:        '#D4B82A',
  yellow:       '#ffcc00',
  cyan:         '#00ccdd',
  cyanDim:      '#004455',
  purple:       '#aa55ff',
  text:         '#8888A8',
  textDim:      '#555575',
  textBright:   '#EAEAF0',
  textMuted:    '#181e28',
  surfaceTwo:   '#1A1A30',
  surfaceThree: '#252540',
  slateIndigo:  '#2B2D42',
  cautionYellow:'#D4B82A',
} as const

export const MODELS = [
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { id: 'claude-opus-4-6', label: 'Opus 4.6' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
] as const

export const SKILL_GROUPS: Record<string, string[]> = {
  HYPERLIQUID: ['hl-intel', 'hl-scan', 'hl-monitor', 'hl-alpha', 'hl-report', 'hl-trade'],
  INTEL:       ['morning-brief', 'rss-digest', 'hacker-news-digest', 'paper-digest', 'tweet-digest'],
  OPERATIONS:  ['issue-triage', 'pr-review', 'github-monitor'],
  FINANCIAL:   ['token-alert', 'wallet-digest', 'on-chain-monitor', 'defi-monitor'],
  CREATIVE:    ['article', 'digest', 'feature'],
  MAINTENANCE: ['code-health', 'changelog', 'build-skill'],
  META:        ['goal-tracker', 'skill-health', 'self-review', 'reflect', 'memory-flush', 'weekly-review', 'heartbeat'],
}

export const GROUP_COLORS: Record<string, string> = {
  HYPERLIQUID: '#C43B2E',
  INTEL:       '#5580BB',
  OPERATIONS:  '#E8650D',
  FINANCIAL:   '#D4B82A',
  CREATIVE:    '#aa55ff',
  MAINTENANCE: '#3A9D5E',
  META:        '#ff2244',
}
