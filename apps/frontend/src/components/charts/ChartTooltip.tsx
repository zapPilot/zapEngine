/**
 * ChartTooltip Component
 *
 * Reusable tooltip component for all chart types with smart positioning
 * and chart-specific content rendering.
 */

import { motion } from "framer-motion";
import { type ReactElement, useRef } from "react";

import type {
  AllocationHoverData,
  ChartHoverState,
  DailyYieldHoverData,
  DrawdownHoverData,
  PerformanceHoverData,
  SharpeHoverData,
  VolatilityHoverData,
} from "@/types";

import {
  AllocationTooltip,
  DailyYieldTooltip,
  DrawdownTooltip,
  PerformanceTooltip,
  SharpeTooltip,
  VolatilityTooltip,
} from "./tooltipContent";

// Charts that have legends at the top requiring tooltip offset
const CHARTS_WITH_TOP_LEGEND = new Set([
  "performance",
  "asset-allocation",
  "sharpe",
  "volatility",
]);

// Positioning constants
const TOOLTIP_MIN_WIDTH = 180;
const TOOLTIP_MIN_HEIGHT = 120;
const EDGE_PADDING = 12;
const VERTICAL_OFFSET = 20;
const LEGEND_GUARD_TOP = 60;

interface ChartBounds {
  width: number;
  height: number;
}

interface PointerPosition {
  x: number;
  y: number;
}

interface HorizontalPosition {
  left: number;
  translateX: "0" | "-50%" | "-100%";
}

interface VerticalPosition {
  top: number;
  translateY: "0" | "-100%";
}

interface ChartTooltipProps {
  /** Current hover state or null */
  hoveredPoint: ChartHoverState | null;
  /** Chart width for positioning calculations */
  chartWidth?: number;
  /** Chart height for positioning calculations */
  chartHeight?: number;
}

interface TooltipContentProps {
  data: ChartHoverState;
}

/**
 * Render chart-specific tooltip content based on chart type
 */
function TooltipContent({ data }: TooltipContentProps): ReactElement | null {
  switch (data.chartType) {
    case "performance":
      return <PerformanceTooltip data={data as PerformanceHoverData} />;
    case "asset-allocation":
      return <AllocationTooltip data={data as AllocationHoverData} />;
    case "drawdown-recovery":
      return <DrawdownTooltip data={data as DrawdownHoverData} />;
    case "sharpe":
      return <SharpeTooltip data={data as SharpeHoverData} />;
    case "volatility":
      return <VolatilityTooltip data={data as VolatilityHoverData} />;
    case "daily-yield":
      return <DailyYieldTooltip data={data as DailyYieldHoverData} />;
    default:
      return null;
  }
}

/**
 * Calculate tooltip position to keep it within bounds
 */
function calculatePosition(
  hoveredPoint: ChartHoverState,
  chartWidth: number,
  chartHeight: number,
  tooltipWidth: number,
  tooltipHeight: number
) {
  const bounds: ChartBounds = {
    width: hoveredPoint.containerWidth ?? chartWidth,
    height: hoveredPoint.containerHeight ?? chartHeight,
  };

  const pointer: PointerPosition = {
    x:
      hoveredPoint.screenX ??
      (chartWidth > 0 ? (hoveredPoint.x / chartWidth) * bounds.width : 0),
    y:
      hoveredPoint.screenY ??
      (chartHeight > 0 ? (hoveredPoint.y / chartHeight) * bounds.height : 0),
  };

  const horizontalPosition = getHorizontalPosition(
    pointer.x,
    bounds.width,
    tooltipWidth
  );
  const verticalPosition = getVerticalPosition(
    pointer.y,
    bounds.height,
    tooltipHeight
  );
  const legendSafePosition = getLegendSafeVerticalPosition(
    hoveredPoint.chartType,
    pointer.y,
    tooltipHeight,
    verticalPosition
  );

  return {
    left: horizontalPosition.left,
    top: legendSafePosition.top,
    translateX: horizontalPosition.translateX,
    translateY: legendSafePosition.translateY,
  };
}

function getHorizontalPosition(
  pointerX: number,
  containerWidth: number,
  tooltipWidth: number
): HorizontalPosition {
  let left = pointerX;
  let translateX: HorizontalPosition["translateX"] = "-50%";
  const halfWidth = tooltipWidth / 2;

  if (left - halfWidth < EDGE_PADDING) {
    left = Math.max(left, EDGE_PADDING);
    translateX = "0";
  } else if (left + halfWidth > containerWidth - EDGE_PADDING) {
    left = Math.min(left, containerWidth - EDGE_PADDING);
    translateX = "-100%";
  }

  return { left, translateX };
}

function getVerticalPosition(
  pointerY: number,
  containerHeight: number,
  tooltipHeight: number
): VerticalPosition {
  let top = pointerY - VERTICAL_OFFSET;
  let translateY: VerticalPosition["translateY"] = "-100%";

  if (top - tooltipHeight < EDGE_PADDING) {
    top = Math.min(pointerY + VERTICAL_OFFSET, containerHeight - EDGE_PADDING);
    translateY = "0";
  }

  return { top, translateY };
}

function getLegendSafeVerticalPosition(
  chartType: ChartHoverState["chartType"],
  pointerY: number,
  tooltipHeight: number,
  verticalPosition: VerticalPosition
): VerticalPosition {
  const overlapsLegend =
    verticalPosition.translateY === "-100%" &&
    verticalPosition.top < LEGEND_GUARD_TOP + tooltipHeight;

  if (!CHARTS_WITH_TOP_LEGEND.has(chartType) || !overlapsLegend) {
    return verticalPosition;
  }

  return {
    top: Math.max(pointerY + VERTICAL_OFFSET, LEGEND_GUARD_TOP),
    translateY: "0",
  };
}

/**
 * ChartTooltip - Smart positioning tooltip for all chart types
 */
export function ChartTooltip({
  hoveredPoint,
  chartWidth = 800,
  chartHeight = 300,
}: ChartTooltipProps): ReactElement | null {
  const tooltipRef = useRef<HTMLDivElement>(null);

  if (!hoveredPoint) return null;

  const tooltipWidth = tooltipRef.current?.offsetWidth || TOOLTIP_MIN_WIDTH;
  const tooltipHeight = tooltipRef.current?.offsetHeight || TOOLTIP_MIN_HEIGHT;

  const { left, top, translateX, translateY } = calculatePosition(
    hoveredPoint,
    chartWidth,
    chartHeight,
    tooltipWidth,
    tooltipHeight
  );

  return (
    <motion.div
      className="absolute z-10 pointer-events-none"
      role="tooltip"
      data-chart-type={hoveredPoint.chartType}
      data-testid="chart-tooltip"
      style={{
        left,
        top,
        transform: `translate(${translateX}, ${translateY})`,
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div
        ref={tooltipRef}
        className="px-3 py-2 bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg shadow-xl min-w-[160px]"
      >
        <TooltipContent data={hoveredPoint} />
      </div>
    </motion.div>
  );
}
