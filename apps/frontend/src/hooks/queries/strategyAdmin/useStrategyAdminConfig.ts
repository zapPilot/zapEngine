/**
 * Query hook for fetching a single strategy admin configuration.
 */
import { useQuery } from "@tanstack/react-query";

import { createQueryConfig } from "@/hooks/queries/queryDefaults";
import { queryKeys } from "@/lib/state/queryClient";
import { getStrategyAdminConfig } from "@/services";

/**
 * Fetch a single saved strategy configuration by ID.
 *
 * @param configId - The config_id to fetch, or null to skip
 * @returns React Query result with the config
 *
 * @example
 * ```typescript
 * const { data: config } = useStrategyAdminConfig("dma_gated_fgi_default");
 * ```
 */
export function useStrategyAdminConfig(configId: string | null) {
  return useQuery({
    ...createQueryConfig(),
    queryKey: queryKeys.strategyAdmin.config(configId ?? ""),
    queryFn: async () => {
      const response = await getStrategyAdminConfig(configId!);
      return response.config;
    },
    enabled: Boolean(configId),
  });
}
