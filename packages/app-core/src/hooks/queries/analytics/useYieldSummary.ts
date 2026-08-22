import { createQueryConfig } from '@core/hooks/queries/queryDefaults';
import { queryKeys } from '@core/lib/state/queryClient';
import { getYieldSummary } from '@core/services/analyticsService';
import { useQuery } from '@tanstack/react-query';

export function useYieldSummary(
  userId: string | undefined,
  walletAddress?: string,
) {
  const walletFilter = walletAddress ?? 'bundle';
  return useQuery({
    ...createQueryConfig(),
    queryKey: userId
      ? queryKeys.portfolio.yieldSummary(userId, walletFilter)
      : [],
    queryFn: async () => {
      if (!userId) throw new Error('userId is required to fetch yield summary');
      return getYieldSummary(userId, walletAddress ? { walletAddress } : {});
    },
    enabled: !!userId,
  });
}
