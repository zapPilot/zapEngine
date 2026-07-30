import { CHART_DIMENSIONS } from '@/config/track-record';

export const { width, height, padding } = CHART_DIMENSIONS;
const plotWidth = width - padding.left - padding.right;
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
  return [Math.round((domainMin + domainMax) / 2), domainMax];
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
