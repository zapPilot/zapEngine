/**
 * Risk Metrics Thresholds and Display Configuration
 *
 * Defines health rate thresholds and color mappings for leverage position risk visualization.
 */

/**
 * Health Rate Risk Levels
 *
 * Health Rate represents portfolio safety for leveraged positions:
 * - Formula: (Collateral * LTV) / Debt
 * - 1.0 = 100% (at liquidation threshold)
 * - >1.0 = Safe (buffer above liquidation)
 * - <1.0 = Underwater (at risk of immediate liquidation)
 */
export const RiskLevel = {
  SAFE: "SAFE",
  MODERATE: "MODERATE",
  RISKY: "RISKY",
  CRITICAL: "CRITICAL",
} as const;

export type RiskLevel = (typeof RiskLevel)[keyof typeof RiskLevel];

/**
 * Risk Level Display Configuration
 *
 * Unified display configuration for each risk level including:
 * - Colors (Tailwind CSS classes)
 * - Icons (multi-modal indicators for accessibility)
 * - Animation patterns
 * - ARIA labels
 * - Human-readable labels
 */
export const RISK_DISPLAY_CONFIG = {
  [RiskLevel.SAFE]: {
    label: "Safe",
    text: "text-emerald-500",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    dot: "bg-emerald-500",
    emoji: "🟢",
    icon: "✓",
    pattern: "solid" as const,
    ariaLabel: "Safe - Large safety buffer",
  },
  [RiskLevel.MODERATE]: {
    label: "Moderate",
    text: "text-amber-500",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    dot: "bg-amber-500",
    emoji: "🟡",
    icon: "⚠",
    pattern: "solid" as const,
    ariaLabel: "Warning - Moderate safety buffer",
  },
  [RiskLevel.RISKY]: {
    label: "Risky",
    text: "text-orange-500",
    bg: "bg-orange-500/10",
    border: "border-orange-500/20",
    dot: "bg-orange-500",
    emoji: "🟠",
    icon: "!",
    pattern: "pulse" as const,
    ariaLabel: "Risky - Low safety buffer",
  },
  [RiskLevel.CRITICAL]: {
    label: "Critical",
    text: "text-rose-500",
    bg: "bg-rose-500/10",
    border: "border-rose-500/30 shadow-rose-500/20",
    dot: "bg-rose-500",
    emoji: "🔴",
    icon: "!!",
    pattern: "pulse" as const,
    ariaLabel: "Critical - Liquidation risk",
  },
} as const;

export interface RiskConfig {
  level: RiskLevel;
  colors: (typeof RISK_DISPLAY_CONFIG)[RiskLevel];
  label: string;
  emoji: string;
}

/**
 * Determines risk level from health rate value
 *
 * @param healthRate - Portfolio health rate (1.0 = 100%)
 * @returns Risk level classification
 *
 * @example
 * ```typescript
 * getRiskLevel(2.5) // RiskLevel.SAFE
 * getRiskLevel(1.7) // RiskLevel.MODERATE
 * getRiskLevel(1.3) // RiskLevel.RISKY
 * getRiskLevel(1.1) // RiskLevel.CRITICAL
 * ```
 */
export function getRiskLevel(healthRate: number): RiskLevel {
  if (healthRate >= 2.0) return RiskLevel.SAFE; // 100% buffer
  if (healthRate >= 1.5) return RiskLevel.MODERATE; // 50% buffer
  if (healthRate >= 1.2) return RiskLevel.RISKY; // 20% buffer
  return RiskLevel.CRITICAL; // Approaching liquidation
}

/**
 * Gets display configuration for a given health rate
 *
 * @param healthRate - Portfolio health rate
 * @returns Display configuration with colors, emoji, and label
 *
 * @example
 * ```typescript
 * const config = getRiskConfig(1.75);
 * // Returns: {
 * //   level: RiskLevel.MODERATE,
 * //   colors: { text: "text-yellow-400", ... },
 * //   label: "Moderate",
 * //   emoji: "🟡"
 * // }
 * ```
 */
export function getRiskConfig(healthRate: number): RiskConfig {
  const level = getRiskLevel(healthRate);
  const config = RISK_DISPLAY_CONFIG[level];

  return {
    level,
    colors: config,
    label: config.label,
    emoji: config.emoji,
  };
}

/**
 * Maps API borrowing_summary.overall_status to RiskLevel
 *
 * The backend provides pre-computed status strings. This function
 * converts them to our internal RiskLevel enum for consistent styling.
 *
 * @param status - Overall status from borrowing_summary API response
 * @returns Corresponding RiskLevel enum value
 *
 * @example
 * ```typescript
 * mapBorrowingStatusToRiskLevel("CRITICAL") // RiskLevel.CRITICAL
 * mapBorrowingStatusToRiskLevel("WARNING")  // RiskLevel.RISKY
 * mapBorrowingStatusToRiskLevel("HEALTHY")  // RiskLevel.SAFE
 * ```
 */
export function mapBorrowingStatusToRiskLevel(
  status: "HEALTHY" | "WARNING" | "CRITICAL"
): RiskLevel {
  switch (status) {
    case "HEALTHY":
      return RiskLevel.SAFE;
    case "WARNING":
      return RiskLevel.RISKY;
    case "CRITICAL":
      return RiskLevel.CRITICAL;
    default:
      return RiskLevel.MODERATE;
  }
}
