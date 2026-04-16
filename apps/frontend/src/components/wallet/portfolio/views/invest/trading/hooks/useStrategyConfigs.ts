/**
 * React Query hook for fetching the shared strategy bootstrap payload.
 */

import { useQuery } from "@tanstack/react-query";

import { getStrategyConfigs } from "@/services";
import type { StrategyConfigsResponse } from "@/types/strategy";

export const strategyConfigKeys = {
  all: ["strategy-configs"] as const,
};

/**
 * Fetch strategy families, public presets, and backtest defaults.
 *
 * @param enabled - Whether to enable the query (default: true)
 * @returns Query result with StrategyConfigsResponse containing strategies,
 * presets, and backtest_defaults
 */
export function useStrategyConfigs(enabled = true) {
  return useQuery<StrategyConfigsResponse, Error>({
    queryKey: strategyConfigKeys.all,
    queryFn: () => getStrategyConfigs(),
    enabled,
    staleTime: 24 * 60 * 60 * 1000, // 24h
    gcTime: 48 * 60 * 60 * 1000, // 48h
    retry: 1,
  });
}
