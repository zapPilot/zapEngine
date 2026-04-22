/**
 * Query string utilities for analytics service
 *
 * Provides reusable functions for building URL query strings
 * with type-safe parameter handling.
 */

import type { DashboardWindowParams } from '@/services';

/**
 * Numeric parameter keys for dashboard window params
 * Used for type-safe iteration over numeric fields
 */
const NUMERIC_PARAM_KEYS: readonly (keyof Omit<
  DashboardWindowParams,
  'metrics'
>)[] = [
  'trend_days',
  'risk_days',
  'drawdown_days',
  'allocation_days',
  'rolling_days',
] as const;

/**
 * Builds a URL query string from dashboard window parameters
 *
 * Handles:
 * - Numeric parameters (converted to strings)
 * - Metrics array (joined with commas)
 * - Wallet address filter
 * - Undefined values (skipped)
 *
 * @param params - Dashboard window parameters
 * @returns Query string with leading '?' or empty string if no params
 *
 * @example
 * buildAnalyticsQueryString({ trend_days: 30 })
 * // Returns: "?trend_days=30"
 *
 * @example
 * buildAnalyticsQueryString({ trend_days: 30, metrics: ['sharpe', 'volatility'] })
 * // Returns: "?trend_days=30&metrics=sharpe,volatility"
 *
 * @example
 * buildAnalyticsQueryString({})
 * // Returns: ""
 */
export function buildAnalyticsQueryString(
  params: DashboardWindowParams,
): string {
  const query = new URLSearchParams();

  // Add numeric parameters
  for (const key of NUMERIC_PARAM_KEYS) {
    const value = params[key];
    if (value !== undefined) {
      query.set(key, String(value));
    }
  }

  // Add metrics array if present
  if (params.metrics?.length) {
    query.set('metrics', params.metrics.join(','));
  }

  // Add wallet address filter if present
  if (params.wallet_address) {
    query.set('wallet_address', params.wallet_address);
  }

  const queryString = query.toString();
  return queryString ? `?${queryString}` : '';
}
