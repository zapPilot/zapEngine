import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/state/queryClient';
import {
  getLandingPagePortfolioData,
  type LandingPageResponse,
} from '@/services';

import { createQueryConfig } from '../queryDefaults';

const PORTFOLIO_REFETCH_INTERVAL = 5 * 60 * 1000; // 5 minutes

/**
 * Hook for landing page core data (Balance, ROI, PnL)
 *
 * PERFORMANCE OPTIMIZATION: Fetches only the core portfolio data without yield summary.
 * This allows Balance, ROI, and PnL metrics to render immediately (~300ms) without
 * waiting for the slower yield calculations (~1500ms).
 *
 * @param userId - User wallet address or user ID
 * @param isEtlInProgress - Whether ETL data fetch is currently in progress (disables query during ETL)
 * @param isActive - Whether the consumer view is currently active. When false, the
 *   query is disabled and the periodic refetch loop is paused so non-dashboard tabs
 *   (e.g. Analytics, Invest > Market, Backtesting) don't trigger `/landing` traffic.
 */
export function useLandingPageData(
  userId: string | null | undefined,
  isEtlInProgress = false,
  isActive = true,
) {
  return useQuery({
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
    refetchInterval: isActive ? PORTFOLIO_REFETCH_INTERVAL : false,
  });
}
