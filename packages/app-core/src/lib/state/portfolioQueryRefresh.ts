/**
 * Post-ETL cache refresh for the portfolio surface.
 *
 * Two callers share it: `useEtlJobPolling` after a user-triggered wallet
 * import, and `useLandingPageData` when the canonical snapshot moves under a
 * long-open session. Keeping one list means a new home query cannot be
 * refreshed by one path and left stale by the other.
 */

import type { QueryClient } from '@tanstack/react-query';

import { queryKeys } from './queryClient';

interface RefreshOptions {
  /**
   * Skip the landing-page slice. Used by the landing query itself, which has
   * already produced the fresh snapshot that triggered the refresh.
   */
  excludeLandingPage?: boolean;
}

export async function refreshPortfolioQueryCaches(
  queryClient: QueryClient,
  userId: string | null,
  options: RefreshOptions = {},
): Promise<void> {
  const invalidations: Promise<void>[] = [
    queryClient.invalidateQueries({
      queryKey: queryKeys.portfolio.all,
      ...(options.excludeLandingPage && {
        predicate: (query) => query.queryKey[1] !== 'landing-page',
      }),
    }),
  ];

  if (userId) {
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: queryKeys.portfolioDashboard.byUser(userId),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.dailyYield.byUser(userId),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.desktop.portfolio.dailyYieldByUser(userId),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.desktop.strategySuggestion(userId),
      }),
    );
  }

  await Promise.all(invalidations);
}
