import { queryKeys } from '@core/lib/state/queryClient';
import { getDailyYieldReturns } from '@core/services/analyticsService';
import { useQuery } from '@tanstack/react-query';

/**
 * Daily yield attribution for one subject and window.
 *
 * Every reader shares this cache slice, so a post-ETL `dailyYield.byUser`
 * invalidation refreshes all of them at once. `walletFilter` is `null` for the
 * bundle aggregation.
 */
export function useDailyYieldReturns(
  userId: string | undefined,
  days: number,
  walletFilter: string | null = null,
) {
  return useQuery({
    queryKey: queryKeys.dailyYield.list(userId, days, walletFilter),
    queryFn: () => {
      if (!userId) {
        throw new Error('User ID is required');
      }
      return getDailyYieldReturns(userId, days, walletFilter ?? undefined);
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 2,
  });
}
