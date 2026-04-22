/**
 * useAnalyticsData Hook
 *
 * Custom hook for fetching and transforming analytics data for the V22 Analytics tab.
 * Orchestrates multiple API calls and applies pure transformation functions.
 */

import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';

import { getAnalyticsStaleTime } from '@/lib/analytics/cacheConfig';
import {
  aggregateMonthlyPnL,
  calculateKeyMetrics,
  transformToDrawdownChart,
  transformToPerformanceChart,
} from '@/lib/analytics/transformers';
import { getDailyYieldReturns } from '@/services';
import type {
  AnalyticsData,
  AnalyticsTimePeriod,
  WalletFilter,
} from '@/types/analytics';

import { usePortfolioDashboard } from '../../analytics/usePortfolioDashboard';

/**
 * Hook return type
 */
interface UseAnalyticsDataReturn {
  /** Transformed analytics data ready for rendering */
  data: AnalyticsData | null;
  /** Loading state (true while primary dashboard query is loading) */
  isLoading: boolean;
  /** Loading state for monthly PnL data (independent from dashboard) */
  isMonthlyPnLLoading: boolean;
  /** Error from any query */
  error: Error | null;
  /** Refetch function to manually refresh data */
  refetch: () => void;
}

/**
 * Fetch and transform analytics data for V22 Analytics tab
 *
 * Uses the unified dashboard endpoint as primary data source (96% faster),
 * with a secondary call for monthly PnL data. All transformations are memoized.
 *
 * @param userId - User wallet address or ID
 * @param timePeriod - Selected time window for analytics
 * @param walletFilter - Optional wallet address filter (null = bundle aggregation, string = specific wallet)
 * @returns Analytics data with loading/error states and refetch function
 *
 * @example
 * // Bundle-level analytics (all wallets)
 * const { data, isLoading, error, refetch } = useAnalyticsData(userId, {
 *   key: '1Y',
 *   days: 365,
 *   label: '1Y'
 * });
 *
 * // Wallet-specific analytics
 * const walletData = useAnalyticsData(userId, timePeriod, '0x1234...5678');
 *
 * if (isLoading) return <LoadingSkeleton />;
 * if (error) return <ErrorState error={error} onRetry={refetch} />;
 * if (!data) return null;
 *
 * return <AnalyticsCharts data={data} />;
 */
export function useAnalyticsData(
  userId: string | undefined,
  timePeriod: AnalyticsTimePeriod,
  walletFilter?: WalletFilter,
): UseAnalyticsDataReturn {
  // ============================================================================
  // PERIOD CHANGE DETECTION
  // ============================================================================

  // Track previous period to detect changes and force refetch
  const prevPeriodRef = useRef<number>(timePeriod.days);
  const periodChanged = prevPeriodRef.current !== timePeriod.days;

  // Update ref after render
  useEffect(() => {
    prevPeriodRef.current = timePeriod.days;
  }, [timePeriod.days]);

  // ============================================================================
  // PRIMARY QUERY: Unified Dashboard (96% faster than 6 separate calls)
  // ============================================================================

  const dashboardQuery = usePortfolioDashboard(
    userId,
    {
      trend_days: timePeriod.days,
      drawdown_days: timePeriod.days,
      rolling_days: timePeriod.days,
      ...(walletFilter && { wallet_address: walletFilter }), // Include wallet filter only if truthy
    },
    {
      // Force refetch when period changes to bypass staleTime cache
      // Wallet-specific data: 2min cache, Bundle data: 12hr cache
      staleTime: getAnalyticsStaleTime(periodChanged, walletFilter),
      refetchOnMount: periodChanged ? 'always' : false,
    },
  );

  // ============================================================================
  // TERTIARY QUERY: Monthly PnL (conditional on dashboard success)
  // ============================================================================

  const monthlyPnLQuery = useQuery({
    queryKey: ['dailyYield', userId, timePeriod.days, walletFilter], // Include wallet filter in cache key
    queryFn: () => {
      if (!userId) {
        throw new Error('User ID is required');
      }
      return getDailyYieldReturns(
        userId,
        timePeriod.days,
        walletFilter ?? undefined,
      ); // Pass wallet filter to API, convert null to undefined
    },
    enabled: !!userId && !!dashboardQuery.data,
    staleTime: 5 * 60 * 1000, // 5 minutes (matches yield summary cache)
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 2,
  });

  // ============================================================================
  // DATA TRANSFORMATION (Memoized)
  // ============================================================================

  const data = useMemo<AnalyticsData | null>(() => {
    // If no dashboard data available, return null
    if (!dashboardQuery.data) {
      return null;
    }

    // Get daily values for monthly PnL calculation
    const dailyValues = dashboardQuery.data.trends?.daily_values ?? [];

    return {
      performanceChart: transformToPerformanceChart(dashboardQuery.data),
      drawdownChart: transformToDrawdownChart(dashboardQuery.data),
      keyMetrics: calculateKeyMetrics(dashboardQuery.data),
      monthlyPnL: monthlyPnLQuery.data
        ? aggregateMonthlyPnL(monthlyPnLQuery.data, dailyValues)
        : [], // Graceful degradation if PnL query fails
    };
  }, [dashboardQuery.data, monthlyPnLQuery.data]);

  // ============================================================================
  // ERROR HANDLING
  // ============================================================================

  // Prioritize dashboard error (critical), fallback to monthly PnL error
  const error = dashboardQuery.error ?? monthlyPnLQuery.error ?? null;

  // ============================================================================
  // REFETCH HANDLER
  // ============================================================================

  const refetch = () => {
    void dashboardQuery.refetch();
    if (dashboardQuery.data) {
      void monthlyPnLQuery.refetch();
    }
  };

  return {
    data,
    // Show loading during initial fetch OR refetch
    // Previously: false during initial load (when dashboardQuery.data is null)
    // Fixed: true when loading the first time or fetching fresh data
    isLoading: dashboardQuery.isLoading || dashboardQuery.isFetching,
    // Independent loading state for monthly PnL (yield/daily endpoint)
    isMonthlyPnLLoading:
      monthlyPnLQuery.isLoading || monthlyPnLQuery.isFetching,
    error: dashboardQuery.data ? error : null,
    refetch,
  };
}
