/**
 * Chart Hover Type Definitions
 *
 * Discriminated union types for all chart hover states in the portfolio analytics system.
 * Each chart type has specific hover data requirements based on the metrics it displays.
 */

/**
 * Base interface with common fields shared across all chart hover states
 */
interface BaseHoverData {
  /** X coordinate in SVG space */
  x: number;
  /** Y coordinate in SVG space */
  y: number;
  /** Rendered width of the chart container in pixels */
  containerWidth?: number;
  /** Rendered height of the chart container in pixels */
  containerHeight?: number;
  /** Hover position on screen (relative to container) */
  screenX?: number;
  /** Hover vertical position on screen (relative to container) */
  screenY?: number;
  /** ISO date string of the data point */
  date: string;
  /** Chart type discriminator */
  chartType: string;
}

/**
 * Performance chart hover data
 * Shows portfolio value
 */
export interface PerformanceHoverData extends BaseHoverData {
  chartType: "performance";
  /** Portfolio value in USD */
  value: number;
  /** DeFi portion of the portfolio value in USD */
  defiValue?: number;
  /** Wallet portion of the portfolio value in USD */
  walletValue?: number;
}

/**
 * Asset allocation chart hover data
 * Shows percentage breakdown across asset categories
 */
export interface AllocationHoverData extends BaseHoverData {
  chartType: "asset-allocation";
  /** BTC allocation percentage (0-100) */
  btc: number;
  /** ETH allocation percentage (0-100) */
  eth: number;
  /** Stablecoin allocation percentage (0-100) */
  stablecoin: number;
  /** Altcoin allocation percentage (0-100) */
  altcoin: number;
}

/**
 * Drawdown chart hover data
 * Shows drawdown percentage and peak information
 */
export interface DrawdownHoverData extends BaseHoverData {
  chartType: "drawdown-recovery";
  /** Drawdown percentage (negative value) */
  drawdown: number;
  /** Date of the peak value before drawdown */
  peakDate?: string;
  /** Days elapsed since peak */
  distanceFromPeak?: number;
  /** Whether this point marks a recovery */
  isRecoveryPoint?: boolean;
  /** Duration of the last recovery cycle in days */
  recoveryDurationDays?: number;
  /** Depth of the recovery cycle */
  recoveryDepth?: number;
}

/**
 * Sharpe Ratio chart hover data
 * Shows risk-adjusted return metric with 5-level interpretation
 */
export interface SharpeHoverData extends BaseHoverData {
  chartType: "sharpe";
  /** Rolling Sharpe ratio value */
  sharpe: number;
  /** Human-readable interpretation of Sharpe value (5-level system) */
  interpretation: "Excellent" | "Good" | "Fair" | "Poor" | "Very Poor";
}

/**
 * Volatility chart hover data
 * Shows 30-day rolling volatility with risk assessment
 */
export interface VolatilityHoverData extends BaseHoverData {
  chartType: "volatility";
  /** 30-day volatility percentage (annualized) */
  volatility: number;
  /** Risk level assessment based on volatility */
  riskLevel: "Low" | "Moderate" | "High" | "Very High";
}

/**
 * Daily yield chart hover data
 * Shows daily yield returns with per-protocol breakdown
 */
export interface DailyYieldHoverData extends BaseHoverData {
  chartType: "daily-yield";
  /** Total yield for the day in USD */
  totalYield: number;
  /** Number of protocols contributing to yield */
  protocolCount?: number;
  /** Cumulative yield up to this date */
  cumulativeYield?: number;
  /** Whether yield is positive or negative */
  isPositive: boolean;
  /** Per-protocol breakdown for tooltip */
  protocols?: {
    protocol_name: string;
    chain: string;
    yield_return_usd: number;
  }[];
}

/**
 * Underwater chart hover data
 * Shows underwater periods and recovery status
 */
/**
 * Discriminated union of all chart hover states
 * Use the chartType discriminator to narrow the type
 */
export type ChartHoverState =
  | PerformanceHoverData
  | AllocationHoverData
  | DrawdownHoverData
  | SharpeHoverData
  | VolatilityHoverData
  | DailyYieldHoverData;

/**
 * Factory for chart hover type guard functions
 */
function createHoverGuard<T extends ChartHoverState>(
  chartType: T["chartType"]
) {
  return (state: ChartHoverState | null): state is T =>
    state?.chartType === chartType;
}

export const isPerformanceHover =
  createHoverGuard<PerformanceHoverData>("performance");
export const isAllocationHover =
  createHoverGuard<AllocationHoverData>("asset-allocation");
export const isDrawdownHover =
  createHoverGuard<DrawdownHoverData>("drawdown-recovery");
export const isSharpeHover = createHoverGuard<SharpeHoverData>("sharpe");
export const isVolatilityHover =
  createHoverGuard<VolatilityHoverData>("volatility");
