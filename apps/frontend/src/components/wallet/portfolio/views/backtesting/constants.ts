/** Canonical strategy ID for the ETH/BTC rotation strategy. */
export const ETH_BTC_ROTATION_STRATEGY_ID = 'eth_btc_rotation';

/** Default curated preset config ID for the ETH/BTC rotation strategy. */
export const ETH_BTC_ROTATION_DEFAULT_CONFIG_ID = 'eth_btc_rotation_default';

/** Canonical strategy ID for the production hierarchical minimum strategy. */
export const DMA_FGI_HIERARCHICAL_MINIMUM_STRATEGY_ID =
  'dma_fgi_hierarchical_minimum';

/** Canonical strategy ID for the portfolio-rules baseline strategy. */
export const DMA_FGI_PORTFOLIO_RULES_STRATEGY_ID = 'dma_fgi_portfolio_rules';

/** Default total capital when the API does not provide backtest defaults. */
export const DEFAULT_TOTAL_CAPITAL = 10000;

/** Default number of simulation days when no API default is available. */
export const DEFAULT_DAYS = 500;

/** Fixed pacing engine used by the DMA-first runtime. */
export const FIXED_PACING_ENGINE_ID = 'fgi_exponential';

const DEFAULT_CONFIG_ID_BY_STRATEGY_ID: Record<string, string> = {
  [ETH_BTC_ROTATION_STRATEGY_ID]: ETH_BTC_ROTATION_DEFAULT_CONFIG_ID,
  [DMA_FGI_HIERARCHICAL_MINIMUM_STRATEGY_ID]:
    DMA_FGI_HIERARCHICAL_MINIMUM_STRATEGY_ID,
  [DMA_FGI_PORTFOLIO_RULES_STRATEGY_ID]: DMA_FGI_PORTFOLIO_RULES_STRATEGY_ID,
};

export function getDefaultConfigIdForStrategyId(strategyId: string): string {
  return DEFAULT_CONFIG_ID_BY_STRATEGY_ID[strategyId] ?? strategyId;
}
