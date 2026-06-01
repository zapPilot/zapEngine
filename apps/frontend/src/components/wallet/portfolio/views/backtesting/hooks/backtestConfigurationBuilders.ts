import type {
  BacktestCompareConfigV3,
  BacktestRequest,
  BacktestStrategyCatalogEntryV3,
} from '@/types/backtesting';
import type { BacktestDefaults, StrategyPreset } from '@/types/strategy';

import {
  DCA_CLASSIC_STRATEGY_ID,
  DEFAULT_DAYS,
  DEFAULT_TOTAL_CAPITAL,
  DMA_FGI_PORTFOLIO_RULES_STRATEGY_ID,
  getDefaultConfigIdForStrategyId,
} from '../constants';

/** Fallback defaults when API response is unavailable. */
export const FALLBACK_DEFAULTS: BacktestDefaults = {
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

function buildPresetBackedCompareConfig(
  preset: StrategyPreset,
): BacktestCompareConfigV3 {
  return {
    config_id: preset.config_id,
    saved_config_id: preset.config_id,
  };
}

function buildAdhocCompareConfig(
  strategyId: string,
  defaultParams?: BacktestCompareConfigV3['params'],
): BacktestCompareConfigV3 {
  return {
    config_id: getDefaultConfigIdForStrategyId(strategyId),
    strategy_id: strategyId,
    ...(defaultParams !== undefined && { params: defaultParams }),
  };
}

/** Adhoc DCA Classic baseline config — drawn as a dashed reference line on the chart. */
function buildDcaBaselineConfig(): BacktestCompareConfigV3 {
  return {
    config_id: DCA_CLASSIC_STRATEGY_ID,
    strategy_id: DCA_CLASSIC_STRATEGY_ID,
    params: {},
  };
}

export function buildCompareConfigForStrategyId(
  strategyId: string,
  presets: StrategyPreset[],
  strategies: BacktestStrategyCatalogEntryV3[],
): BacktestCompareConfigV3 {
  const preset = getPreferredPresetForStrategyId(presets, strategyId);
  if (preset) {
    return buildPresetBackedCompareConfig(preset);
  }
  const strategy = strategies.find((entry) => entry.strategy_id === strategyId);
  return buildAdhocCompareConfig(strategyId, strategy?.default_params);
}

/**
 * Build a compare config for a specific preset, selected by its config_id.
 *
 * This is the config-level counterpart to {@link buildCompareConfigForStrategyId}:
 * the backtesting dropdown selects presets (so default vs optimized variants of
 * the same strategy are distinct options). Falls back to a strategy-id lookup
 * when the config_id is not a known preset (e.g. an adhoc catalog strategy_id).
 */
export function buildCompareConfigForConfigId(
  configId: string,
  presets: StrategyPreset[],
  strategies: BacktestStrategyCatalogEntryV3[],
): BacktestCompareConfigV3 {
  const preset = presets.find((entry) => entry.config_id === configId);
  if (preset) {
    return buildPresetBackedCompareConfig(preset);
  }
  return buildCompareConfigForStrategyId(configId, presets, strategies);
}

/**
 * Build default backtest payload from curated strategy presets.
 * Sends only the default (first) preset to avoid unnecessary backend computation.
 */
export function buildDefaultPayloadFromPresets(
  presets: StrategyPreset[],
  defaults: BacktestDefaults,
): BacktestRequest {
  const seenConfigIds = new Set<string>();
  const orderedPresets = [...presets].sort(
    (left, right) => Number(right.is_default) - Number(left.is_default),
  );

  // Find the first non-duplicate preset (the default one)
  const defaultPreset = orderedPresets.find((preset) => {
    if (seenConfigIds.has(preset.config_id)) {
      return false;
    }
    seenConfigIds.add(preset.config_id);
    return true;
  });

  if (!defaultPreset) {
    return buildDefaultPayloadFromStrategies(null, defaults);
  }

  return {
    days: defaults.days,
    total_capital: defaults.total_capital,
    configs: [
      buildDcaBaselineConfig(),
      buildPresetBackedCompareConfig(defaultPreset),
    ],
  };
}

/**
 * Build a single live-strategy payload from the strategy family catalog.
 */
export function buildDefaultPayloadFromStrategies(
  strategies: BacktestStrategyCatalogEntryV3[] | null,
  defaults: BacktestDefaults = FALLBACK_DEFAULTS,
): BacktestRequest {
  const portfolioRules = strategies?.find(
    (strategy) => strategy.strategy_id === DMA_FGI_PORTFOLIO_RULES_STRATEGY_ID,
  );
  const defaultParams = portfolioRules?.default_params ?? {};

  return {
    days: defaults.days,
    total_capital: defaults.total_capital,
    configs: [
      buildDcaBaselineConfig(),
      buildAdhocCompareConfig(
        DMA_FGI_PORTFOLIO_RULES_STRATEGY_ID,
        defaultParams,
      ),
    ],
  };
}
