import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  calculateYPosition,
  type ChartHoverConfig,
  useTestAutoHoverEffect,
} from "@/hooks/ui/useTestAutoHoverEffect";
import type { ChartHoverState } from "@/types/ui/chartHover";

describe("calculateYPosition", () => {
  it("should calculate y position for value in middle of range", () => {
    const result = calculateYPosition(50, 0, 100, 200, 10);
    // yValue = 50, minValue = 0, maxValue = 100, chartHeight = 200, chartPadding = 10
    // valueRange = 100
    // y = 200 - 10 - ((50 - 0) / 100) * (200 - 20)
    // y = 190 - (0.5 * 180) = 190 - 90 = 100
    expect(result).toBe(100);
  });

  it("should calculate y position for value at min boundary", () => {
    const result = calculateYPosition(0, 0, 100, 200, 10);
    // y = 200 - 10 - ((0 - 0) / 100) * (200 - 20)
    // y = 190 - (0 * 180) = 190
    expect(result).toBe(190);
  });

  it("should calculate y position for value at max boundary", () => {
    const result = calculateYPosition(100, 0, 100, 200, 10);
    // y = 200 - 10 - ((100 - 0) / 100) * (200 - 20)
    // y = 190 - (1 * 180) = 190 - 180 = 10
    expect(result).toBe(10);
  });

  it("should handle minValue === maxValue using Math.max guard", () => {
    const result = calculateYPosition(50, 50, 50, 200, 10);
    // valueRange = Math.max(50 - 50, 1) = 1
    // y = 200 - 10 - ((50 - 50) / 1) * (200 - 20)
    // y = 190 - (0 * 180) = 190
    expect(result).toBe(190);
  });

  it("should handle zero padding", () => {
    const result = calculateYPosition(50, 0, 100, 200, 0);
    // y = 200 - 0 - ((50 - 0) / 100) * (200 - 0)
    // y = 200 - (0.5 * 200) = 200 - 100 = 100
    expect(result).toBe(100);
  });
});

interface TestDataPoint {
  value: number;
  label: string;
}

describe("useTestAutoHoverEffect", () => {
  const mockSetHoveredPoint = vi.fn();
  const mockBuildHoverData = vi.fn(
    (
      point: TestDataPoint,
      x: number,
      y: number,
      index: number
    ): ChartHoverState => ({
      x,
      y,
      value: point.value,
      label: point.label,
      index,
    })
  );
  const mockGetYValue = vi.fn((point: TestDataPoint): number => point.value);

  const baseConfig: ChartHoverConfig<TestDataPoint> = {
    chartType: "test-chart",
    chartWidth: 400,
    chartHeight: 200,
    chartPadding: 10,
    minValue: 0,
    maxValue: 100,
    getYValue: mockGetYValue,
    buildHoverData: mockBuildHoverData,
  };

  const testData: TestDataPoint[] = [
    { value: 10, label: "Point 1" },
    { value: 50, label: "Point 2" },
    { value: 90, label: "Point 3" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Reset NODE_ENV to test for all tests
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("Effect 1: Auto-populate hover on initial render", () => {
    it("should auto-populate hover point when all conditions are met", () => {
      const isAutoHoverActiveRef = { current: false };

      renderHook(() =>
        useTestAutoHoverEffect({
          ...baseConfig,
          enabled: true,
          testAutoPopulate: true,
          data: testData,
          hoveredPoint: null,
          setHoveredPoint: mockSetHoveredPoint,
          isAutoHoverActiveRef,
        })
      );

      // Should select middle index (1)
      const expectedIndex = 1;
      const expectedPoint = testData[expectedIndex];
      const normalizedX = expectedIndex / (testData.length - 1); // 1 / 2 = 0.5
      const expectedX = normalizedX * 400; // 200
      const expectedY = calculateYPosition(50, 0, 100, 200, 10); // 100

      expect(mockGetYValue).toHaveBeenCalledWith(expectedPoint);
      expect(mockBuildHoverData).toHaveBeenCalledWith(
        expectedPoint,
        expectedX,
        expectedY,
        expectedIndex
      );
      expect(mockSetHoveredPoint).toHaveBeenCalledWith({
        x: expectedX,
        y: expectedY,
        value: 50,
        label: "Point 2",
        index: expectedIndex,
      });
      expect(isAutoHoverActiveRef.current).toBe(true);
    });

    it("should skip when enabled is false", () => {
      const isAutoHoverActiveRef = { current: false };

      renderHook(() =>
        useTestAutoHoverEffect({
          ...baseConfig,
          enabled: false,
          testAutoPopulate: true,
          data: testData,
          hoveredPoint: null,
          setHoveredPoint: mockSetHoveredPoint,
          isAutoHoverActiveRef,
        })
      );

      expect(mockSetHoveredPoint).not.toHaveBeenCalled();
      expect(isAutoHoverActiveRef.current).toBe(false);
    });

    it("should skip when testAutoPopulate is false", () => {
      const isAutoHoverActiveRef = { current: false };

      renderHook(() =>
        useTestAutoHoverEffect({
          ...baseConfig,
          enabled: true,
          testAutoPopulate: false,
          data: testData,
          hoveredPoint: null,
          setHoveredPoint: mockSetHoveredPoint,
          isAutoHoverActiveRef,
        })
      );

      expect(mockSetHoveredPoint).not.toHaveBeenCalled();
      expect(isAutoHoverActiveRef.current).toBe(false);
    });

    it("should skip when data is empty", () => {
      const isAutoHoverActiveRef = { current: false };

      renderHook(() =>
        useTestAutoHoverEffect({
          ...baseConfig,
          enabled: true,
          testAutoPopulate: true,
          data: [],
          hoveredPoint: null,
          setHoveredPoint: mockSetHoveredPoint,
          isAutoHoverActiveRef,
        })
      );

      expect(mockSetHoveredPoint).not.toHaveBeenCalled();
      expect(isAutoHoverActiveRef.current).toBe(false);
    });

    it("should skip when hoveredPoint is already set", () => {
      const isAutoHoverActiveRef = { current: false };
      const existingHoverState: ChartHoverState = {
        x: 100,
        y: 50,
        value: 25,
        label: "Existing",
        index: 0,
      };

      renderHook(() =>
        useTestAutoHoverEffect({
          ...baseConfig,
          enabled: true,
          testAutoPopulate: true,
          data: testData,
          hoveredPoint: existingHoverState,
          setHoveredPoint: mockSetHoveredPoint,
          isAutoHoverActiveRef,
        })
      );

      expect(mockSetHoveredPoint).not.toHaveBeenCalled();
      expect(isAutoHoverActiveRef.current).toBe(false);
    });

    it("should not auto-populate on second render (hasTestAutoPopulatedRef guard)", () => {
      const isAutoHoverActiveRef = { current: false };

      const { rerender } = renderHook(
        (props: { hoveredPoint: ChartHoverState | null }) =>
          useTestAutoHoverEffect({
            ...baseConfig,
            enabled: true,
            testAutoPopulate: true,
            data: testData,
            hoveredPoint: props.hoveredPoint,
            setHoveredPoint: mockSetHoveredPoint,
            isAutoHoverActiveRef,
          }),
        {
          initialProps: { hoveredPoint: null },
        }
      );

      // First render should trigger auto-populate
      expect(mockSetHoveredPoint).toHaveBeenCalledTimes(1);

      vi.clearAllMocks();

      // Second render with hoveredPoint set to null again should NOT trigger
      rerender({ hoveredPoint: null });

      expect(mockSetHoveredPoint).not.toHaveBeenCalled();
    });

    it("should handle single data point (edge case for normalizedX)", () => {
      const isAutoHoverActiveRef = { current: false };
      const singleDataPoint = [{ value: 50, label: "Single" }];

      renderHook(() =>
        useTestAutoHoverEffect({
          ...baseConfig,
          enabled: true,
          testAutoPopulate: true,
          data: singleDataPoint,
          hoveredPoint: null,
          setHoveredPoint: mockSetHoveredPoint,
          isAutoHoverActiveRef,
        })
      );

      // For single point, normalizedX should be 0.5
      const expectedX = 0.5 * 400; // 200
      const expectedY = calculateYPosition(50, 0, 100, 200, 10);

      expect(mockBuildHoverData).toHaveBeenCalledWith(
        singleDataPoint[0],
        expectedX,
        expectedY,
        0
      );
    });

    it("should skip when NODE_ENV is not test", () => {
      process.env.NODE_ENV = "production";
      const isAutoHoverActiveRef = { current: false };

      renderHook(() =>
        useTestAutoHoverEffect({
          ...baseConfig,
          enabled: true,
          testAutoPopulate: true,
          data: testData,
          hoveredPoint: null,
          setHoveredPoint: mockSetHoveredPoint,
          isAutoHoverActiveRef,
        })
      );

      expect(mockSetHoveredPoint).not.toHaveBeenCalled();
    });
  });

  describe("Effect 2: Auto-hide timer", () => {
    it("should set timer to clear hover after 1000ms when auto-hover is active", () => {
      const isAutoHoverActiveRef = { current: true };
      const existingHoverState: ChartHoverState = {
        x: 100,
        y: 50,
        value: 25,
        label: "Existing",
        index: 0,
      };

      renderHook(() =>
        useTestAutoHoverEffect({
          ...baseConfig,
          enabled: true,
          testAutoPopulate: true,
          data: testData,
          hoveredPoint: existingHoverState,
          setHoveredPoint: mockSetHoveredPoint,
          isAutoHoverActiveRef,
        })
      );

      // Should not be called immediately
      expect(mockSetHoveredPoint).not.toHaveBeenCalled();

      // Advance timers by 1000ms
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(mockSetHoveredPoint).toHaveBeenCalledWith(null);
      expect(isAutoHoverActiveRef.current).toBe(false);
    });

    it("should clear timer when hoveredPoint is set but isAutoHoverActiveRef is false", () => {
      const isAutoHoverActiveRef = { current: false };
      const existingHoverState: ChartHoverState = {
        x: 100,
        y: 50,
        value: 25,
        label: "Existing",
        index: 0,
      };

      renderHook(() =>
        useTestAutoHoverEffect({
          ...baseConfig,
          enabled: true,
          testAutoPopulate: true,
          data: testData,
          hoveredPoint: existingHoverState,
          setHoveredPoint: mockSetHoveredPoint,
          isAutoHoverActiveRef,
        })
      );

      // Advance timers - should not trigger clear
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(mockSetHoveredPoint).not.toHaveBeenCalled();
    });

    it("should clear existing timer when hoveredPoint changes while auto-hover is active", () => {
      const isAutoHoverActiveRef = { current: true };
      const hoverState1: ChartHoverState = {
        x: 100,
        y: 50,
        value: 25,
        label: "First",
        index: 0,
      };
      const hoverState2: ChartHoverState = {
        x: 200,
        y: 100,
        value: 50,
        label: "Second",
        index: 1,
      };

      const { rerender } = renderHook(
        (props: { hoveredPoint: ChartHoverState | null }) =>
          useTestAutoHoverEffect({
            ...baseConfig,
            enabled: true,
            testAutoPopulate: true,
            data: testData,
            hoveredPoint: props.hoveredPoint,
            setHoveredPoint: mockSetHoveredPoint,
            isAutoHoverActiveRef,
          }),
        {
          initialProps: { hoveredPoint: hoverState1 },
        }
      );

      // Advance time partially
      act(() => {
        vi.advanceTimersByTime(500);
      });

      // Change hoveredPoint - should clear old timer and start new one
      rerender({ hoveredPoint: hoverState2 });

      // Advance another 500ms (total 1000ms from first timer, but only 500ms from second)
      act(() => {
        vi.advanceTimersByTime(500);
      });

      // Should not have cleared yet (only 500ms on new timer)
      expect(mockSetHoveredPoint).not.toHaveBeenCalled();

      // Advance another 500ms to complete the second timer
      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(mockSetHoveredPoint).toHaveBeenCalledWith(null);
    });

    it("should clear timer on unmount", () => {
      const isAutoHoverActiveRef = { current: true };
      const existingHoverState: ChartHoverState = {
        x: 100,
        y: 50,
        value: 25,
        label: "Existing",
        index: 0,
      };

      const { unmount } = renderHook(() =>
        useTestAutoHoverEffect({
          ...baseConfig,
          enabled: true,
          testAutoPopulate: true,
          data: testData,
          hoveredPoint: existingHoverState,
          setHoveredPoint: mockSetHoveredPoint,
          isAutoHoverActiveRef,
        })
      );

      // Unmount before timer completes
      unmount();

      // Advance timers
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      // Should not have been called because timer was cleared on unmount
      expect(mockSetHoveredPoint).not.toHaveBeenCalled();
    });

    it("should not set timer when testAutoPopulate is false", () => {
      const isAutoHoverActiveRef = { current: true };
      const existingHoverState: ChartHoverState = {
        x: 100,
        y: 50,
        value: 25,
        label: "Existing",
        index: 0,
      };

      renderHook(() =>
        useTestAutoHoverEffect({
          ...baseConfig,
          enabled: true,
          testAutoPopulate: false,
          data: testData,
          hoveredPoint: existingHoverState,
          setHoveredPoint: mockSetHoveredPoint,
          isAutoHoverActiveRef,
        })
      );

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(mockSetHoveredPoint).not.toHaveBeenCalled();
    });

    it("should not set timer when NODE_ENV is not test", () => {
      process.env.NODE_ENV = "production";
      const isAutoHoverActiveRef = { current: true };
      const existingHoverState: ChartHoverState = {
        x: 100,
        y: 50,
        value: 25,
        label: "Existing",
        index: 0,
      };

      renderHook(() =>
        useTestAutoHoverEffect({
          ...baseConfig,
          enabled: true,
          testAutoPopulate: true,
          data: testData,
          hoveredPoint: existingHoverState,
          setHoveredPoint: mockSetHoveredPoint,
          isAutoHoverActiveRef,
        })
      );

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(mockSetHoveredPoint).not.toHaveBeenCalled();
    });

    it("should handle hoveredPoint changing to null before timer fires", () => {
      const isAutoHoverActiveRef = { current: true };
      const existingHoverState: ChartHoverState = {
        x: 100,
        y: 50,
        value: 25,
        label: "Existing",
        index: 0,
      };

      const { rerender } = renderHook(
        (props: { hoveredPoint: ChartHoverState | null }) =>
          useTestAutoHoverEffect({
            ...baseConfig,
            enabled: true,
            testAutoPopulate: false, // Disable auto-populate to avoid interference
            data: testData,
            hoveredPoint: props.hoveredPoint,
            setHoveredPoint: mockSetHoveredPoint,
            isAutoHoverActiveRef,
          }),
        {
          initialProps: { hoveredPoint: existingHoverState },
        }
      );

      // Manually clear hoveredPoint before timer fires
      rerender({ hoveredPoint: null });

      // Advance timers
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      // setHoveredPoint should not be called because hoveredPoint is already null
      expect(mockSetHoveredPoint).not.toHaveBeenCalled();
    });

    it("should clear timer when user manually hovers (isAutoHoverActiveRef becomes false) while auto-timer is running", () => {
      // Scenario: Auto-populate creates hover and sets a timer, then user manually hovers
      const isAutoHoverActiveRef = { current: false };
      const userHoverState: ChartHoverState = {
        x: 200,
        y: 100,
        value: 50,
        label: "User-hovered",
        index: 1,
      };

      // First render: auto-populate will create hoveredPoint and set isAutoHoverActiveRef to true
      const { rerender } = renderHook(
        (props: { hoveredPoint: ChartHoverState | null }) =>
          useTestAutoHoverEffect({
            ...baseConfig,
            enabled: true,
            testAutoPopulate: true,
            data: testData,
            hoveredPoint: props.hoveredPoint,
            setHoveredPoint: mockSetHoveredPoint,
            isAutoHoverActiveRef,
          }),
        {
          initialProps: { hoveredPoint: null },
        }
      );

      // Auto-populate should have triggered
      expect(mockSetHoveredPoint).toHaveBeenCalled();
      expect(isAutoHoverActiveRef.current).toBe(true);

      // Get the auto-populated hover state
      const autoHoverState = mockSetHoveredPoint.mock.calls[0][0];
      vi.clearAllMocks();

      // Rerender with the auto-populated hover state to trigger timer
      rerender({ hoveredPoint: autoHoverState });

      // Timer should now be set
      expect(vi.getTimerCount()).toBeGreaterThan(0);

      // Simulate user manually hovering: set ref to false and change hoveredPoint
      isAutoHoverActiveRef.current = false;
      rerender({ hoveredPoint: userHoverState });

      // The timer should be cleared because hoveredPoint changed while isAutoHoverActiveRef is false
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      // setHoveredPoint should not be called because the timer was cleared
      expect(mockSetHoveredPoint).not.toHaveBeenCalled();
    });
  });
});
