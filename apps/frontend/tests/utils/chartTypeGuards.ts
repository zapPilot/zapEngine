/**
 * Custom type guards and Vitest matchers for chart testing
 * Provides type-safe assertions and domain-specific matchers
 */

import { expect } from "vitest";

import type { ChartHoverState } from "@/types/chartHover";

/**
 * Type guard to check if value is ChartHoverState
 */
export function isChartHoverState(value: unknown): value is ChartHoverState {
  if (typeof value !== "object" || value === null) return false;

  const obj = value as Record<string, unknown>;
  return (
    typeof obj.chartType === "string" &&
    typeof obj.x === "number" &&
    typeof obj.y === "number" &&
    typeof obj.date === "string"
  );
}

/**
 * Assert hover state matches expected chart type
 * Provides type narrowing for TypeScript
 */
export function assertHoverStateType<T extends ChartHoverState["chartType"]>(
  state: ChartHoverState | null,
  chartType: T
): asserts state is Extract<ChartHoverState, { chartType: T }> {
  expect(state).not.toBeNull();
  expect(state?.chartType).toBe(chartType);
}

/**
 * Custom matchers for chart hover states
 */
export const chartMatchers = {
  /**
   * Verify value is a valid ChartHoverState
   */
  toBeValidHoverState(received: unknown) {
    const pass = isChartHoverState(received);
    return {
      pass,
      message: () =>
        pass
          ? `Expected value not to be a valid ChartHoverState`
          : `Expected value to be a valid ChartHoverState with chartType, x, y, and date properties`,
      actual: received,
      expected: "ChartHoverState",
    };
  },

  /**
   * Verify hover state has specific chart type
   */
  toHaveChartType(received: ChartHoverState | null, expected: string) {
    const pass = received?.chartType === expected;
    return {
      pass,
      message: () =>
        pass
          ? `Expected chartType not to be ${expected}`
          : `Expected chartType to be ${expected}, but got ${received?.chartType || "null"}`,
      actual: received?.chartType,
      expected,
    };
  },

  /**
   * Verify coordinates are within SVG bounds
   */
  toBeWithinSVGBounds(
    received: ChartHoverState | null,
    bounds: { width: number; height: number }
  ) {
    if (!received) {
      return {
        pass: false,
        message: () => "Expected hover state to exist",
        actual: null,
        expected: bounds,
      };
    }

    const withinX = received.x >= 0 && received.x <= bounds.width;
    const withinY = received.y >= 0 && received.y <= bounds.height;
    const pass = withinX && withinY;

    return {
      pass,
      message: () =>
        pass
          ? `Expected coordinates not to be within SVG bounds`
          : `Expected coordinates (${received.x}, ${received.y}) to be within bounds (0-${bounds.width}, 0-${bounds.height})`,
      actual: { x: received.x, y: received.y },
      expected: bounds,
    };
  },

  /**
   * Verify SVG line element has correct vertical line styling
   */
  toBeVerticalLine(
    received: Element | null,
    x: number,
    options?: { y1?: number; y2?: number; stroke?: string }
  ) {
    if (!received) {
      return {
        pass: false,
        message: () => "Expected line element to exist",
        actual: null,
      };
    }

    if (received.tagName !== "line") {
      return {
        pass: false,
        message: () =>
          `Expected element to be a line, but got ${received.tagName}`,
        actual: received.tagName,
        expected: "line",
      };
    }

    const x1 = received.getAttribute("x1");
    const x2 = received.getAttribute("x2");
    const y1 = received.getAttribute("y1");
    const y2 = received.getAttribute("y2");
    const stroke = received.getAttribute("stroke");

    const checks = {
      x1Match: x1 === String(x),
      x2Match: x2 === String(x),
      y1Match: options?.y1 === undefined || y1 === String(options.y1),
      y2Match: options?.y2 === undefined || y2 === String(options.y2),
      strokeMatch: options?.stroke === undefined || stroke === options.stroke,
    };

    const pass = Object.values(checks).every(Boolean);

    if (!pass) {
      const failures = Object.entries(checks)
        .filter(([, v]) => !v)
        .map(([k]) => k);

      const formatLine = (
        label: string,
        actual: string | null,
        expected?: string | number | null
      ) => {
        const expectedSuffix =
          expected === undefined || expected === null
            ? ""
            : ` (expected: ${expected})`;
        return `  ${label}: ${actual ?? ""}${expectedSuffix}`;
      };

      return {
        pass: false,
        message: () =>
          [
            `Vertical line validation failed: ${failures.join(", ")}`,
            formatLine("x1", x1, x),
            formatLine("x2", x2, x),
            formatLine("y1", y1, options?.y1 ?? null),
            formatLine("y2", y2, options?.y2 ?? null),
            formatLine("stroke", stroke, options?.stroke ?? null),
          ].join("\n"),
        actual: { x1, x2, y1, y2, stroke },
        expected: {
          x1: x,
          x2: x,
          y1: options?.y1,
          y2: options?.y2,
          stroke: options?.stroke,
        },
      };
    }

    return {
      pass: true,
      message: () => "Expected line not to be a vertical line",
    };
  },

  /**
   * Verify element has Framer Motion animation attributes
   */
  toHaveFramerMotionProps(received: Element | null) {
    if (!received) {
      return {
        pass: false,
        message: () => "Expected element to exist",
        actual: null,
      };
    }

    // Check for data attributes that Framer Motion adds
    // In tests with mocked Framer Motion, we check for the original props
    const hasInitial =
      received.hasAttribute("initial") ||
      received.getAttribute("data-testid")?.includes("motion");
    const hasAnimate =
      received.hasAttribute("animate") || received.hasAttribute("style");

    const pass =
      hasInitial ||
      hasAnimate ||
      received.tagName.toLowerCase().includes("motion");

    return {
      pass,
      message: () =>
        pass
          ? "Expected element not to have Framer Motion properties"
          : "Expected element to have Framer Motion properties (initial, animate, or motion tag)",
      actual: {
        tagName: received.tagName,
        hasInitial,
        hasAnimate,
      },
    };
  },
};

/**
 * Extend Vitest assertion interface with custom matchers
 */
declare module "vitest" {
  interface Assertion<T = any> {
    toBeValidHoverState(): T;
    toHaveChartType(chartType: string): T;
    toBeWithinSVGBounds(bounds: { width: number; height: number }): T;
    toBeVerticalLine(
      x: number,
      options?: { y1?: number; y2?: number; stroke?: string }
    ): T;
    toHaveFramerMotionProps(): T;
  }
}

/**
 * Helper to narrow chart hover state type
 */
export function narrowHoverState<T extends ChartHoverState["chartType"]>(
  state: ChartHoverState | null,
  chartType: T
): Extract<ChartHoverState, { chartType: T }> | null {
  if (!state || state.chartType !== chartType) {
    return null;
  }
  return state as Extract<ChartHoverState, { chartType: T }>;
}

/**
 * Type guard for asset allocation hover data
 */
export function isAssetAllocationHoverData(
  state: ChartHoverState | null
): state is Extract<ChartHoverState, { chartType: "asset-allocation" }> {
  return state?.chartType === "asset-allocation";
}

/**
 * @deprecated Use isAssetAllocationHoverData - 'allocation' renamed to 'asset-allocation'
 */
export const isAllocationHoverData = isAssetAllocationHoverData;

/**
 * Type guard for performance hover data
 */
export function isPerformanceHoverData(
  state: ChartHoverState | null
): state is Extract<ChartHoverState, { chartType: "performance" }> {
  return state?.chartType === "performance";
}

/**
 * Type guard for drawdown hover data
 */
export function isDrawdownHoverData(
  state: ChartHoverState | null
): state is Extract<ChartHoverState, { chartType: "drawdown-recovery" }> {
  return state?.chartType === "drawdown-recovery";
}
