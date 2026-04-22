/**
 * Backtesting types aligned with analytics-engine v3 endpoints.
 *
 * - GET  /api/v3/backtesting/strategies
 * - POST /api/v3/backtesting/compare
 */

export interface BacktestSignalParamsV3 {
  cross_cooldown_days?: number;
  cross_on_touch?: boolean;
  rotation_neutral_band?: number;
  rotation_max_deviation?: number;
}

export interface BacktestPacingParamsV3 {
  k?: number;
  r_max?: number;
}

export interface BacktestBuyGateParamsV3 {
  window_days?: number;
  sideways_max_range?: number;
  leg_caps?: number[];
}

export interface BacktestTradeQuotaParamsV3 {
  min_trade_interval_days?: number | null;
  max_trades_7d?: number | null;
  max_trades_30d?: number | null;
}

export interface BacktestRotationParamsV3 {
  drift_threshold?: number;
  cooldown_days?: number;
}

export interface BacktestCompareParamsV3 {
  signal?: BacktestSignalParamsV3;
  pacing?: BacktestPacingParamsV3;
  buy_gate?: BacktestBuyGateParamsV3;
  trade_quota?: BacktestTradeQuotaParamsV3;
  rotation?: BacktestRotationParamsV3;
}

export interface BacktestCompareConfigV3 {
  /** Client-provided identifier; becomes the response strategies-map key. */
  config_id: string;
  /** Stable saved preset reference for preset-backed compare requests. */
  saved_config_id?: string;
  /** Backend-defined strategy id for ad-hoc compare requests. */
  strategy_id?: string;
  params?: BacktestCompareParamsV3;
}

export interface BacktestRequest {
  /** @deprecated backend defaults to BTC if omitted */
  token_symbol?: string;
  start_date?: string; // YYYY-MM-DD
  end_date?: string; // YYYY-MM-DD
  days?: number;
  total_capital: number;
  configs: BacktestCompareConfigV3[];
}

export interface BacktestStrategySummary {
  /** Canonical backend strategy id (for example `dma_gated_fgi`). */
  strategy_id: string;
  display_name: string;
  signal_id?: string | null;
  total_invested: number;
  final_value: number;
  roi_percent: number;
  trade_count: number;
  final_allocation: BacktestPortfolioAllocation;
  final_asset_allocation: BacktestAssetAllocation;
  max_drawdown_percent?: number | null;
  calmar_ratio?: number | null;
  parameters: Record<string, unknown>;
}

export interface BacktestPortfolioAllocation {
  spot: number;
  stable: number;
}

export interface BacktestAssetAllocation {
  btc: number;
  eth: number;
  stable: number;
  alt: number;
}

export type BacktestSpotAssetSymbol = 'BTC' | 'ETH';

export interface BacktestStrategyPortfolio {
  spot_usd: number;
  stable_usd: number;
  total_value: number;
  allocation: BacktestPortfolioAllocation;
  asset_allocation: BacktestAssetAllocation;
  spot_asset?: BacktestSpotAssetSymbol | null;
}

export interface BacktestDmaSignalDetails {
  dma_200: number | null;
  distance: number | null;
  zone: 'above' | 'below' | 'at' | null;
  cross_event: 'cross_up' | 'cross_down' | null;
  cooldown_active: boolean | null;
  cooldown_remaining_days: number | null;
  cooldown_blocked_zone: 'above' | 'below' | null;
  fgi_slope: number | null;
}

export interface BacktestSignalDetails {
  ath_event?: 'token_ath' | 'portfolio_ath' | 'both_ath' | null;
  dma?: BacktestDmaSignalDetails | null;
  [key: string]: unknown;
}

export interface BacktestSignal {
  id?: string;
  regime?: string;
  raw_value?: number | null;
  confidence?: number;
  details?: BacktestSignalDetails;
}

export interface BacktestDecisionDetails {
  allocation_name?: string | null;
  target_spot_asset?: BacktestSpotAssetSymbol | null;
  risk_notes?: string[];
  decision_score?: number;
  [key: string]: unknown;
}

export interface BacktestDecision {
  action: 'buy' | 'sell' | 'hold';
  reason: string;
  rule_group:
    | 'cross'
    | 'cooldown'
    | 'dma_fgi'
    | 'ath'
    | 'fgi'
    | 'rotation'
    | 'none';
  target_allocation: BacktestPortfolioAllocation;
  target_asset_allocation: BacktestAssetAllocation;
  immediate: boolean;
  details?: BacktestDecisionDetails;
}

/** Allocation display buckets (portfolio pie chart). */
export type BacktestAllocationBucket = 'spot' | 'stable';

/** All valid transfer bucket identifiers including per-asset buckets. */
export type BacktestBucket = BacktestAllocationBucket | 'eth' | 'btc' | 'alt';

export interface BacktestTransferMetadata {
  from_bucket: BacktestBucket;
  to_bucket: BacktestBucket;
  amount_usd: number;
}

export interface BacktestExecutionDiagnostics {
  plugins: Record<string, Record<string, unknown> | null>;
}

export interface BacktestExecution {
  event: string | null;
  transfers: BacktestTransferMetadata[];
  blocked_reason: string | null;
  step_count: number;
  steps_remaining: number;
  interval_days: number;
  diagnostics?: BacktestExecutionDiagnostics;
}

export interface BacktestStrategyPoint {
  portfolio: BacktestStrategyPortfolio;
  signal: BacktestSignal | null;
  decision: BacktestDecision;
  execution: BacktestExecution;
}

/**
 * Dynamic strategy set supporting any number of strategies.
 * Keys are compare request `config_id` values.
 */
export type BacktestStrategySet<T> = Record<string, T>;

export interface BacktestMarketPoint {
  date: string;
  token_price: Record<string, number>;
  sentiment: number | null;
  sentiment_label: string | null;
}

export interface BacktestTimelinePoint {
  market: BacktestMarketPoint;
  strategies: BacktestStrategySet<BacktestStrategyPoint>;
}

export interface BacktestPeriodInfo {
  start_date: string;
  end_date: string;
  days: number;
}

export interface BacktestWindowInfo {
  requested: BacktestPeriodInfo;
  effective: BacktestPeriodInfo;
  truncated: boolean;
}

export interface BacktestResponse {
  strategies: BacktestStrategySet<BacktestStrategySummary>;
  timeline: BacktestTimelinePoint[];
  window?: BacktestWindowInfo | null;
}

export interface BacktestStrategyCatalogEntryV3 {
  strategy_id: string;
  display_name: string;
  description?: string | null;
  param_schema: Record<string, unknown>;
  default_params: BacktestCompareParamsV3;
  supports_daily_suggestion: boolean;
}

export interface BacktestStrategyCatalogResponseV3 {
  catalog_version: string;
  strategies: BacktestStrategyCatalogEntryV3[];
}
