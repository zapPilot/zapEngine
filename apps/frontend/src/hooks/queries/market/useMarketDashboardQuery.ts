import { useQuery } from '@tanstack/react-query';

import { getMarketDashboardData } from '@/services';

import { createQueryConfig } from '../queryDefaults';

/**
 * React Query hook for fetching market dashboard data
 *
 * Combines BTC price, 200 DMA, and Fear & Greed Index into a single time series.
 * Replaces manual useState + useEffect fetching in MarketDashboardView.
 *
 * @param days - Number of days of history (default: 365)
 * @param token - Token symbol (default: 'btc')
 * @returns React Query result with market dashboard snapshots
 *
 * @example
 * ```typescript
 * const { data, isLoading, error } = useMarketDashboardQuery(365);
 *
 * if (data?.snapshots) {
 *   console.log(`Loaded ${data.count} market snapshots`);
 * }
 * ```
 */
export function useMarketDashboardQuery(days = 365, token = 'btc') {
  return useQuery({
    queryKey: ['market-dashboard', days, token.toLowerCase()],
    queryFn: () => getMarketDashboardData(days, token),
    ...createQueryConfig({
      dataType: 'etl',
    }),
    refetchOnWindowFocus: false,
  });
}
