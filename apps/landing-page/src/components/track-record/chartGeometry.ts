import { CHART_DIMENSIONS } from '@/config/track-record';

export const { width, height, padding } = CHART_DIMENSIONS;
export const plotWidth = width - padding.left - padding.right;
export const plotHeight = height - padding.top - padding.bottom;

export function chartDateRange(points: ReadonlyArray<{ date: string }>): {
  startDate: string;
  endDate: string;
} {
  return {
    startDate: points[0]?.date ?? '',
    endDate: points.at(-1)?.date ?? '',
  };
}

export function midAndMaxTicks(
  domainMin: number,
  domainMax: number,
): readonly [number, number] {
  return [(domainMin + domainMax) / 2, domainMax];
}

export function xForPoint(index: number, total: number): number {
  if (total <= 1) return padding.left;
  return padding.left + (index / (total - 1)) * plotWidth;
}

export function yForValue(
  value: number,
  domainMin: number,
  domainMax: number,
): number {
  const ratio = (domainMax - value) / (domainMax - domainMin);
  return padding.top + ratio * plotHeight;
}

export function indexForX(x: number, total: number): number {
  if (total <= 1) return 0;
  const ratio = (x - padding.left) / plotWidth;
  return Math.min(total - 1, Math.max(0, Math.round(ratio * (total - 1))));
}

/**
 * The interactive layer is HTML on top of the SVG, not SVG children: the chart
 * scales roughly 0.4x-1.5x with the viewport, so hit targets and marker sizes
 * specified in px cannot live inside the viewBox. These helpers restate viewBox
 * coordinates as percentages of the same box, derived from CHART_DIMENSIONS so
 * the overlay cannot drift from the chart the way hardcoded CSS would.
 */
export function plotInsetPercent(): {
  top: string;
  right: string;
  bottom: string;
  left: string;
} {
  return {
    top: percentOf(padding.top, height),
    right: percentOf(padding.right, width),
    bottom: percentOf(padding.bottom, height),
    left: percentOf(padding.left, width),
  };
}

export function pointPercent(
  x: number,
  y: number,
): { left: string; top: string } {
  return { left: percentOf(x, width), top: percentOf(y, height) };
}

function percentOf(value: number, extent: number): string {
  return `${((value / extent) * 100).toFixed(4)}%`;
}

export function pathForSeries(
  points: ReadonlyArray<{ value: number }>,
  domainMin: number,
  domainMax: number,
): string {
  return points
    .map((point, index) => {
      const command = index === 0 ? 'M' : 'L';
      return `${command} ${xForPoint(index, points.length).toFixed(2)} ${yForValue(point.value, domainMin, domainMax).toFixed(2)}`;
    })
    .join(' ');
}
