import { useQuery } from '@tanstack/react-query';
import { getStrategyConfigs, runBacktest } from '@zapengine/app-core/services';
import type {
  BacktestCompareConfigV3,
  BacktestRequest,
  BacktestResponse,
  BacktestStrategyCatalogEntryV3,
  BacktestStrategySummary,
} from '@zapengine/app-core/types/backtesting';
import type {
  BacktestDefaults,
  StrategyConfigsResponse,
  StrategyPreset,
} from '@zapengine/app-core/types/strategy';

import { type MetricTone } from '@/data/demo';
import { formatUsd } from '@/lib/format';

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

interface StrategyBacktestMetric {
  label: string;
  value: string;
  tone: MetricTone;
}

export interface DefaultStrategyBacktestView {
  returnLabel: string;
  vsBtcLabel: string;
  vsEthLabel: string;
  metrics: StrategyBacktestMetric[];
  displayName: string;
  chartData: number[];
}

export interface UseDefaultStrategyBacktestResult {
  data: DefaultStrategyBacktestView | null;
  isLoading: boolean;
  isError: boolean;
}

export interface BuildDefaultBacktestRequestOptions {
  days?: number;
}

function signedPct(value: number | undefined | null): string {
  if (typeof value !== 'number') {
    return '—';
  }
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function unsignedPct(value: number | undefined | null): string {
  if (typeof value !== 'number') {
    return '—';
  }
  return `${Math.abs(value).toFixed(1)}%`;
}

function numberMetric(value: number | undefined | null): string {
  return typeof value === 'number' ? value.toFixed(2) : '—';
}

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

function primaryStrategyId(response: BacktestResponse): string | undefined {
  const strategies = response.strategies ?? {};
  return Object.keys(strategies).find((id) => id !== DCA_CLASSIC_STRATEGY_ID);
}

function primaryStrategy(
  response: BacktestResponse,
): BacktestStrategySummary | undefined {
  const id = primaryStrategyId(response);
  return id ? response.strategies?.[id] : undefined;
}

function metricsFromSummary(
  summary: BacktestStrategySummary,
): StrategyBacktestMetric[] {
  return [
    {
      label: 'ROI',
      value: signedPct(summary.roi_percent),
      tone: summary.roi_percent >= 0 ? 'positive' : 'negative',
    },
    {
      label: 'Max drawdown',
      value: unsignedPct(summary.max_drawdown_percent),
      tone: 'negative',
    },
    {
      label: 'Sharpe',
      value: numberMetric(summary.sharpe_ratio),
      tone: 'accent',
    },
    {
      label: 'Calmar',
      value: numberMetric(summary.calmar_ratio),
      tone: 'accent',
    },
    {
      label: 'Volatility',
      value: unsignedPct(summary.volatility),
      tone: 'neutral',
    },
    {
      label: 'Win rate',
      value: unsignedPct(summary.win_rate_percent),
      tone: 'neutral',
    },
    {
      label: 'Trades',
      value: String(summary.trade_count),
      tone: 'neutral',
    },
    {
      label: 'Final value',
      value: formatUsd(summary.final_value),
      tone: 'positive',
    },
  ];
}

function chartDataFromTimeline(
  response: BacktestResponse,
  strategyId: string | undefined,
): number[] {
  if (!strategyId) {
    return [];
  }

  return (response.timeline ?? [])
    .map((point) => point.strategies?.[strategyId]?.portfolio.total_value)
    .filter((value): value is number => typeof value === 'number');
}

export function viewFromResponse(
  response: BacktestResponse,
): DefaultStrategyBacktestView | null {
  const strategyId = primaryStrategyId(response);
  const summary = primaryStrategy(response);
  if (!summary) {
    return null;
  }

  return {
    returnLabel: signedPct(summary.roi_percent),
    vsBtcLabel: `${summary.trade_count} trades`,
    vsEthLabel: `Max DD ${unsignedPct(summary.max_drawdown_percent)}`,
    metrics: metricsFromSummary(summary),
    displayName: summary.display_name,
    chartData: chartDataFromTimeline(response, strategyId),
  };
}

export function useDefaultStrategyBacktest(
  days?: number,
): UseDefaultStrategyBacktestResult {
  const query = useQuery({
    queryKey: ['desktop', 'strategy', 'default-backtest', days ?? 'default'],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const configs = await getStrategyConfigs();
      const options = typeof days === 'number' ? { days } : {};
      const response = await runBacktest(
        buildDefaultBacktestRequest(configs, options),
      );
      return viewFromResponse(response);
    },
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
