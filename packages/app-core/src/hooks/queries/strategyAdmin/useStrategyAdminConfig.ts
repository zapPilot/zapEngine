/**
 * Query hook for fetching a single strategy admin configuration.
 */
import { createQueryConfig } from '@core/hooks/queries/queryDefaults';
import { queryKeys } from '@core/lib/state/queryClient';
import { getStrategyAdminConfig } from '@core/services';
import { useQuery } from '@tanstack/react-query';

/**
 * Fetch a single saved strategy configuration by ID.
 *
 * @param configId - The config_id to fetch, or null to skip
 * @returns React Query result with the config
 *
 * @example
 * ```typescript
 * const { data: config } = useStrategyAdminConfig("dma_fgi_portfolio_rules_default");
 * ```
 */
export function useStrategyAdminConfig(configId: string | null) {
  return useQuery({
    ...createQueryConfig(),
    queryKey: queryKeys.strategyAdmin.config(configId ?? ''),
    queryFn: async () => {
      const response = await getStrategyAdminConfig(configId!);
      return response.config;
    },
    enabled: Boolean(configId),
  });
}
