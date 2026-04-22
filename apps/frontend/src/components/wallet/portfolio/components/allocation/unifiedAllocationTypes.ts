/**
 * Type definitions for the Unified Allocation Bar component.
 *
 * Provides a consistent 4-category allocation model across all visualization contexts:
 * - Dashboard (PortfolioComposition)
 * - Strategy (AllocationComparison)
 * - Backtesting (BacktestTooltip)
 */

/**
 * The four unified allocation categories.
 *
 * This model simplifies previous inconsistent categorizations into a clear hierarchy:
 * - `btc`: Pure BTC spot exposure
 * - `eth`: Pure ETH spot exposure
 * - `stable`: Stablecoins (capital preservation)
 * - `alt`: Everything else (non-BTC, non-ETH, non-stable)
 */
export type UnifiedCategory = 'btc' | 'eth' | 'stable' | 'alt';

/**
 * A single segment in the unified allocation bar.
 */
export interface UnifiedSegment {
  /** Category identifier */
  category: UnifiedCategory;
  /** Display label (e.g., "BTC", "BTC-STABLE", "STABLE", "ALT") */
  label: string;
  /** Percentage value (0-100) */
  percentage: number;
  /** Hex color for the segment */
  color: string;
}

/**
 * Props for the UnifiedAllocationBar component.
 */
export interface UnifiedAllocationBarProps {
  /** Allocation segments to display */
  segments: UnifiedSegment[];
  /** Show legend below the bar (default: true) */
  showLegend?: boolean;
  /** Show inline labels for large segments (default: true) */
  showLabels?: boolean;
  /** Minimum percentage to show inline label (default: 10) */
  labelThreshold?: number;
  /** Bar height variant */
  size?: 'sm' | 'md' | 'lg';
  /** Additional CSS classes */
  className?: string;
  /** Optional title displayed above the bar */
  title?: string;
  /** Test ID prefix for testing */
  testIdPrefix?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Source Data Types (from different consumers)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Portfolio allocation data from dashboard/wallet endpoints.
 * Values are percentages (0-100).
 */
export interface PortfolioAllocationSource {
  btc: number;
  eth: number;
  others: number;
  stablecoins: number;
}

/**
 * Strategy bucket data from strategy endpoints.
 * Values are ratios (0-1).
 */
export interface StrategyBucketsSource {
  spot: number;
  lp: number;
  stable: number;
}

/**
 * Backtest constituents with optional asset breakdown.
 * Values are absolute USD amounts.
 */
export interface BacktestConstituentsSource {
  spot: Record<string, number> | number;
  lp: Record<string, number> | number;
  stable: number;
}

/**
 * Explicit four-bucket asset allocation ratios.
 * Values are normalized ratios (0-1).
 */
export interface AssetAllocationSource {
  btc: number;
  eth: number;
  stable: number;
  alt: number;
}

/**
 * Legacy AllocationConstituent format (for backward compatibility).
 */
export interface LegacyAllocationConstituent {
  symbol: string;
  value: number;
  color: string;
}
