/**
 * API service for analytics-engine integration
 * Uses service-specific HTTP utilities for consistent error handling
 */

import { buildAnalyticsQueryString } from "@/lib/analytics/queryStringUtils";
import { httpUtils } from "@/lib/http";
import {
  type BorrowingPositionsResponse,
  type DailyYieldReturnsResponse,
  type LandingPageResponse,
  type MarketDashboardResponse,
  type UnifiedDashboardResponse,
  validateBorrowingPositionsResponse,
  validateDailyYieldReturnsResponse,
  validateLandingPageResponse,
  validateMarketDashboardResponse,
  validateUnifiedDashboardResponse,
} from "@/schemas/api/analyticsSchemas";

// Re-export types for external use
export type {
  BorrowingPosition,
  BorrowingPositionsResponse,
  BorrowingSummary,
  /** @public */ DailyYieldReturnsResponse,
  LandingPageResponse,
  MarketDashboardPoint,
  MarketDashboardResponse,
  PoolDetail,
  RiskMetrics,
  UnifiedDashboardResponse,
} from "@/schemas/api/analyticsSchemas";

/**
 * Query parameters for the unified dashboard endpoint.
 *
 * All fields are optional and map directly to analytics-engine query params.
 * Values are coerced to strings when building the request URL.
 */
export interface DashboardWindowParams {
  trend_days?: number;
  drawdown_days?: number;
  rolling_days?: number;
  metrics?: string[];
  risk_days?: number;
  allocation_days?: number;
  /** Optional wallet address filter - when provided, returns wallet-specific analytics instead of bundle aggregation */
  wallet_address?: string;
}

/**
 * Get unified landing page portfolio data
 *
 * Combines portfolio summary, APR calculations, and pre-formatted data
 * in a single API call for optimal performance. Implements BFF pattern.
 */
export async function getLandingPagePortfolioData(
  userId: string
): Promise<LandingPageResponse> {
  const endpoint = `/api/v2/portfolio/${userId}/landing`;
  const response = await httpUtils.analyticsEngine.get(endpoint);
  return validateLandingPageResponse(response);
}

// ============================================================================
// UNIFIED DASHBOARD ENDPOINT (Performance Optimized - 96% faster)
// ============================================================================

/**
 * Get unified portfolio dashboard analytics (Performance Optimized)
 *
 * **NEW UNIFIED ENDPOINT** - Replaces 6 separate API calls with 1 optimized call:
 * - 96% faster loading (1500ms → 55ms with cache)
 * - 95% database load reduction (6 queries/view → 6 queries/12h)
 * - 83% network overhead reduction (6 requests → 1 request)
 * - 12-hour server-side cache with 2-minute HTTP cache
 * - Graceful degradation: partial failures don't break entire dashboard
 *
 * @param userId - User identifier
 * @param params - Query parameters for customizing time windows
 * @returns Unified dashboard response with all analytics sections
 *
 * @example
 * ```typescript
 * const dashboard = await getPortfolioDashboard('user-123', {
 *   trend_days: 30,
 *   risk_days: 30,
 *   drawdown_days: 90,
 *   allocation_days: 40,
 *   rolling_days: 40
 * });
 *
 * // Access individual sections
 * const trends = dashboard.trends;
 * const sharpe = dashboard.rolling_analytics.sharpe;
 * const volatility = dashboard.rolling_analytics.volatility;
 *
 * // Check for partial failures
 * if (dashboard._metadata.error_count > 0) {
 *   console.warn('Some metrics failed:', dashboard._metadata.errors);
 * }
 * ```
 */
export async function getPortfolioDashboard(
  userId: string,
  params: DashboardWindowParams = {}
): Promise<UnifiedDashboardResponse> {
  const endpoint = `/api/v2/analytics/${userId}/dashboard${buildAnalyticsQueryString(params)}`;
  const response = await httpUtils.analyticsEngine.get(endpoint);
  return validateUnifiedDashboardResponse(response);
}

// ============================================================================
// DAILY YIELD RETURNS ENDPOINT
// ============================================================================

/**
 * Get daily yield returns for a user
 *
 * Retrieves granular daily yield data broken down by protocol and position.
 * Each date may have multiple entries (one per protocol/position).
 *
 * @param userId - User identifier
 * @param days - Number of days to retrieve (default: 30)
 * @param walletAddress - Optional wallet address filter for per-wallet analytics
 * @returns Daily yield returns with per-protocol breakdown
 *
 * @example
 * ```typescript
 * // Bundle-level data (all wallets)
 * const bundleYield = await getDailyYieldReturns('user-123', 30);
 *
 * // Wallet-specific data
 * const walletYield = await getDailyYieldReturns('user-123', 30, '0x1234...5678');
 *
 * // Access daily returns
 * bundleYield.daily_returns.forEach(entry => {
 *   console.log(`${entry.date}: ${entry.protocol_name} = $${entry.yield_return_usd}`);
 * });
 * ```
 */
export async function getDailyYieldReturns(
  userId: string,
  days = 30,
  walletAddress?: string
): Promise<DailyYieldReturnsResponse> {
  const params = new URLSearchParams({ days: String(days) });
  if (walletAddress) {
    params.append("walletAddress", walletAddress);
  }
  const endpoint = `/api/v2/analytics/${userId}/yield/daily?${params}`;
  const response = await httpUtils.analyticsEngine.get(endpoint);
  return validateDailyYieldReturnsResponse(response);
}

// ============================================================================
// BORROWING POSITIONS ENDPOINT
// ============================================================================

/**
 * Get detailed borrowing positions for a user with per-position risk metrics.
 *
 * Returns positions sorted by health rate (riskiest first) with detailed
 * collateral and debt breakdowns per protocol and chain.
 *
 * @param userId - User UUID
 * @returns Promise<BorrowingPositionsResponse>
 * @throws APIError 404 if user has no borrowing positions
 *
 * @example
 * ```typescript
 * const positions = await getBorrowingPositions('user-123');
 *
 * // Access positions
 * positions.positions.forEach(position => {
 *   console.log(`${position.protocol_name} on ${position.chain}`);
 *   console.log(`Health: ${position.health_rate} (${position.health_status})`);
 *   console.log(`Debt: $${position.debt_usd}`);
 * });
 * ```
 */
export async function getBorrowingPositions(
  userId: string
): Promise<BorrowingPositionsResponse> {
  const endpoint = `/api/v2/analytics/${userId}/borrowing/positions`;
  const response = await httpUtils.analyticsEngine.get(endpoint);
  return validateBorrowingPositionsResponse(response);
}

// ============================================================================
// MARKET DASHBOARD ENDPOINT
// ============================================================================

/**
 * Get aggregated market dashboard data
 *
 * Combines BTC price, 200 DMA, and Fear & Greed Index into a single series.
 *
 * @param days - Days of history (default: 365)
 * @param token - Token symbol (default: 'btc')
 * @returns Promise<MarketDashboardResponse>
 */
export async function getMarketDashboardData(
  days = 365,
  token = "btc"
): Promise<MarketDashboardResponse> {
  const params = new URLSearchParams({ days: String(days), token });
  const endpoint = `/api/v2/market/dashboard?${params}`;
  const response = await httpUtils.analyticsEngine.get(endpoint);
  return validateMarketDashboardResponse(response);
}
