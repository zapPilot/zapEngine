/**
 * Strategy Selector Utility
 *
 * Computes directional strategy information based on regime transitions.
 * Provides client-side fallback logic when server doesn't supply direction,
 * and maps directions to animation classes and accessibility labels.
 *
 * The strategy direction indicates how the portfolio should be positioned
 * relative to the previous regime:
 * - fromLeft: Coming from more bearish regime → increase crypto allocation
 * - fromRight: Coming from more bullish regime → decrease crypto allocation
 * - default: No clear direction → maintain current allocation
 */

import { REGIME_LABELS } from "@/lib/domain/regimeMapper";
import type {
  DirectionType,
  RegimeId,
} from "@/schemas/api/regimeHistorySchemas";

/**
 * Regime order mapping for directional calculation
 *
 * Maps each regime to its position on the fear/greed spectrum.
 * Lower numbers = more bearish, higher numbers = more bullish.
 *
 * - ef (Extreme Fear): 0
 * - f (Fear): 1
 * - n (Neutral): 2
 * - g (Greed): 3
 * - eg (Extreme Greed): 4
 */
export const REGIME_ORDER: Record<RegimeId, number> = {
  ef: 0,
  f: 1,
  n: 2,
  g: 3,
  eg: 4,
} as const;

/**
 * Strategy metadata for UI rendering
 *
 * Contains animation class and accessibility information for each direction.
 */
interface StrategyMeta {
  /** Framer Motion animation class or variant */
  animationClass: string;
  /** ARIA label for screen readers */
  ariaLabel: string;
  /** Human-readable direction description */
  description: string;
}

/**
 * Computes strategy direction based on regime transition
 *
 * Client-side fallback logic that matches backend algorithm:
 * - If current regime is more bullish than previous → fromLeft
 * - If current regime is more bearish than previous → fromRight
 * - If no previous regime or same regime → default
 *
 * @param currentRegime - Current active regime
 * @param previousRegime - Previous regime (null if no history)
 * @returns Computed direction type
 *
 * @example
 * ```typescript
 * computeStrategyDirection("g", "n") // "fromLeft" (moving toward greed)
 * computeStrategyDirection("f", "g") // "fromRight" (moving toward fear)
 * computeStrategyDirection("n", null) // "default" (no previous regime)
 * ```
 */
export function computeStrategyDirection(
  currentRegime: RegimeId,
  previousRegime: RegimeId | null
): DirectionType {
  // No previous regime - default direction
  if (!previousRegime) {
    return "default";
  }

  const currentOrder = REGIME_ORDER[currentRegime];
  const previousOrder = REGIME_ORDER[previousRegime];

  // Moving toward more bullish regime (higher order)
  if (currentOrder > previousOrder) {
    return "fromLeft";
  }

  // Moving toward more bearish regime (lower order)
  if (currentOrder < previousOrder) {
    return "fromRight";
  }

  // Same regime - no direction change
  return "default";
}

/**
 * Gets active strategy direction with server preference and client fallback
 *
 * Strategy:
 * 1. If server provides valid direction → use it (backend is authoritative)
 * 2. If server provides "default" or missing → compute client-side
 * 3. If no previous regime → return "default"
 *
 * This approach trusts the backend when available but provides resilient
 * fallback logic for edge cases or feature flag scenarios.
 *
 * @param serverDirection - Direction from backend API
 * @param currentRegime - Current active regime
 * @param previousRegime - Previous regime (null if no history)
 * @returns Final strategy direction to use
 *
 * @example
 * ```typescript
 * // Server provides direction - use it
 * getActiveStrategy("fromLeft", "g", "n") // "fromLeft"
 *
 * // Server provides default - compute client-side
 * getActiveStrategy("default", "g", "n") // "fromLeft"
 *
 * // No server data - compute client-side
 * getActiveStrategy(undefined, "g", "n") // "fromLeft"
 * ```
 */
export function getActiveStrategy(
  serverDirection: DirectionType | undefined,
  currentRegime: RegimeId,
  previousRegime: RegimeId | null
): DirectionType {
  // Trust server if it provides a clear direction
  if (serverDirection && serverDirection !== "default") {
    return serverDirection;
  }

  // Fall back to client-side computation
  return computeStrategyDirection(currentRegime, previousRegime);
}

/**
 * Strategy metadata config for each direction type.
 * Record<DirectionType, ...> ensures compile-time exhaustiveness.
 */
const STRATEGY_META: Record<DirectionType, StrategyMeta> = {
  fromLeft: {
    animationClass: "slide-from-left",
    ariaLabel: "Transitioning from bearish to bullish regime",
    description: "Increasing crypto allocation",
  },
  fromRight: {
    animationClass: "slide-from-right",
    ariaLabel: "Transitioning from bullish to bearish regime",
    description: "Decreasing crypto allocation",
  },
  default: {
    animationClass: "fade-in",
    ariaLabel: "Current market regime",
    description: "Maintaining current allocation",
  },
};

/**
 * Gets strategy metadata for UI rendering
 *
 * @param direction - Strategy direction type
 * @returns Strategy metadata with animation and accessibility info
 *
 * @example
 * ```typescript
 * const meta = getStrategyMeta("fromLeft");
 * // {
 * //   animationClass: "slide-from-left",
 * //   ariaLabel: "Transitioning from bearish to bullish regime",
 * //   description: "Increasing crypto allocation"
 * // }
 * ```
 */
export function getStrategyMeta(direction: DirectionType): StrategyMeta {
  return STRATEGY_META[direction] ?? STRATEGY_META.default;
}

// Unused export removed: isValidRegimeId

/**
 * Gets human-readable regime name
 *
 * @param regimeId - Regime identifier
 * @returns Full regime name
 */
export function getRegimeName(regimeId: RegimeId): string {
  return REGIME_LABELS[regimeId];
}
