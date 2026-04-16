import {
  ETH_BTC_ROTATION_DEFAULT_CONFIG_ID,
  ETH_BTC_ROTATION_STRATEGY_ID,
} from "@/components/wallet/portfolio/views/backtesting/constants";

import { useStrategyConfigs } from "./useStrategyConfigs";

/**
 * Derives the default preset config ID from strategy configs.
 *
 * Prefers the backend default flag, then the curated ETH/BTC rotation preset,
 * then the first ETH/BTC rotation strategy, then falls back to the first preset.
 *
 * @param enabled - Whether to enable the underlying configs query
 * @returns The config_id of the default preset, or undefined if not yet loaded
 */
export function useDefaultPresetId(enabled: boolean): string | undefined {
  const { data: configsResponse } = useStrategyConfigs(enabled);

  const presets = configsResponse?.presets ?? [];
  const preferredPreset =
    presets.find(p => p.is_default) ??
    presets.find(p => p.config_id === ETH_BTC_ROTATION_DEFAULT_CONFIG_ID) ??
    presets.find(p => p.strategy_id === ETH_BTC_ROTATION_STRATEGY_ID) ??
    presets[0];

  return preferredPreset?.config_id;
}
