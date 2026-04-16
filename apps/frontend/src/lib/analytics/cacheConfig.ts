/**
 * Analytics cache time configuration
 *
 * Defines stale time values for React Query caching of analytics data.
 * These values optimize performance while ensuring data freshness based on context.
 */
const ANALYTICS_CACHE_TIME = {
  /**
   * No caching when period changes
   * Forces immediate refetch to ensure users see updated data for new time periods
   */
  PERIOD_CHANGE: 0,

  /**
   * 2-minute cache for wallet-specific views
   * Shorter cache for personal portfolio data that may change frequently
   */
  WALLET: 2 * 60 * 1000,

  /**
   * 12-hour cache for shared bundle views
   * Longer cache for public bundle views that change less frequently
   * Reduces API load for high-traffic shared portfolios
   */
  BUNDLE: 12 * 60 * 60 * 1000,
} as const;

/**
 * Calculates appropriate stale time for analytics queries
 *
 * Cache strategy:
 * - Period changes: No cache (immediate refetch)
 * - Wallet view: 2-minute cache (frequent updates)
 * - Bundle view: 12-hour cache (stable public data)
 *
 * @param periodChanged - Whether the time period filter has changed
 * @param walletFilter - Wallet address if viewing specific wallet, null for bundles
 * @returns Stale time in milliseconds for React Query configuration
 *
 * @example
 * ```typescript
 * staleTime: getAnalyticsStaleTime(periodChanged, walletFilter),
 * ```
 */
export function getAnalyticsStaleTime(
  periodChanged: boolean,
  walletFilter?: string | null
): number {
  if (periodChanged) return ANALYTICS_CACHE_TIME.PERIOD_CHANGE;
  return walletFilter
    ? ANALYTICS_CACHE_TIME.WALLET
    : ANALYTICS_CACHE_TIME.BUNDLE;
}
