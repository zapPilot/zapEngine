import { CACHE_WINDOW } from '@core/config/cacheWindow';
import { refreshPortfolioQueryCaches } from '@core/lib/state/portfolioQueryRefresh';
import { queryKeys } from '@core/lib/state/queryClient';
import {
  getLandingPagePortfolioData,
  type LandingPageResponse,
} from '@core/services/analyticsService';
import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect } from 'react';

import { createQueryConfig } from '../queryDefaults';

/**
 * Last `last_updated` this client has already reacted to, per user.
 *
 * Home mounts several observers of this query (the balance header, the
 * progressive loader, the portfolio tab); without a shared record each of them
 * would fire its own invalidation sweep for the same snapshot change.
 */
const observedSnapshots = new WeakMap<QueryClient, Map<string, string>>();

function isNewSnapshot(
  queryClient: QueryClient,
  userId: string,
  lastUpdated: string,
): boolean {
  let observed = observedSnapshots.get(queryClient);
  if (!observed) {
    observed = new Map<string, string>();
    observedSnapshots.set(queryClient, observed);
  }
  const previous = observed.get(userId);
  observed.set(userId, lastUpdated);
  // First observation is the baseline, not a change: invalidating here would
  // re-fetch the whole home bundle on every cold load.
  return previous !== undefined && previous !== lastUpdated;
}

/**
 * Hook for landing page core data (Balance, ROI, PnL)
 *
 * PERFORMANCE OPTIMIZATION: Fetches only the core portfolio data without yield summary.
 * This allows Balance, ROI, and PnL metrics to render immediately (~300ms) without
 * waiting for the slower yield calculations (~1500ms).
 *
 * This is also home's only recurring poll, and the only thing in a long-open
 * session that can notice the *scheduled* daily ETL — user-triggered imports
 * are covered by `useEtlJobPolling`. When the snapshot it reports moves, the
 * other home queries are invalidated so the screen stays internally
 * consistent instead of mixing two ETL runs.
 *
 * @param userId - User wallet address or user ID
 * @param isEtlInProgress - Whether ETL data fetch is currently in progress (disables query during ETL)
 * @param isActive - Whether the consumer view is currently active. When false, the
 *   query is disabled so non-dashboard tabs
 *   (e.g. Analytics, Invest > Market, Backtesting) don't trigger `/landing` traffic.
 */
export function useLandingPageData(
  userId: string | null | undefined,
  isEtlInProgress = false,
  isActive = true,
) {
  const queryClient = useQueryClient();
  // Read inside the hook: CACHE_WINDOW resolves env lazily, and module scope
  // runs before the host injects it.
  const snapshotPollIntervalMs = CACHE_WINDOW.staleTimeMs;

  const query = useQuery({
    ...createQueryConfig({
      retryConfig: {
        skipErrorMessages: ['USER_NOT_FOUND', '404'],
      },
    }),
    queryKey: queryKeys.portfolio.landingPage(userId || ''),
    queryFn: async (): Promise<LandingPageResponse> => {
      if (!userId) {
        throw new Error('User ID is required');
      }
      return getLandingPagePortfolioData(userId);
    },
    enabled: Boolean(userId) && !isEtlInProgress && isActive,
    refetchInterval: isActive ? snapshotPollIntervalMs : false,
  });

  const lastUpdated = query.data?.last_updated;

  useEffect(() => {
    if (!userId || !lastUpdated) return;
    if (!isNewSnapshot(queryClient, userId, lastUpdated)) return;
    void refreshPortfolioQueryCaches(queryClient, userId, {
      excludeLandingPage: true,
    });
  }, [queryClient, userId, lastUpdated]);

  return query;
}
