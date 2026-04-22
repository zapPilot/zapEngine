/**
 * Strategy types for the Strategy tab.
 *
 * These types mirror the backend Pydantic models in analytics-engine/src/models/strategy.py
 */

import type {
  BacktestAssetAllocation,
  BacktestCompareParamsV3,
  BacktestDecision,
  BacktestDecisionDetails,
  BacktestMarketPoint,
  BacktestPortfolioAllocation,
  BacktestSignal,
  BacktestStrategyCatalogEntryV3,
  BacktestStrategyPortfolio,
  BacktestTransferMetadata,
} from './backtesting';

/**
 * Market regime labels
 */
export type RegimeLabel =
  | 'extreme_fear'
  | 'fear'
  | 'neutral'
  | 'greed'
  | 'extreme_greed';

export interface DailySuggestionPortfolio extends BacktestStrategyPortfolio {
  asset_allocation: BacktestAssetAllocation;
}

export interface DailySuggestionDecision extends BacktestDecision {
  target_asset_allocation: BacktestAssetAllocation;
}

export type DailySuggestionActionStatus =
  | 'action_required'
  | 'blocked'
  | 'no_action';

export interface DailySuggestionAction {
  status: DailySuggestionActionStatus;
  required: boolean;
  kind: 'rebalance' | null;
  reason_code: string;
  transfers: BacktestTransferMetadata[];
}

export interface DailySuggestionTarget {
  allocation: BacktestPortfolioAllocation;
  asset_allocation: BacktestAssetAllocation;
}

export interface DailySuggestionStrategyContext {
  stance: DailySuggestionDecision['action'];
  reason_code: string;
  rule_group: DailySuggestionDecision['rule_group'];
  details?: BacktestDecisionDetails;
}

export interface DailySuggestionContext {
  market: BacktestMarketPoint;
  signal: BacktestSignal;
  portfolio: DailySuggestionPortfolio;
  target: DailySuggestionTarget;
  strategy: DailySuggestionStrategyContext;
}

/**
 * Daily strategy suggestion response.
 */
export interface DailySuggestionResponse {
  as_of: string;
  config_id: string;
  config_display_name: string;
  strategy_id: string;
  action: DailySuggestionAction;
  context: DailySuggestionContext;
}

/**
 * Strategy configuration preset served by analytics-engine.
 */
export interface StrategyPreset {
  config_id: string;
  display_name: string;
  description: string | null;
  strategy_id: string;
  params: BacktestCompareParamsV3;
  is_default: boolean;
  /** Whether this preset is the baseline for comparisons (e.g., DCA Classic) */
  is_benchmark: boolean;
}

/**
 * Default parameters for backtesting simulations.
 *
 * These are global simulation parameters (not per-strategy) because:
 * - days and total_capital are simulation parameters, not strategy parameters
 * - Users test the same strategy with different time periods
 */
export interface BacktestDefaults {
  /** Default simulation period in days */
  days: number;
  /** Default capital for simulation */
  total_capital: number;
}

/**
 * Response from the /configs endpoint.
 *
 * Wraps strategy families, public presets, and backtest defaults in a
 * structured response envelope for extensibility and backward compatibility.
 */
export interface StrategyConfigsResponse {
  strategies: BacktestStrategyCatalogEntryV3[];
  presets: StrategyPreset[];
  backtest_defaults: BacktestDefaults;
}
