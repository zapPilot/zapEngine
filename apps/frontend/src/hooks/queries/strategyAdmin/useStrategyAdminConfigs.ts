/**
 * Query hook for listing all strategy admin configurations.
 */
import { useQuery } from "@tanstack/react-query";

import { createQueryConfig } from "@/hooks/queries/queryDefaults";
import { queryKeys } from "@/lib/state/queryClient";
import { getStrategyAdminConfigs } from "@/services";

const ADMIN_STALE_TIME = 30 * 1000; // 30 seconds — admin data changes infrequently

/**
 * Fetch all saved strategy configurations from the admin API.
 *
 * @returns React Query result with configs array
 *
 * @example
 * ```typescript
 * const { data: configs, isLoading } = useStrategyAdminConfigs();
 * ```
 */
export function useStrategyAdminConfigs() {
  return useQuery({
    ...createQueryConfig(),
    queryKey: queryKeys.strategyAdmin.configs(),
    queryFn: async () => {
      const response = await getStrategyAdminConfigs();
      return response.configs;
    },
    staleTime: ADMIN_STALE_TIME,
  });
}
