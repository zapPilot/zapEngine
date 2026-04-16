/**
 * Centralized configuration for use case tab labels
 * Maps regime IDs and strategy directions to human-readable tab labels
 */

import type { RegimeId } from "./regimeData";

export type StrategyDirection = "fromLeft" | "fromRight" | "default";

/**
 * Tab labels for each regime's strategy variants
 * - fromLeft: User coming from a lower regime (recovery/bull market)
 * - fromRight: User coming from a higher regime (correction/bear market)
 * - default: Single strategy regimes (EF, N, EG)
 * Internal constant used by getStrategyTabLabel
 */
const STRATEGY_TAB_LABELS: Record<
  RegimeId,
  Partial<Record<StrategyDirection, string>>
> = {
  ef: {
    default: "Market Bottom",
  },
  f: {
    fromLeft: "From Extreme Fear ↑",
    fromRight: "From Neutral ↓",
  },
  n: {
    default: "Holiday Mode",
  },
  g: {
    fromLeft: "From Neutral ↑",
    fromRight: "From Peak ↓",
  },
  eg: {
    default: "Market Peak",
  },
} as const;

/**
 * Get the tab label for a specific regime and strategy direction
 * @param regimeId - The regime identifier (ef, f, n, g, eg)
 * @param direction - The strategy direction
 * @returns The tab label string, or undefined if not found
 */
export function getStrategyTabLabel(
  regimeId: RegimeId,
  direction: StrategyDirection
): string | undefined {
  return STRATEGY_TAB_LABELS[regimeId]?.[direction];
}
