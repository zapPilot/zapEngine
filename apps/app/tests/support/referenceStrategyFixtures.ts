import type {
  BacktestResponse,
  BacktestStrategyPoint,
} from '@zapengine/app-core/types/backtesting';
import type { StrategyConfigsResponse } from '@zapengine/app-core/types/strategy';
export const referenceRuleNames = [
  'cross_down_exit',
  'cross_up_equal_weight',
  'eth_btc_ratio_rotation',
  'eth_btc_deviation_dca',
  'dma_overextension_dca_sell',
  'fgi_downshift_dca_sell',
] as const;
export const referenceSpecRef = 'reference/dma_fgi@1#a22bccfabb4b';
export function referenceConfigs(): StrategyConfigsResponse {
  return {
    backtest_defaults: { days: 500, total_capital: 10000 },
    presets: [],
    strategies: [],
    portfolio_rules: referenceRuleNames.map((name, index) => ({
      name,
      priority: index + 1,
      description: name,
    })),
  };
}
export function referencePoint(): BacktestStrategyPoint {
  const allocation = { btc: 0.2, eth: 0.2, spy: 0, stable: 0.6, alt: 0 };
  return {
    portfolio: {
      spot_usd: 4200,
      stable_usd: 6300,
      total_value: 10500,
      allocation: { spot: 0.4, stable: 0.6 },
      asset_allocation: allocation,
    },
    signal: {
      id: 'dma_fgi',
      regime: 'neutral_hold',
      confidence: 1,
      details: { dma: { dma_200: 65000, distance: 0.01, cross_event: null } },
    },
    decision: {
      action: 'hold',
      reason: 'regime_no_signal',
      rule_group: 'none',
      target_allocation: allocation,
      immediate: false,
      details: {
        portfolio_rule_matches: referenceRuleNames.map((rule_name) => ({
          rule_name,
          matched: false,
        })),
        matched_rule_name: null,
      },
    },
    execution: {
      event: null,
      transfers: [],
      blocked_reason: null,
      status: 'no_action',
      action_required: false,
    },
  };
}
export function referenceResponse(): BacktestResponse {
  const point = referencePoint();
  const summary = {
    strategy_id: 'dma_fgi_portfolio_rules',
    display_name: 'Reference strategy',
    total_invested: 10000,
    final_value: 10500,
    roi_percent: 5,
    trade_count: 0,
    pnl_attribution: { price_usd: 500, yield_usd: 0, cost_usd: 0 },
    final_allocation: point.portfolio.allocation,
    final_asset_allocation: point.portfolio.asset_allocation,
    max_drawdown_percent: -2,
    parameters: {},
  };
  return {
    assumptions: { fill_lag_days: 1, slippage_rate: 0.003, stable_apr: 0.03 },
    window: {
      requested: { start_date: '2026-10-01', end_date: '2026-10-02', days: 1 },
      effective: { start_date: '2026-10-01', end_date: '2026-10-02', days: 1 },
      truncated: false,
    },
    strategies: {
      reference: {
        ...summary,
        parameters: { spec_ref: referenceSpecRef },
      },
      dca_classic: {
        ...summary,
        strategy_id: 'dca_classic',
        display_name: 'DCA',
        roi_percent: 1,
      },
    },
    timeline: [1, 2].map((day) => ({
      market: {
        date: `2026-10-0${day}`,
        token_price: { BTC: 65650, ETH: 3000, SPY: 500 },
        sentiment: 50,
        sentiment_label: 'neutral',
      },
      strategies: { reference: referencePoint() },
    })),
  };
}
