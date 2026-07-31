import { describe, expect, it } from 'vitest';
import { CHART_DIMENSIONS } from '@/config/track-record';
import {
  chartDateRange,
  indexForX,
  midAndMaxTicks,
  pathForSeries,
  plotInsetPercent,
  pointPercent,
  width,
  xForPoint,
  yForValue,
} from '../chartGeometry';

const { padding, height } = CHART_DIMENSIONS;

describe('indexForX', () => {
  it('round-trips xForPoint at every series length the chart sees', () => {
    for (const total of [2, 3, 500]) {
      for (const index of [0, 1, Math.floor(total / 2), total - 1]) {
        expect(indexForX(xForPoint(index, total), total)).toBe(index);
      }
    }
  });

  it('clamps outside the plot band', () => {
    expect(indexForX(0, 500)).toBe(0);
    expect(indexForX(width, 500)).toBe(499);
  });

  it('collapses a single-point series onto index 0', () => {
    expect(indexForX(400, 1)).toBe(0);
  });
});

describe('plotInsetPercent', () => {
  it('restates the padding as percentages of the same box', () => {
    // The overlay's inset must track CHART_DIMENSIONS; hardcoding it in CSS is
    // exactly the drift this function exists to prevent.
    const inset = plotInsetPercent();
    expect(inset.left).toBe(`${((padding.left / width) * 100).toFixed(4)}%`);
    expect(inset.right).toBe(`${((padding.right / width) * 100).toFixed(4)}%`);
    expect(inset.top).toBe(`${((padding.top / height) * 100).toFixed(4)}%`);
    expect(inset.bottom).toBe(
      `${((padding.bottom / height) * 100).toFixed(4)}%`,
    );
  });
});

describe('pointPercent', () => {
  it('places a viewBox coordinate as a percentage of the full box', () => {
    expect(pointPercent(width / 2, height / 4)).toEqual({
      left: '50.0000%',
      top: '25.0000%',
    });
  });
});

describe('series geometry', () => {
  it('pins the first point to the left padding and spreads the rest', () => {
    expect(xForPoint(0, 5)).toBe(padding.left);
    expect(xForPoint(4, 5)).toBe(width - padding.right);
    expect(xForPoint(0, 1)).toBe(padding.left);
  });

  it('maps the domain top to the top padding and inverts downwards', () => {
    expect(yForValue(200, 100, 200)).toBe(padding.top);
    expect(yForValue(100, 100, 200)).toBe(height - padding.bottom);
  });

  it('emits a move followed by lines at two decimal places', () => {
    const path = pathForSeries(
      [{ value: 100 }, { value: 150 }, { value: 200 }],
      100,
      200,
    );
    expect(path.startsWith('M ')).toBe(true);
    expect(path.split(' L ')).toHaveLength(3);
    expect(path).toMatch(/\d+\.\d{2}/);
  });

  it('reports the mid and max ticks', () => {
    expect(midAndMaxTicks(100, 200)).toEqual([150, 200]);
  });

  it('reports empty dates for an empty series', () => {
    expect(chartDateRange([])).toEqual({ startDate: '', endDate: '' });
  });
});
