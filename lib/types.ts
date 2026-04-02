// ─── Shared Types ────────────────────────────────────────────────────────────

export interface RiskParams {
  entry_zone: [number, number]
  stop: number
  target1: number
  target2: number
  stop_pct: number
  target1_pct: number
  target2_pct: number
  risk_reward: number
}

export interface Strategy {
  coin: string
  direction: 'LONG' | 'SHORT'
  score: number
  conviction: 'HIGH' | 'MEDIUM' | 'LOW'
  reasons: string[]
  signals: string[]
  funding_apr: number
  source: string
  mark_px: number
  oi_usd_m: number
  whale_agreement?: string
  whale_names?: string[]
  note?: string
  risk_params?: RiskParams
}

export interface ConsensusItem {
  direction: 'LONG' | 'SHORT'
  aligned_count: number
  total_traders: number
  agreement_pct: number
  total_notional: number
  avg_entry: number
  traders: string[]
  conviction: 'HIGH' | 'MEDIUM' | 'LOW'
}

export interface IntelData {
  generated_at: string
  elapsed_sec: number
  strategies: Strategy[]
  macro: {
    fear_greed: { value: number; classification: string; trend: string; yesterday: number; signal: string }
    btc_metrics: { btc_price: number; btc_24h_pct: number; btc_7d_pct: number; btc_30d_pct: number; eth_btc_ratio: number; market_regime: string; alt_season: boolean }
    global: { btc_dominance_pct: number; total_market_cap_usd: number; market_cap_change_24h: number }
    derived: { overall_bias: string; bias_note: string; dom_signal: string }
    trending: Array<{ symbol: string }>
  }
  market_scan: {
    total_markets: number
    extreme_funding: Array<{ coin: string; funding_apr_pct: number; oi_usd_m: number; change_24h_pct: number }>
    volume_spikes: Array<{ coin: string; vol_oi_ratio: number; volume_24h_m: number; change_24h_pct: number }>
    top_movers_24h: Array<{ coin: string; change_24h_pct: number; mark_px: number }>
  }
  leaderboard: {
    consensus_alltime: Record<string, ConsensusItem>
    top_traders: Array<{
      display: string
      all_time: { pnl: number }
      month: { pnl: number }
      trade_stats: { win_rate: number | null }
      positions: unknown[]
    }>
  }
  summary: {
    market_regime: string
    macro_bias: string
    fear_greed: number
    fear_greed_cls: string
    btc_price: number
    btc_dominance: number
    alt_season: boolean
    top_strategies: string[]
    high_conviction_count: number
    total_markets_scanned: number
    traders_analysed: number
  }
}

export interface Skill {
  name: string
  description: string
  enabled: boolean
  schedule: string
  var?: string
}

export interface Run {
  id: number
  workflow: string
  status: string
  conclusion: string | null
  created_at: string
  url: string
}

export interface LLMProvider {
  id: string
  name: string
  secretName: string
  autoDetectable: boolean
  keyPlaceholder: string
  connected: boolean
}

export interface Secret {
  name: string
  group: string
  description: string
  isSet: boolean
  either?: string
}
