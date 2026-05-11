/** Canonical strategy ID for the DCA Classic baseline (rendered as a dashed reference line). */
export const DCA_CLASSIC_STRATEGY_ID = 'dca_classic';

/** Emit DCA Classic baseline value every Nth sampled point (line interpolates the gaps). */
export const DCA_BASELINE_SPARSE_STRIDE = 6;

/** Canonical strategy ID for the portfolio-rules strategy. */
export const DMA_FGI_PORTFOLIO_RULES_STRATEGY_ID = 'dma_fgi_portfolio_rules';

/** Default curated preset config ID for the portfolio-rules strategy. */
export const DMA_FGI_PORTFOLIO_RULES_DEFAULT_CONFIG_ID =
  'dma_fgi_portfolio_rules_default';

/** Default total capital when the API does not provide backtest defaults. */
export const DEFAULT_TOTAL_CAPITAL = 10000;

/** Default number of simulation days when no API default is available. */
export const DEFAULT_DAYS = 500;

/** Fixed pacing engine used by the DMA-first runtime. */
export const FIXED_PACING_ENGINE_ID = 'fgi_exponential';

const DEFAULT_CONFIG_ID_BY_STRATEGY_ID: Record<string, string> = {
  [DMA_FGI_PORTFOLIO_RULES_STRATEGY_ID]:
    DMA_FGI_PORTFOLIO_RULES_DEFAULT_CONFIG_ID,
};

export function getDefaultConfigIdForStrategyId(strategyId: string): string {
  return DEFAULT_CONFIG_ID_BY_STRATEGY_ID[strategyId] ?? strategyId;
}
