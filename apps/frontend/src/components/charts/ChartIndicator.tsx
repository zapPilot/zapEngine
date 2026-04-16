/**
 * ChartIndicator Component
 * Reusable indicator component for chart hover states with chart-specific styling.
 */

import {
  type ChartHoverState,
  isAllocationHover,
  isDrawdownHover,
  isPerformanceHover,
  isSharpeHover,
  isVolatilityHover,
} from "@/types/ui/chartHover";
import { getDrawdownSeverity } from "@/utils/chartHoverUtils";
import { formatters } from "@/utils/formatters";

import {
  FlaggedCircle,
  IndicatorWrapper,
  MultiCircle,
  SingleCircle,
} from "./chartIndicatorParts";

const DEFAULT_COLOR = "#8b5cf6";
const COLOR_MAP: Record<string, string> = {
  performance: DEFAULT_COLOR,
  "asset-allocation": DEFAULT_COLOR,
  "drawdown-recovery": "#f97316",
  sharpe: "#10b981",
  volatility: "#f59e0b",
};

interface ChartIndicatorProps {
  hoveredPoint: ChartHoverState | null;
  variant?: "circle" | "multi-circle" | "flagged-circle";
  radius?: number;
  strokeWidth?: number;
}

type IndicatorVariant = NonNullable<ChartIndicatorProps["variant"]>;

// =============================================================================
// HELPERS
// =============================================================================

function getAriaLabel(point: ChartHoverState): string {
  const date = formatters.chartDate(point.date);

  if (isPerformanceHover(point)) {
    return `Portfolio value on ${date} is ${formatters.currency(point.value)}.`;
  }

  if (isAllocationHover(point)) {
    const items = [
      { l: "BTC", v: point.btc },
      { l: "ETH", v: point.eth },
      { l: "Stablecoin", v: point.stablecoin },
      { l: "Altcoin", v: point.altcoin },
    ];
    const text = items
      .filter(i => i.v >= 1)
      .map(i => `${i.l} ${formatters.percent(i.v)}`)
      .join(", ");
    if (text) {
      return `Allocation on ${date}: ${text}.`;
    }

    return `Allocation on ${date} minimal.`;
  }

  if (isDrawdownHover(point)) {
    const severity = getDrawdownSeverity(point.drawdown);
    const recovery = point.isRecoveryPoint ? " and marks a new peak" : "";
    return `Drawdown on ${date} is ${formatters.percent(Math.abs(point.drawdown), 2)} with ${severity} severity${recovery}.`;
  }

  if (isSharpeHover(point)) {
    return `Sharpe ratio on ${date} is ${point.sharpe.toFixed(2)}, rated ${point.interpretation}.`;
  }

  if (isVolatilityHover(point)) {
    return `Volatility on ${date} is ${formatters.percent(point.volatility)} with ${point.riskLevel} risk.`;
  }

  return `Chart value on ${date}.`;
}

function getIndicatorColor(chartType: string): string {
  return COLOR_MAP[chartType] ?? DEFAULT_COLOR;
}

function resolveIndicatorVariant(
  variant: IndicatorVariant,
  hoveredPoint: ChartHoverState
): IndicatorVariant {
  if (variant !== "circle") {
    return variant;
  }

  if (hoveredPoint.chartType === "asset-allocation") {
    return "multi-circle";
  }

  if (
    hoveredPoint.chartType === "drawdown-recovery" &&
    hoveredPoint.isRecoveryPoint
  ) {
    return "flagged-circle";
  }

  return "circle";
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ChartIndicator({
  hoveredPoint,
  variant = "circle",
  radius = 6,
  strokeWidth = 2,
}: ChartIndicatorProps) {
  if (!hoveredPoint) {
    return null;
  }

  const effectiveVariant = resolveIndicatorVariant(variant, hoveredPoint);
  const color = getIndicatorColor(hoveredPoint.chartType);
  const label = getAriaLabel(hoveredPoint);
  const circleProps = {
    point: hoveredPoint,
    r: radius,
    sw: strokeWidth,
    color,
  };

  switch (effectiveVariant) {
    case "multi-circle":
      return <MultiCircle {...circleProps} label={label} />;
    case "flagged-circle":
      return <FlaggedCircle {...circleProps} label={label} />;
    default:
      return (
        <IndicatorWrapper point={hoveredPoint} label={label}>
          <SingleCircle {...circleProps} />
        </IndicatorWrapper>
      );
  }
}
