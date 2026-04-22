/* eslint-disable sonarjs/deprecation */
/**
 * useTestAutoHoverEffect
 * Test-only hook that auto-populates a chart hover point for snapshot/E2E testing.
 * Isolated from production useChartHover to reduce its cognitive footprint.
 */

import { type MutableRefObject, useEffect, useRef } from 'react';

import { isRuntimeMode } from '@/lib/env/runtimeEnv';
import type { ChartHoverState } from '@/types/ui/chartHover';
import { clampMin } from '@/utils/mathUtils';

export function calculateYPosition(
  yValue: number,
  minValue: number,
  maxValue: number,
  chartHeight: number,
  chartPadding: number,
): number {
  const valueRange = Math.max(maxValue - minValue, 1);
  return (
    chartHeight -
    chartPadding -
    ((yValue - minValue) / valueRange) * (chartHeight - 2 * chartPadding)
  );
}

/** Shared chart dimension and value-accessor config used by both useChartHover and this hook */
export interface ChartHoverConfig<T> {
  chartType: string;
  chartWidth: number;
  chartHeight: number;
  chartPadding: number;
  minValue: number;
  maxValue: number;
  getYValue: (point: T) => number;
  buildHoverData: (
    point: T,
    x: number,
    y: number,
    index: number,
  ) => ChartHoverState;
}

interface UseTestAutoHoverEffectParams<T> extends ChartHoverConfig<T> {
  enabled: boolean;
  testAutoPopulate: boolean;
  data: T[];
  hoveredPoint: ChartHoverState | null;
  setHoveredPoint: (state: ChartHoverState | null) => void;
  isAutoHoverActiveRef: MutableRefObject<boolean>;
}

export function useTestAutoHoverEffect<T>(
  params: UseTestAutoHoverEffectParams<T>,
): void {
  const {
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
  } = params;

  const hasTestAutoPopulatedRef = useRef(false);
  const testAutoHideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (
      isRuntimeMode('test') &&
      testAutoPopulate &&
      enabled &&
      hoveredPoint == null &&
      data.length > 0 &&
      !hasTestAutoPopulatedRef.current
    ) {
      const index = Math.min(Math.floor(data.length / 2), data.length - 1);
      const point = data[index];
      if (!point) return;

      const normalizedX =
        data.length <= 1 ? 0.5 : index / clampMin(data.length - 1, 1);
      const x = normalizedX * chartWidth;
      const yValue = getYValue(point);
      const y = calculateYPosition(
        yValue,
        minValue,
        maxValue,
        chartHeight,
        chartPadding,
      );

      setHoveredPoint(buildHoverData(point, x, y, index));
      hasTestAutoPopulatedRef.current = true;
      isAutoHoverActiveRef.current = true;
    }
  }, [
    testAutoPopulate,
    enabled,
    hoveredPoint,
    data,
    chartWidth,
    chartHeight,
    chartPadding,
    minValue,
    maxValue,
    getYValue,
    buildHoverData,
    setHoveredPoint,
    isAutoHoverActiveRef,
  ]);

  useEffect(() => {
    if (!isRuntimeMode('test') || !testAutoPopulate) return;

    if (hoveredPoint != null && isAutoHoverActiveRef.current) {
      if (testAutoHideTimerRef.current != null)
        clearTimeout(testAutoHideTimerRef.current);
      testAutoHideTimerRef.current = window.setTimeout(() => {
        setHoveredPoint(null);
        isAutoHoverActiveRef.current = false;
      }, 1000);
    } else if (hoveredPoint != null) {
      if (testAutoHideTimerRef.current != null) {
        clearTimeout(testAutoHideTimerRef.current);
        testAutoHideTimerRef.current = null;
      }
    }

    return () => {
      if (testAutoHideTimerRef.current != null) {
        clearTimeout(testAutoHideTimerRef.current);
        testAutoHideTimerRef.current = null;
      }
    };
  }, [hoveredPoint, testAutoPopulate, isAutoHoverActiveRef, setHoveredPoint]);
}
