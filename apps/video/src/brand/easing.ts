/** Reads the four control points out of a CSS `cubic-bezier()` token. */
export function parseCubicBezier(
  value: string,
): [number, number, number, number] {
  const points = /^cubic-bezier\(([^)]*)\)$/
    .exec(value.trim())?.[1]
    ?.split(',')
    .map((part) => (part.trim() === '' ? Number.NaN : Number(part)));
  if (points?.length !== 4 || points.some((point) => !Number.isFinite(point))) {
    throw new Error(`Not a cubic-bezier() token: "${value}"`);
  }
  return points as [number, number, number, number];
}
