import { act, renderHook } from '@testing-library/react';
import { useChartHover } from '@zapengine/app-core/hooks/ui/useChartHover';
import type { ChartHoverState } from '@zapengine/app-core/types/ui/chartHover';
import type { MouseEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@zapengine/app-core/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
  },
}));

interface Point {
  date: string;
  value: number;
}

const points: Point[] = [
  { date: '2026-01-01', value: 0 },
  { date: '2026-01-02', value: 50 },
  { date: '2026-01-03', value: 100 },
];

function createSvg(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
    top: 0,
    left: 0,
    bottom: 200,
    right: 400,
    width: 400,
    height: 200,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  return svg;
}

function renderHoverHook(options: { enabled?: boolean } = {}) {
  return renderHook(() =>
    useChartHover(points, {
      chartType: 'performance',
      chartWidth: 200,
      chartHeight: 100,
      chartPadding: 10,
      minValue: 0,
      maxValue: 100,
      getYValue: (point) => point.value,
      buildHoverData: (point, x, y, index): ChartHoverState =>
        ({
          chartType: 'performance',
          date: point.date,
          value: point.value,
          x,
          y,
          index,
        }) as ChartHoverState,
      testAutoPopulate: true,
      ...options,
    }),
  );
}

describe('useChartHover', () => {
  it('updates hover state for the nearest data point', () => {
    const svg = createSvg();
    const { result } = renderHoverHook();

    act(() => {
      result.current.handleMouseMove({
        clientX: 395,
        currentTarget: svg,
      } as MouseEvent<SVGSVGElement>);
    });

    expect(result.current.hoveredPoint).toEqual(
      expect.objectContaining({
        chartType: 'performance',
        date: '2026-01-03',
        value: 100,
        x: 200,
        y: 10,
        containerWidth: 400,
        containerHeight: 200,
        screenX: 400,
        screenY: 20,
      }),
    );
  });

  it('does not update hover state when disabled', () => {
    const svg = createSvg();
    const { result } = renderHoverHook({ enabled: false });

    act(() => {
      result.current.handleMouseMove({
        clientX: 395,
        currentTarget: svg,
      } as MouseEvent<SVGSVGElement>);
    });

    expect(result.current.hoveredPoint).toBeNull();
  });

  it('clears hover state on mouse leave', () => {
    const svg = createSvg();
    const { result } = renderHoverHook();

    act(() => {
      result.current.handleMouseMove({
        clientX: 395,
        currentTarget: svg,
      } as MouseEvent<SVGSVGElement>);
    });
    expect(result.current.hoveredPoint).not.toBeNull();

    act(() => {
      result.current.handleMouseLeave();
    });

    expect(result.current.hoveredPoint).toBeNull();
  });
});
