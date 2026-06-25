/**
 * Market Sentiment Query Hook
 *
 * Fetches and caches market sentiment data.
 * Extracted from sentimentService.ts to maintain service layer purity.
 */
import { useQuery } from '@tanstack/react-query';

import {
  createLoggedQueryFn,
  createQueryConfig,
} from '@core/hooks/queries/queryDefaults';
import { queryKeys } from '@core/lib/state/queryClient';
import { fetchMarketSentiment } from '@core/services';

const SENTIMENT_CACHE_MS = 10 * 60 * 1000; // 10 minutes (matches backend cache)

/**
 * Hook to fetch market sentiment data
 *
 * @param enabled - Whether the query should execute
 * @returns React Query result with market sentiment data
 */
export function useSentimentData(enabled = true) {
  return useQuery({
    ...createQueryConfig(),
    queryKey: queryKeys.sentiment.market(),
    queryFn: createLoggedQueryFn(
      'Failed to fetch market sentiment',
      fetchMarketSentiment,
    ),
    staleTime: SENTIMENT_CACHE_MS,
    gcTime: SENTIMENT_CACHE_MS * 3,
    enabled,
    retry: 1,
  });
}
