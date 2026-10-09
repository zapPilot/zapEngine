import { expect, it } from 'vitest';
import { engineFrame } from './index.js';
import { projectFaces, type ProjectedPoint } from './projection.js';
import { sortDepth } from './depth.js';
const layout = {
  width: 390,
  height: 350,
  unit: 5.6,
  origin: [0.465, 0.51] as const,
  perspectiveOrigin: [0.465, 0.42] as const,
};
function sample(
  points: readonly ProjectedPoint[],
  x: number,
  y: number,
): number | null {
  for (let i = 1; i + 1 < points.length; i++) {
    const a = points[0]!,
      b = points[i]!,
      c = points[i + 1]!;
    const denominator = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
    if (Math.abs(denominator) < 1e-9) {
      continue;
    }
    const u = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / denominator,
      v = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / denominator,
      w = 1 - u - v;
    if (u >= 1e-8 && v >= 1e-8 && w >= 1e-8) {
      return u * a.z + v * b.z + w * c.z;
    }
  }
  return null;
}
it('matches an independent half-resolution z-buffer outside the floor', () => {
  const frames = [0, 0.045, 0.09, 0.17, 0.32, 0.48, 0.57, 0.68, 0.8, 0.88, 1];
  const diagnostics = [];
  for (const time of frames) {
    const frame = engineFrame(time, 1.3, true);
    const projected = projectFaces(frame, layout);
    const ordered = sortDepth(projected, layout.unit, [
      0,
      (0.42 - 0.51) * 350,
      frame.perspective * layout.unit,
    ]);
    const visible = (f: (typeof projected)[number]) =>
      f.face.layer === 'solid' &&
      f.face.op > 0.5 &&
      f.face.h > 0 &&
      !['transparent', 'radialShadow'].includes(f.face.fill.k) &&
      !(f.face.fill.k === 'mix' && f.face.fill.b.k === 'transparent');
    const original = projected.filter(visible),
      drawn = ordered.filter(visible);
    let wrong = 0;
    for (let y = 1; y < 350; y += 2) {
      for (let x = 1; x < 390; x += 2) {
        let z = -Infinity,
          front = -1,
          paint = -1;
        for (const face of original) {
          const value = sample(face.polygon, x, y);
          if (value !== null && value > z + 1e-4) {
            z = value;
            front = face.index;
          }
        }
        for (const face of drawn) {
          if (sample(face.polygon, x, y) !== null) {
            paint = face.index;
          }
        }
        if (front !== paint && front !== -1 && paint !== -1) {
          const actual = drawn
            .filter((f) => f.index === paint)
            .map((f) => sample(f.polygon, x, y))
            .find((v) => v !== null);
          if (
            actual !== undefined &&
            actual !== null &&
            Math.abs(z - actual) > 1e-4
          ) {
            wrong++;
          }
        }
      }
    }
    diagnostics.push({
      time,
      wrong,
      faces: projected.length,
      fragments: ordered.length,
    });
  }
  expect(diagnostics.map((d) => ({ time: d.time, wrong: d.wrong }))).toEqual(
    frames.map((time) => ({ time, wrong: 0 })),
  );
}, 60_000);
