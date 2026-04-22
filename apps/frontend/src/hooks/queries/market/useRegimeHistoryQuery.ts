/**
 * Regime History Query Hook
 *
 * Fetches market regime transition history with graceful error handling.
 * Extracted from regimeHistoryService.ts to maintain service layer purity.
 */
import { useQuery } from '@tanstack/react-query';

import {
  createQueryConfig,
  logQueryError,
} from '@/hooks/queries/queryDefaults';
import { queryKeys } from '@/lib/state/queryClient';
import { DEFAULT_REGIME_HISTORY, fetchRegimeHistory } from '@/services';

const REGIME_HISTORY_CACHE_MS = 60 * 1000; // 60 seconds (regime transitions are infrequent)

/**
 * React Query hook for regime history with caching and graceful error handling
 *
 * Configuration:
 * - Frontend cache: 60 seconds (aligned with sentiment data)
 * - Auto refetch: Every 60 seconds
 * - Retry: Once on failure
 * - Error handling: Never throws, returns DEFAULT_REGIME_HISTORY on error
 *
 * The hook is designed to fail gracefully - errors are logged but don't
 * disrupt the UI. Portfolio display continues with default neutral regime.
 *
 * @example
 * ```typescript
 * const { data, isLoading } = useRegimeHistory();
 *
 * // data is always defined, never null
 * // errors are handled silently
 * if (data.previousRegime) {
 *   // Show directional strategy
 * }
 * ```
 */
export function useRegimeHistory() {
  return useQuery({
    ...createQueryConfig(),
    queryKey: queryKeys.sentiment.regimeHistory(),
    queryFn: async () => {
      try {
        return await fetchRegimeHistory(2);
      } catch (error) {
        // Log error for debugging but don't throw
        logQueryError('Failed to fetch regime history, using defaults', error);

        // Return default data instead of throwing
        return DEFAULT_REGIME_HISTORY;
      }
    },
    staleTime: REGIME_HISTORY_CACHE_MS,
    gcTime: REGIME_HISTORY_CACHE_MS * 3,
    refetchInterval: REGIME_HISTORY_CACHE_MS,
    retry: 1,
    // Critical: Return default data on error, never leave data undefined
    placeholderData: DEFAULT_REGIME_HISTORY,
  });
}
