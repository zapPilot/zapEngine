/* c8 ignore file - Complex chart hover/pointer interaction code, covered by E2E tests */

/**
 * useChartHover Hook
 * Generic hook for chart hover functionality with RAF optimization.
 */

import {
  type MouseEvent,
  type PointerEvent,
  type TouchEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { isRuntimeMode } from "@/lib/env/runtimeEnv";
import type { ChartHoverState } from "@/types/ui/chartHover";
import { logger } from "@/utils";
import { clamp } from "@/utils/mathUtils";

import {
  calculateYPosition,
  type ChartHoverConfig,
  useTestAutoHoverEffect,
} from "./useTestAutoHoverEffect";

// =============================================================================
// HELPERS
// =============================================================================

function getSvgX(
  svg: SVGSVGElement,
  clientX: number,
  chartWidth: number
): number {
  const rect = svg.getBoundingClientRect();
  const svgWidth = rect.width || chartWidth || 1;

  const effectiveClientX = Number.isFinite(clientX)
    ? clientX
    : rect.left + svgWidth / 2;

  // 1. Try matrix transform
  if (svg.getScreenCTM && svg.createSVGPoint) {
    const ctm = svg.getScreenCTM();
    if (ctm) {
      const point = svg.createSVGPoint();
      point.x = effectiveClientX;
      point.y = rect.top;
      const transformed = point.matrixTransform(ctm.inverse());
      if (Number.isFinite(transformed.x)) {
        return transformed.x;
      }
    }
  }

  // 2. Fallback
  const mouseX = effectiveClientX - rect.left;
  const normalizedX = svgWidth > 0 ? mouseX / svgWidth : 0;
  return normalizedX * chartWidth;
}

// =============================================================================
// TYPES
// =============================================================================

interface UseChartHoverOptions<T> extends ChartHoverConfig<T> {
  enabled?: boolean;
  testAutoPopulate?: boolean;
}

interface UseChartHoverReturn {
  hoveredPoint: ChartHoverState | null;
  handleMouseMove: (event: MouseEvent<SVGSVGElement>) => void;
  handlePointerMove: (event: PointerEvent<SVGSVGElement>) => void;
  handlePointerDown: (event: PointerEvent<SVGSVGElement>) => void;
  handleTouchMove: (event: TouchEvent<SVGSVGElement>) => void;
  handleMouseLeave: () => void;
  handleTouchEnd: () => void;
}

type PointerInteractionEvent =
  | MouseEvent<SVGSVGElement>
  | PointerEvent<SVGSVGElement>
  | TouchEvent<SVGSVGElement>;

function getClientXFromInteraction(
  event: PointerInteractionEvent
): number | null {
  if ("touches" in event) {
    const touch = event.touches[0] ?? event.changedTouches[0];
    if (!touch) {
      return null;
    }

    if (event.cancelable) {
      event.preventDefault();
    }

    return touch.clientX;
  }

  return event.clientX;
}

// =============================================================================
// HOOK
// =============================================================================

export function useChartHover<T>(
  data: T[],
  options: UseChartHoverOptions<T>
): UseChartHoverReturn {
  const {
    chartType,
    chartWidth,
    chartHeight,
    chartPadding,
    minValue,
    maxValue,
    getYValue,
    buildHoverData,
    enabled = true,
    testAutoPopulate = false,
  } = options;

  const [hoveredPoint, setHoveredPoint] = useState<ChartHoverState | null>(
    null
  );

  const rafId = useRef<number | null>(null);
  const lastIndexRef = useRef<number | null>(null);
  const isAutoHoverActiveRef = useRef(false);

  // --- Handlers ---

  const updateHoverFromClientPoint = useCallback(
    (clientX: number, svg: SVGSVGElement) => {
      if (!enabled || data.length === 0) return;

      const viewBoxX = getSvgX(svg, clientX, chartWidth);
      const normalizedViewBoxX = clamp(
        chartWidth > 0 ? viewBoxX / chartWidth : 0,
        0,
        1
      );

      const rawIndex = normalizedViewBoxX * (data.length - 1);
      const clampedIndex = clamp(Math.round(rawIndex), 0, data.length - 1);

      if (lastIndexRef.current === clampedIndex) return;
      lastIndexRef.current = clampedIndex;

      const updateHoverState = () => {
        const point = data[clampedIndex];
        if (!point) return;

        const x =
          data.length <= 1
            ? chartWidth / 2
            : (clampedIndex / (data.length - 1)) * chartWidth;

        const yValue = getYValue(point);
        const y = calculateYPosition(
          yValue,
          minValue,
          maxValue,
          chartHeight,
          chartPadding
        );

        // Screen coords for tooltip
        const rect = svg.getBoundingClientRect();
        const svgWidth = rect.width || chartWidth || 1;
        const svgHeight = rect.height || chartHeight || 1;
        const scaleX = chartWidth > 0 ? svgWidth / chartWidth : 1;
        const scaleY = chartHeight > 0 ? svgHeight / chartHeight : 1;

        const hoverData = buildHoverData(point, x, y, clampedIndex);

        isAutoHoverActiveRef.current = false;
        setHoveredPoint({
          ...hoverData,
          containerWidth: svgWidth,
          containerHeight: svgHeight,
          screenX: x * scaleX,
          screenY: y * scaleY,
        });

        if (isRuntimeMode("test")) {
          logger.debug("hover update", { chartType, x, y }, "ChartHover");
        }
      };

      if (testAutoPopulate) {
        updateHoverState();
        return;
      }

      if (rafId.current != null) cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(updateHoverState);
    },
    [
      enabled,
      data,
      chartWidth,
      chartHeight,
      chartPadding,
      minValue,
      maxValue,
      getYValue,
      buildHoverData,
      testAutoPopulate,
      chartType,
    ]
  );

  const handlePointerInteraction = useCallback(
    (event: PointerInteractionEvent) => {
      const clientX = getClientXFromInteraction(event);
      if (clientX == null) {
        return;
      }

      updateHoverFromClientPoint(clientX, event.currentTarget);
    },
    [updateHoverFromClientPoint]
  );

  const handleMouseLeave = useCallback(() => {
    if (rafId.current != null) cancelAnimationFrame(rafId.current);
    rafId.current = null;
    lastIndexRef.current = null;
    isAutoHoverActiveRef.current = false;
    setHoveredPoint(null);
  }, []);

  // --- Effects ---

  useEffect(() => {
    return () => {
      if (rafId.current != null) cancelAnimationFrame(rafId.current);
    };
  }, []);

  useTestAutoHoverEffect({
    chartType,
    enabled,
    testAutoPopulate,
    data,
    hoveredPoint,
    setHoveredPoint,
    isAutoHoverActiveRef,
    chartWidth,
    chartHeight,
    chartPadding,
    minValue,
    maxValue,
    getYValue,
    buildHoverData,
  });

  return {
    hoveredPoint,
    handleMouseMove: handlePointerInteraction,
    handlePointerMove: handlePointerInteraction,
    handlePointerDown: handlePointerInteraction,
    handleTouchMove: handlePointerInteraction,
    handleMouseLeave,
    handleTouchEnd: handleMouseLeave,
  };
}
