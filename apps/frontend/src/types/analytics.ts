/**
 * Analytics Data Types
 *
 * Type definitions for the V22 Analytics tab data structures.
 * Used for transforming API responses into chart/metric display formats.
 */

/**
 * Performance Chart Data
 *
 * SVG-ready data points for portfolio vs BTC benchmark visualization
 */
export interface PerformanceChartData {
  /** Normalized data points (x: 0-100, portfolio: 0-100 inverted Y) */
  points: {
    x: number;
    portfolio: number;
    date: string; // ISO date string for each point
    portfolioValue: number; // Original USD value for tooltip
  }[];
  /** ISO date string for chart start */
  startDate: string;
  /** ISO date string for chart end */
  endDate: string;
}

/**
 * Drawdown Chart Data
 *
 * Underwater chart showing portfolio drawdown over time
 */
export interface DrawdownChartData {
  /** Normalized data points (x: 0-100, value: drawdown percentage) */
  points: {
    x: number;
    value: number;
    date: string; // ISO date string for each point
  }[];
  /** Maximum drawdown percentage (negative number, e.g., -12.8) */
  maxDrawdown: number;
  /** ISO date string when max drawdown occurred */
  maxDrawdownDate: string;
}

/**
 * Individual Metric Display Data
 *
 * Structure for rendering a single metric card
 */
export interface MetricData {
  /** Formatted main value (e.g., "+124.5%", "2.45", "68%") */
  value: string;
  /** Contextual sub-value (e.g., "+2.4% vs BTC", "Top 5% of Pilots") */
  subValue: string;
  /** Visual trend indicator */
  trend: "up" | "down" | "neutral";
}

/**
 * All Key Metrics
 *
 * Complete set of analytics metrics for display
 */
export interface KeyMetrics {
  /** Time-Weighted Return (portfolio vs buy-and-hold) */
  timeWeightedReturn: MetricData;
  /** Maximum Drawdown percentage */
  maxDrawdown: MetricData;
  /** Sharpe Ratio (risk-adjusted returns) */
  sharpe: MetricData;
  /** Win Rate (% of positive return periods) */
  winRate: MetricData;
  /** Volatility (annualized standard deviation) */
  volatility: MetricData;
  /** Sortino Ratio (downside deviation, optional) */
  sortino?: MetricData;
  /** Beta (correlation with BTC, optional) */
  beta?: MetricData;
  /** Alpha (excess returns vs BTC, optional) */
  alpha?: MetricData;
}

/**
 * Monthly PnL Entry
 *
 * Single month's profit/loss percentage for heatmap
 */
export interface MonthlyPnL {
  /** Month abbreviation (e.g., "Jan", "Feb") */
  month: string;
  /** Four-digit year */
  year: number;
  /** Monthly return percentage (positive or negative) */
  value: number;
}

/**
 * Complete Analytics Data
 *
 * All data needed for Analytics tab rendering
 */
export interface AnalyticsData {
  /** Performance chart (portfolio vs BTC) */
  performanceChart: PerformanceChartData;
  /** Drawdown/underwater chart */
  drawdownChart: DrawdownChartData;
  /** All key metrics for metric cards */
  keyMetrics: KeyMetrics;
  /** Monthly PnL for heatmap (12-month grid) */
  monthlyPnL: MonthlyPnL[];
}

/**
 * Time Period Selection
 *
 * Available time windows for analytics data
 */
export interface AnalyticsTimePeriod {
  /** Unique key (e.g., "1M", "3M", "1Y") */
  key: string;
  /** Number of days to query */
  days: number;
  /** Display label */
  label: string;
}

/**
 * Wallet Filter Selection
 *
 * Type for wallet filtering in analytics views:
 * - null = "All Wallets" (bundle aggregation, default)
 * - string = specific wallet address (per-wallet analytics)
 */
export type WalletFilter = string | null;

/**
 * Wallet Option for Selector
 *
 * Individual wallet option for dropdown selector UI
 */
export interface WalletOption {
  /** Wallet address (0x...) */
  address: string;
  /** Optional user-defined label for wallet */
  label: string | null;
  /** Whether this wallet is currently active/selected in UI */
  isActive?: boolean;
}

/**
 * ==========================================
 * Portfolio Chart Analytics Types
 * ==========================================
 * Types originally from PortfolioChart component module
 * Migrated to centralized types for reuse across analytics hooks
 */
