import type {
  BacktestCompareConfigV3,
  BacktestRequest,
  BacktestStrategyCatalogEntryV3,
} from "@/types/backtesting";
import type { BacktestDefaults, StrategyPreset } from "@/types/strategy";

import {
  DEFAULT_DAYS,
  DEFAULT_TOTAL_CAPITAL,
  ETH_BTC_ROTATION_STRATEGY_ID,
  getDefaultConfigIdForStrategyId,
} from "../constants";

/** Fallback defaults when API response is unavailable. */
export const FALLBACK_DEFAULTS: BacktestDefaults = {
  days: DEFAULT_DAYS,
  total_capital: DEFAULT_TOTAL_CAPITAL,
};

function getPreferredPresetForStrategyId(
  presets: StrategyPreset[],
  strategyId: string
): StrategyPreset | undefined {
  return (
    presets.find(
      preset => preset.strategy_id === strategyId && preset.is_default
    ) ?? presets.find(preset => preset.strategy_id === strategyId)
  );
}

function buildPresetBackedCompareConfig(
  preset: StrategyPreset
): BacktestCompareConfigV3 {
  return {
    config_id: preset.config_id,
    saved_config_id: preset.config_id,
  };
}

function buildAdhocCompareConfig(
  strategyId: string,
  defaultParams?: BacktestCompareConfigV3["params"]
): BacktestCompareConfigV3 {
  return {
    config_id: getDefaultConfigIdForStrategyId(strategyId),
    strategy_id: strategyId,
    ...(defaultParams !== undefined && { params: defaultParams }),
  };
}

export function buildCompareConfigForStrategyId(
  strategyId: string,
  presets: StrategyPreset[],
  strategies: BacktestStrategyCatalogEntryV3[]
): BacktestCompareConfigV3 {
  const preset = getPreferredPresetForStrategyId(presets, strategyId);
  if (preset) {
    return buildPresetBackedCompareConfig(preset);
  }
  const strategy = strategies.find(entry => entry.strategy_id === strategyId);
  return buildAdhocCompareConfig(strategyId, strategy?.default_params);
}

/**
 * Build default backtest payload from curated strategy presets.
 * Sends only the default (first) preset to avoid unnecessary backend computation.
 * The backend compare endpoint auto-injects the DCA baseline when needed.
 */
export function buildDefaultPayloadFromPresets(
  presets: StrategyPreset[],
  defaults: BacktestDefaults
): BacktestRequest {
  const seenConfigIds = new Set<string>();
  const orderedPresets = [...presets].sort(
    (left, right) => Number(right.is_default) - Number(left.is_default)
  );

  // Find the first non-duplicate preset (the default one)
  const defaultPreset = orderedPresets.find(preset => {
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
    configs: [buildPresetBackedCompareConfig(defaultPreset)],
  };
}

/**
 * Build a single live-strategy payload from the strategy family catalog.
 * The backend compare endpoint auto-injects the DCA baseline.
 */
export function buildDefaultPayloadFromStrategies(
  strategies: BacktestStrategyCatalogEntryV3[] | null,
  defaults: BacktestDefaults = FALLBACK_DEFAULTS
): BacktestRequest {
  const ethBtcRotation = strategies?.find(
    strategy => strategy.strategy_id === ETH_BTC_ROTATION_STRATEGY_ID
  );
  const defaultParams = ethBtcRotation?.default_params ?? {};

  return {
    days: defaults.days,
    total_capital: defaults.total_capital,
    configs: [
      buildAdhocCompareConfig(ETH_BTC_ROTATION_STRATEGY_ID, defaultParams),
    ],
  };
}
