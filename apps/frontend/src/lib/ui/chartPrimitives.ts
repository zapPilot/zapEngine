/**
 * Shared chart geometry helpers used across custom SVG chart renderers.
 */

/**
 * Build an SVG path string from normalized x coordinates.
 *
 * @template T - Point type with an `x` percentage value
 * @param points - Array of points with `x` values in the 0-100 range
 * @param width - SVG viewBox width in pixels
 * @param getY - Function that returns the pixel Y value for a point
 * @returns SVG path string
 */
export function buildPath<T extends { x: number }>(
  points: T[],
  width: number,
  getY: (point: T) => number
): string {
  return points
    .map(point => {
      const x = (point.x / 100) * width;
      const y = getY(point);
      return `${x},${y}`;
    })
    .join(" L ");
}

/**
 * Common grid line positions (percentages from the top of the chart).
 */
export const CHART_GRID_POSITIONS = {
  FIVE_LINES: [0, 25, 50, 75, 100] as number[],
  FOUR_LINES: [0, 33, 66, 100] as number[],
  THREE_LINES: [0, 50, 100] as number[],
};
