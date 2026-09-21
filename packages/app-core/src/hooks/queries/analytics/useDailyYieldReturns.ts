import { createQueryConfig } from '@core/hooks/queries/queryDefaults';
import { queryKeys } from '@core/lib/state/queryClient';
import {
  type DailyYieldReturnsResponse,
  getDailyYieldReturns,
} from '@core/services/analyticsService';
import { useQuery } from '@tanstack/react-query';

/**
 * Daily yield attribution for one subject and window.
 *
 * Every reader shares this cache slice, so a post-ETL `dailyYield.byUser`
 * invalidation refreshes all of them at once. `walletFilter` is `null` for the
 * bundle aggregation. Timing and retry come from the shared ETL profile.
 */
export function useDailyYieldReturns(
  userId: string | undefined,
  days: number,
  walletFilter: string | null = null,
) {
  // Explicit TError: the shared retry predicate takes `unknown`, which would
  // otherwise widen this hook's published error type.
  return useQuery<DailyYieldReturnsResponse, Error>({
    ...createQueryConfig(),
    queryKey: queryKeys.dailyYield.list(userId, days, walletFilter),
    queryFn: () => {
      if (!userId) {
        throw new Error('User ID is required');
      }
      return getDailyYieldReturns(userId, days, walletFilter ?? undefined);
    },
    enabled: !!userId,
  });
}
