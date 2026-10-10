import { expect, it } from 'vitest';
import { engineFrame } from './index.js';
import {
  projectFaces,
  type ProjectedFace,
  type ProjectedPoint,
} from './projection.js';
import { sortDepth } from './depth.js';
const layout = {
  width: 390,
  height: 350,
  unit: 5.6,
  origin: [0.465, 0.51] as const,
  perspectiveOrigin: [0.465, 0.42] as const,
};
const tileSize = 16;
type Triangle = readonly [ProjectedPoint, ProjectedPoint, ProjectedPoint];
interface ScreenFace {
  readonly index: number;
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly triangles: readonly Triangle[];
}
function screenFace(face: ProjectedFace): ScreenFace {
  const polygon = face.polygon;
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of polygon) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const triangles: Triangle[] = [];
  for (let i = 1; i + 1 < polygon.length; i++) {
    const a = polygon[0]!,
      b = polygon[i]!,
      c = polygon[i + 1]!;
    const denominator = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
    if (Math.abs(denominator) < 1e-9) {
      continue;
    }
    triangles.push([a, b, c]);
  }
  return { index: face.index, minX, maxX, minY, maxY, triangles };
}
function sample(face: ScreenFace, x: number, y: number): number | null {
  // The box may reject points the triangle tests would also reject; keep a
  // hair of slack so it can never reject one they would accept.
  if (
    x < face.minX - 1e-6 ||
    x > face.maxX + 1e-6 ||
    y < face.minY - 1e-6 ||
    y > face.maxY + 1e-6
  ) {
    return null;
  }
  for (const [a, b, c] of face.triangles) {
    const denominator = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
    const u = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / denominator,
      v = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / denominator,
      w = 1 - u - v;
    if (u >= 1e-8 && v >= 1e-8 && w >= 1e-8) {
      return u * a.z + v * b.z + w * c.z;
    }
  }
  return null;
}
// Faces bucketed by the tiles their screen boxes touch, so each pixel only
// samples the faces that can cover it. Lists keep their input order, which is
// what decides ties.
function byTile(faces: readonly ScreenFace[]): readonly ScreenFace[][] {
  const columns = Math.ceil(layout.width / tileSize),
    rows = Math.ceil(layout.height / tileSize),
    tiles: ScreenFace[][] = Array.from({ length: columns * rows }, () => []);
  for (const face of faces) {
    const first = Math.max(0, Math.floor(face.minX / tileSize)),
      last = Math.min(columns - 1, Math.floor(face.maxX / tileSize)),
      top = Math.max(0, Math.floor(face.minY / tileSize)),
      bottom = Math.min(rows - 1, Math.floor(face.maxY / tileSize));
    for (let row = top; row <= bottom; row++) {
      for (let column = first; column <= last; column++) {
        tiles[row * columns + column]!.push(face);
      }
    }
  }
  return tiles;
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
    const original = projected.filter(visible).map(screenFace),
      drawn = ordered.filter(visible).map(screenFace);
    const zBuffer = byTile(original),
      paintBuffer = byTile(drawn),
      columns = Math.ceil(layout.width / tileSize);
    let wrong = 0;
    for (let y = 1; y < 350; y += 2) {
      const row = Math.floor(y / tileSize);
      for (let x = 1; x < 390; x += 2) {
        const tile = row * columns + Math.floor(x / tileSize);
        let z = -Infinity,
          front = -1,
          paint = -1;
        for (const face of zBuffer[tile]!) {
          const value = sample(face, x, y);
          if (value !== null && value > z + 1e-4) {
            z = value;
            front = face.index;
          }
        }
        for (const face of paintBuffer[tile]!) {
          if (sample(face, x, y) !== null) {
            paint = face.index;
          }
        }
        if (front !== paint && front !== -1 && paint !== -1) {
          const actual = drawn
            .filter((f) => f.index === paint)
            .map((f) => sample(f, x, y))
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
