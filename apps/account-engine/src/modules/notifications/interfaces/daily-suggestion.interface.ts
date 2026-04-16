/**
 * Daily suggestion response consumed from analytics-engine.
 */

export type DailySuggestionAllocationMap = Record<string, number>;

export interface DailySuggestionMarket {
  date?: string;
  sentiment: number | null;
  sentiment_label?: string | null;
  token_price?: Record<string, number | null>;
}

export interface DailySuggestionPortfolio {
  total_value: number;
  total_assets_usd?: number;
  total_debt_usd?: number;
  total_net_usd?: number;
  asset_allocation: DailySuggestionAllocationMap;
}

export interface DailySuggestionSignal {
  id?: string;
  regime: string;
  raw_value?: number | null;
  confidence?: number | null;
  details?: Record<string, unknown> | null;
}

export interface DailySuggestionTransfer {
  from_bucket: string;
  to_bucket: string;
  amount_usd: number;
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
  transfers: DailySuggestionTransfer[];
}

export interface DailySuggestionTarget {
  allocation: DailySuggestionAllocationMap;
  asset_allocation: DailySuggestionAllocationMap;
}

export interface DailySuggestionStrategyContext {
  stance: string;
  reason_code: string;
  rule_group?: string | null;
  details?: Record<string, unknown> | null;
}

export interface DailySuggestionContext {
  market: DailySuggestionMarket;
  signal: DailySuggestionSignal;
  portfolio: DailySuggestionPortfolio;
  target: DailySuggestionTarget;
  strategy: DailySuggestionStrategyContext;
}

export interface DailySuggestionData {
  as_of: string;
  config_id: string;
  config_display_name: string;
  strategy_id: string;
  action: DailySuggestionAction;
  context: DailySuggestionContext;
}
