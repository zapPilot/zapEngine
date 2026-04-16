/**
 * Chart Hover Utilities
 * Helper functions for chart hover calculations and styling
 */

import {
  getColorForSeverity,
  type SeverityLevel,
  severityMappers,
} from "@/lib/ui/severityColors";

// ============================================================================
// Drawdown Functions
// ============================================================================

type DrawdownSeverityLabel = "Minor" | "Moderate" | "Significant" | "Severe";

const DRAWDOWN_LABELS: Record<SeverityLevel, DrawdownSeverityLabel> = {
  excellent: "Minor",
  good: "Minor",
  fair: "Moderate",
  poor: "Significant",
  critical: "Severe",
};

/**
 * Calculates drawdown severity level based on percentage
 * @param drawdown - Drawdown percentage (negative value)
 * @returns Severity label
 */
export function getDrawdownSeverity(drawdown: number): DrawdownSeverityLabel {
  return DRAWDOWN_LABELS[severityMappers.drawdown(drawdown)];
}

// ============================================================================
// Sharpe Ratio Functions
// ============================================================================

const SHARPE_LABELS: Record<SeverityLevel, string> = {
  excellent: "Excellent",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
  critical: "Very Poor",
};

/**
 * Interprets Sharpe ratio value
 * @param sharpe - Sharpe ratio value
 * @returns Interpretation label
 */
export function getSharpeInterpretation(sharpe: number): string {
  return SHARPE_LABELS[severityMappers.sharpe(sharpe)];
}

// ============================================================================
// Volatility Functions
// ============================================================================

const VOLATILITY_RISK_THRESHOLDS = {
  LOW_MAX: 20,
  MODERATE_MAX: 30,
  HIGH_MAX: 40,
} as const;

/**
 * Determines risk level from volatility percentage
 * @param volatility - Annualized volatility percentage
 * @returns Risk level label
 */
export function getVolatilityRiskLevel(
  volatility: number
): "Low" | "Moderate" | "High" | "Very High" {
  if (volatility < VOLATILITY_RISK_THRESHOLDS.LOW_MAX) return "Low";
  if (volatility < VOLATILITY_RISK_THRESHOLDS.MODERATE_MAX) return "Moderate";
  if (volatility < VOLATILITY_RISK_THRESHOLDS.HIGH_MAX) return "High";
  return "Very High";
}

/**
 * Calculates daily volatility from annualized volatility
 * @param annualizedVol - Annualized volatility percentage
 * @returns Daily volatility percentage
 */
export function calculateDailyVolatility(annualizedVol: number): number {
  return annualizedVol / Math.sqrt(252);
}

// ============================================================================
// Color Utilities
// ============================================================================

const SHARPE_COLORS: Record<SeverityLevel, string> = {
  excellent: "#10b981",
  good: "#84cc16",
  fair: "#fbbf24",
  poor: "#fb923c",
  critical: "#ef4444",
};

/**
 * Gets color for Sharpe ratio indicator
 * @param sharpe - Sharpe ratio value
 * @returns Hex color code
 */
export function getSharpeColor(sharpe: number): string {
  return SHARPE_COLORS[severityMappers.sharpe(sharpe)];
}

const DRAWDOWN_SEVERITY_TO_SEVERITY: Record<
  DrawdownSeverityLabel,
  SeverityLevel
> = {
  Minor: "good",
  Moderate: "fair",
  Significant: "poor",
  Severe: "critical",
};

/**
 * Gets Tailwind classes for drawdown severity badge
 * @param severity - Severity level
 * @returns Object with color and bgColor Tailwind classes
 */
export function getDrawdownSeverityColor(severity: DrawdownSeverityLabel): {
  color: string;
  bgColor: string;
} {
  return getColorForSeverity(DRAWDOWN_SEVERITY_TO_SEVERITY[severity]);
}

const VOLATILITY_RISK_TO_SEVERITY: Record<
  ReturnType<typeof getVolatilityRiskLevel>,
  SeverityLevel
> = {
  Low: "excellent",
  Moderate: "good",
  High: "poor",
  "Very High": "critical",
};

/**
 * Gets Tailwind classes for volatility risk level badge
 * @param riskLevel - Risk level
 * @returns Object with color and bgColor Tailwind classes
 */
export function getVolatilityRiskColor(
  riskLevel: ReturnType<typeof getVolatilityRiskLevel>
): {
  color: string;
  bgColor: string;
} {
  return getColorForSeverity(VOLATILITY_RISK_TO_SEVERITY[riskLevel]);
}
