/**
 * Utility functions for mapping different data sources to unified allocation segments.
 *
 * These mappers convert source-specific data formats into the unified 4-category model,
 * enabling consistent visualization across Dashboard, Strategy, and Backtesting views.
 */

import { UNIFIED_COLORS } from '@/constants/assets';
import { getAllocationCategoryForToken } from '@/lib/domain/allocationCategories';

import type {
  AssetAllocationSource,
  BacktestConstituentsSource,
  LegacyAllocationConstituent,
  PortfolioAllocationSource,
  StrategyBucketsSource,
  UnifiedCategory,
  UnifiedSegment,
} from './unifiedAllocationTypes';

// ─────────────────────────────────────────────────────────────────────────────
// Category Labels
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<UnifiedCategory, string> = {
  btc: 'BTC',
  eth: 'ETH',
  spy: 'SPY',
  stable: 'STABLE',
  alt: 'ALT',
};

const CATEGORY_COLORS: Record<UnifiedCategory, string> = {
  btc: UNIFIED_COLORS.BTC,
  eth: UNIFIED_COLORS.ETH,
  spy: UNIFIED_COLORS.SPY,
  stable: UNIFIED_COLORS.STABLE,
  alt: UNIFIED_COLORS.ALT,
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a unified segment with consistent structure.
 */
function createSegment(
  category: UnifiedCategory,
  percentage: number,
): UnifiedSegment {
  return {
    category,
    label: CATEGORY_LABELS[category],
    percentage,
    color: CATEGORY_COLORS[category],
  };
}

/**
 * Filters out zero/negative segments and sorts by percentage descending.
 */
function normalizeSegments(segments: UnifiedSegment[]): UnifiedSegment[] {
  return segments
    .filter((s) => s.percentage > 0)
    .sort((a, b) => b.percentage - a.percentage);
}

const DEFAULT_ASSET_CATEGORIES: readonly UnifiedCategory[] = [
  'btc',
  'eth',
  'spy',
  'stable',
  'alt',
];

/**
 * Extracts a numeric value from a Record or returns the number directly.
 */
function getRecordValue(
  data: Record<string, number> | number,
  key: string,
): number {
  if (typeof data === 'number') {
    // When it's a plain number, we can't distinguish assets
    // Return 0 for specific keys, the caller handles the fallback
    return 0;
  }
  return data[key] ?? 0;
}

/**
 * Gets the total value from a Record or number.
 */
function getRecordTotal(data: Record<string, number> | number): number {
  if (typeof data === 'number') {
    return data;
  }
  return Object.values(data).reduce((sum, val) => sum + val, 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps portfolio allocation data (dashboard) to unified segments.
 *
 * Source values are percentages (0-100).
 * ETH and others are separated into their own display buckets.
 *
 * @example
 * ```ts
 * const segments = mapPortfolioToUnified({
 *   btc: 40,
 *   eth: 30,
 *   others: 10,
 *   stablecoins: 20
 * });
 * // Returns: [{ category: 'btc', percentage: 40 }, { category: 'alt', percentage: 40 }, ...]
 * ```
 */
export function mapPortfolioToUnified(
  data: PortfolioAllocationSource,
): UnifiedSegment[] {
  const segments: UnifiedSegment[] = [
    createSegment('btc', data.btc),
    createSegment('eth', data.eth),
    createSegment('stable', data.stablecoins),
    createSegment('alt', data.others),
  ];

  return normalizeSegments(segments);
}

/**
 * Maps explicit four-bucket asset allocation ratios to unified segments.
 *
 * Source values are normalized ratios (0-1) and converted to percentages.
 * Consumers can optionally limit which categories are rendered.
 */
export function mapAssetAllocationToUnified(
  data: AssetAllocationSource,
  categories: readonly UnifiedCategory[] = DEFAULT_ASSET_CATEGORIES,
): UnifiedSegment[] {
  const segments = categories.map((category) =>
    createSegment(category, (data[category] ?? 0) * 100),
  );

  return normalizeSegments(segments);
}

/**
 * Maps strategy bucket data to unified segments.
 *
 * Source values are ratios (0-1), converted to percentages.
 * Strategy payloads do not expose asset-level spot/LP composition, so:
 * - spot is mapped to BTC
 * - lp is mapped to ALT
 * - stable remains STABLE
 *
 * @example
 * ```ts
 * const segments = mapStrategyToUnified({
 *   spot: 0.5,
 *   lp: 0.3,
 *   stable: 0.2
 * });
 * // Returns: [{ category: 'btc', percentage: 50 }, { category: 'btc-stable', percentage: 30 }, ...]
 * ```
 */
export function mapStrategyToUnified(
  data: StrategyBucketsSource,
): UnifiedSegment[] {
  const segments: UnifiedSegment[] = [
    createSegment('btc', data.spot * 100),
    createSegment('alt', data.lp * 100),
    createSegment('stable', data.stable * 100),
  ];

  return normalizeSegments(segments);
}

/**
 * Maps backtest constituents to unified segments with LP pair breakdown.
 *
 * This is the richest mapper - it uses the full asset breakdown from backtesting:
 * - `spot.btc` + `lp.btc` → BTC
 * - `spot.eth` + `lp.eth` → ETH
 * - `stable` → STABLE
 * - `spot.others` + `lp.others` → ALT
 *
 * @example
 * ```ts
 * const segments = mapBacktestToUnified({
 *   spot: { btc: 3000, eth: 2000 },
 *   lp: { btc: 1000, eth: 500 },
 *   stable: 3500
 * });
 * // Returns segments with proper LP pair attribution
 * ```
 */
export function mapBacktestToUnified(
  data: BacktestConstituentsSource,
): UnifiedSegment[] {
  // Calculate total portfolio value
  const spotTotal = getRecordTotal(data.spot);
  const lpTotal = getRecordTotal(data.lp);
  const total = spotTotal + lpTotal + data.stable;

  if (total === 0) {
    return [];
  }

  // Extract individual asset values
  const btcSpot = getRecordValue(data.spot, 'btc');
  const btcLp = getRecordValue(data.lp, 'btc');
  const ethSpot = getRecordValue(data.spot, 'eth');
  const ethLp = getRecordValue(data.lp, 'eth');

  // Calculate "others" as anything not explicitly BTC or ETH
  const othersSpot =
    typeof data.spot === 'number'
      ? data.spot // When spot is a number, it's all "others"
      : spotTotal - btcSpot - ethSpot;

  const othersLp =
    typeof data.lp === 'number'
      ? data.lp // When lp is a number, it's all "others"
      : lpTotal - btcLp - ethLp;

  const segments: UnifiedSegment[] = [
    createSegment('btc', ((btcSpot + btcLp) / total) * 100),
    createSegment('eth', ((ethSpot + ethLp) / total) * 100),
    createSegment('stable', (data.stable / total) * 100),
    createSegment('alt', ((othersSpot + othersLp) / total) * 100),
  ];

  return normalizeSegments(segments);
}

/**
 * Maps legacy AllocationConstituent array to unified segments.
 *
 * Useful for migrating existing components that use AllocationConstituent[].
 * Maps based on symbol name matching.
 *
 * @example
 * ```ts
 * const segments = mapLegacyConstituentsToUnified([
 *   { symbol: 'BTC', value: 50, color: '#F7931A' },
 *   { symbol: 'ETH', value: 30, color: '#627EEA' },
 * ], 20); // 20% stables
 * ```
 */
export function mapLegacyConstituentsToUnified(
  cryptoAssets: LegacyAllocationConstituent[],
  stablePercentage: number,
): UnifiedSegment[] {
  let btcTotal = 0;
  let ethTotal = 0;
  let altTotal = 0;

  for (const asset of cryptoAssets) {
    const category = getAllocationCategoryForToken(asset.symbol);

    if (category === 'btc') {
      btcTotal += asset.value;
    } else if (category === 'eth') {
      ethTotal += asset.value;
    } else if (category === 'alt') {
      altTotal += asset.value;
    }
  }

  const segments: UnifiedSegment[] = [
    createSegment('btc', btcTotal),
    createSegment('eth', ethTotal),
    createSegment('stable', stablePercentage),
    createSegment('alt', altTotal),
  ];

  return normalizeSegments(segments);
}

/**
 * Calculates the total percentage of all segments.
 * Useful for validation - should equal ~100.
 */
export function calculateTotalPercentage(segments: UnifiedSegment[]): number {
  return segments.reduce((sum, s) => sum + s.percentage, 0);
}

/**
 * Gets a human-readable summary of the allocation.
 *
 * @example
 * ```ts
 * getAllocationSummary(segments);
 * // Returns: "BTC 40%, ETH 20%, STABLE 25%, ALT 15%"
 * ```
 */
export function getAllocationSummary(segments: UnifiedSegment[]): string {
  return segments
    .map((s) => `${s.label} ${s.percentage.toFixed(0)}%`)
    .join(', ');
}
