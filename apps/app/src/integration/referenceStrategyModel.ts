import type {
  BacktestCompareConfigV3,
  BacktestRequest,
  BacktestResponse,
  BacktestStrategyCatalogEntryV3,
} from '@zapengine/app-core/types/backtesting';
import type {
  BacktestDefaults,
  StrategyConfigsResponse,
  StrategyPreset,
  DailySuggestionResponse,
} from '@zapengine/app-core/types/strategy';
export interface BuildDefaultBacktestRequestOptions {
  days?: number;
}
const DCA_CLASSIC_STRATEGY_ID = 'dca_classic';
const DMA_FGI_PORTFOLIO_RULES_STRATEGY_ID = 'dma_fgi_portfolio_rules';
const DMA_FGI_PORTFOLIO_RULES_DEFAULT_CONFIG_ID =
  'dma_fgi_portfolio_rules_default';
const DEFAULT_DAYS = 500;
const DEFAULT_TOTAL_CAPITAL = 10_000;

const FALLBACK_DEFAULTS: BacktestDefaults = {
  days: DEFAULT_DAYS,
  total_capital: DEFAULT_TOTAL_CAPITAL,
};

function getPreferredPresetForStrategyId(
  presets: StrategyPreset[],
  strategyId: string,
): StrategyPreset | undefined {
  return (
    presets.find(
      (preset) => preset.strategy_id === strategyId && preset.is_default,
    ) ?? presets.find((preset) => preset.strategy_id === strategyId)
  );
}

function buildDcaBaselineConfig(): BacktestCompareConfigV3 {
  return {
    config_id: DCA_CLASSIC_STRATEGY_ID,
    strategy_id: DCA_CLASSIC_STRATEGY_ID,
    params: {},
  };
}

function buildPresetBackedCompareConfig(
  preset: StrategyPreset,
): BacktestCompareConfigV3 {
  return {
    config_id: preset.config_id,
    saved_config_id: preset.config_id,
  };
}

function buildAdhocPortfolioRulesConfig(
  strategies: BacktestStrategyCatalogEntryV3[],
): BacktestCompareConfigV3 {
  const portfolioRules = strategies.find(
    (strategy) => strategy.strategy_id === DMA_FGI_PORTFOLIO_RULES_STRATEGY_ID,
  );
  const params = portfolioRules?.default_params ?? {};

  return {
    config_id: DMA_FGI_PORTFOLIO_RULES_DEFAULT_CONFIG_ID,
    strategy_id: DMA_FGI_PORTFOLIO_RULES_STRATEGY_ID,
    params,
  };
}

export function buildDefaultBacktestRequest(
  configs: StrategyConfigsResponse,
  options: BuildDefaultBacktestRequestOptions = {},
): BacktestRequest {
  const defaults = configs.backtest_defaults ?? FALLBACK_DEFAULTS;
  const preferredPreset = getPreferredPresetForStrategyId(
    configs.presets ?? [],
    DMA_FGI_PORTFOLIO_RULES_STRATEGY_ID,
  );
  const strategyConfig = preferredPreset
    ? buildPresetBackedCompareConfig(preferredPreset)
    : buildAdhocPortfolioRulesConfig(configs.strategies ?? []);

  return {
    days: options.days ?? defaults.days,
    total_capital: defaults.total_capital,
    configs: [buildDcaBaselineConfig(), strategyConfig],
  };
}

export function defaultPortfolioRules(configs: StrategyConfigsResponse) {
  return [...(configs.portfolio_rules ?? [])]
    .sort((left, right) => left.priority - right.priority)
    .map((rule, index) => ({ ...rule, number: index + 1 }));
}
function referenceStrategyEntry(response: BacktestResponse) {
  return Object.entries(response.strategies).find(
    ([, summary]) => summary.strategy_id !== DCA_CLASSIC_STRATEGY_ID,
  );
}
export function referenceStrategyId(response: BacktestResponse): string | null {
  return referenceStrategyEntry(response)?.[0] ?? null;
}
export function backtestStats(response: BacktestResponse) {
  const primary = referenceStrategyEntry(response)?.[1];
  const dca = Object.values(response.strategies).find(
    (summary) => summary.strategy_id === DCA_CLASSIC_STRATEGY_ID,
  );
  return {
    rulesRoi: primary?.roi_percent ?? null,
    dcaRoi: dca?.roi_percent ?? null,
    maxDrawdown: primary?.max_drawdown_percent ?? null,
  };
}
export function referenceSuggestionFromBacktest(
  response: BacktestResponse,
): DailySuggestionResponse | null {
  const entry = referenceStrategyEntry(response);
  const last = response.timeline.at(-1);
  if (!entry || !last || !response.window) return null;
  const [id, summary] = entry;
  const point = last.strategies[id];
  // The response names the spec it ran in the summary's parameters.
  const specRef = summary.parameters.spec_ref;
  if (!point?.signal || typeof specRef !== 'string') return null;
  const status =
    point.execution.status ??
    (point.execution.blocked_reason !== null
      ? 'blocked'
      : point.execution.transfers.length > 0
        ? 'action_required'
        : 'no_action');
  return {
    as_of: last.market.date,
    config_id: id,
    config_display_name: summary.display_name,
    strategy_id: summary.strategy_id,
    spec_ref: specRef,
    action: {
      status,
      required: status === 'action_required',
      kind: status === 'action_required' ? 'rebalance' : null,
      reason_code: point.decision.reason,
      transfers: point.execution.transfers,
    },
    context: {
      market: last.market,
      signal: point.signal,
      portfolio: point.portfolio,
      target: { allocation: point.decision.target_allocation },
      strategy: {
        stance: point.decision.action,
        reason_code: point.decision.reason,
        rule_group: point.decision.rule_group,
        ...(point.decision.details ? { details: point.decision.details } : {}),
      },
      model: {
        allocation: point.portfolio.asset_allocation,
        window: response.window,
      },
    },
    data_freshness: response.data_freshness,
  };
}
export function ruleNameFromReason(reason: string): string | null {
  const name = reason.startsWith('portfolio_')
    ? reason.slice('portfolio_'.length)
    : reason;
  return [
    'cross_down_exit',
    'cross_up_equal_weight',
    'eth_btc_ratio_rotation',
    'eth_btc_deviation_dca',
    'dma_overextension_dca_sell',
  ].includes(name)
    ? name
    : null;
}
export function ruleNumberFromReason(
  reason: string,
  rules: readonly { name: string; number: number }[],
): number | null {
  const name = ruleNameFromReason(reason);
  return rules.find((rule) => rule.name === name)?.number ?? null;
}
