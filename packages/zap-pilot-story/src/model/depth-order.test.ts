import { expect, it } from 'vitest';
import { paintOrder, sortDepth, splitFace } from './depth.js';
import { engineFrame } from './index.js';
import {
  projectFace,
  projectFaces,
  transformPoint,
  type Point3,
} from './projection.js';
import {
  border,
  corners,
  rotation,
  token,
  transparent,
  type EngineFrame,
  type SceneFace,
} from './scene.js';
const frame: EngineFrame = {
  camera: { ax: 0, az: 0, scale: 1, center: [0, 0, 0] },
  faces: [],
  pins: [],
  tags: [],
  dots: [],
  dial: { w: 0, h: 0, ops: [], angle: 0, value: '' },
  perspective: 1000,
  origin: [0, 0],
  perspectiveOrigin: [0, 0],
};
const layout = {
  width: 0,
  height: 0,
  unit: 1,
  origin: [0, 0] as const,
  perspectiveOrigin: [0, 0] as const,
};
// The eye sits on the camera axis, `perspective` pixels above the scene.
const eye = [0, 0, 1000] as const;
const T = (x: number, y: number, z: number) => ({ k: 'T', x, y, z }) as const;
function face(index: number, overrides: Partial<SceneFace>) {
  const scene: SceneFace = {
    ops: [],
    w: 4,
    h: 4,
    op: 1,
    layer: 'solid',
    group: 'g',
    fill: token('ink'),
    border: border(0, transparent, 'none'),
    radius: corners(),
    shadow: { k: 'none' },
    mask: { k: 'none' },
    clip: { k: 'none' },
    text: {
      value: '',
      color: transparent,
      size: 1,
      weight: 400,
      padding: [],
      align: 'left',
    },
    glyph: undefined,
    ...overrides,
  };
  return { ...projectFace(frame, scene, index, layout), fragment: 0 };
}
const ground = (index: number) =>
  face(index, { ops: [T(-50, -50, 0)], w: 100, h: 100, group: 'ground' });
const painted = (faces: readonly { index: number; fragment: number }[]) =>
  faces.map((f) => `${f.index}/${f.fragment}`);
it('keeps every constraint of an acyclic order and otherwise follows priority', () => {
  const chain = [
    { before: 0, after: 1, cost: 1 },
    { before: 1, after: 2, cost: 1 },
  ];
  expect(paintOrder([0, -5, -9], chain)).toEqual([0, 1, 2]);
  // Equal priorities keep their positions.
  expect(paintOrder([2, 1, 1], [])).toEqual([1, 2, 0]);
});
it('opens each cycle at its cheapest constraint and keeps all others', () => {
  // Cycles {0, 1} and {2, 3}; the second must follow the first, and face 4
  // follows both even though its priority asks to be painted first.
  const order = paintOrder(
    [0, 0, 0, 0, -100],
    [
      { before: 0, after: 1, cost: 1 },
      { before: 1, after: 0, cost: 2 },
      { before: 2, after: 3, cost: 3 },
      { before: 3, after: 2, cost: 0.5 },
      { before: 1, after: 2, cost: 7 },
      { before: 0, after: 4, cost: 4 },
      { before: 3, after: 4, cost: 6 },
    ],
  );
  // Only 0 → 1 (cost 1) and 3 → 2 (cost 0.5) are broken.
  expect(order).toEqual([1, 0, 2, 3, 4]);
});
it('splits a face only where it straddles the plane', () => {
  const plane = ground(1);
  const above = face(0, { ops: [T(0, 0, 5)] });
  expect(splitFace(above, plane, 1e-7)).toEqual([above]);
  const tilted = face(0, { ops: [T(0, 0, -1), rotation('RX', 30)] });
  const pieces = splitFace(tilted, plane, 1e-7);
  expect(pieces.map((piece) => piece.fragment)).toEqual([1, 2]);
  expect(pieces.map((piece) => piece.depth)).toEqual([
    expect.closeTo(0.5),
    expect.closeTo(-0.5),
  ]);
});
it('leaves a crossing too thin to split whole, under the face it pierces', () => {
  // A sharp triangle whose apex rises 0.0005px through the ground: the piece
  // above has no area, so neither face is split.
  const spike = face(0, {
    ops: [T(0, 0, -14.1416), rotation('RX', 45)],
    w: 1,
    h: 20,
    clip: { k: 'triangle' },
    group: 'spike',
  });
  expect(Math.max(...spike.world.map((p) => p[2]))).toBeGreaterThan(1e-4);
  expect(splitFace(spike, ground(1), 1e-7)).toEqual([spike]);
  expect(painted(sortDepth([spike, ground(1)], 1, eye))).toEqual([
    '0/0',
    '1/0',
  ]);
});
it('never splits crossing faces of one group and paints the deeper first', () => {
  const deep = (index: number) =>
    face(index, { ops: [T(0, 0, -1), rotation('RX', 30)] });
  const shallow = (index: number) =>
    face(index, { ops: [T(0, 0, 1.5), rotation('RX', -30)] });
  expect(painted(sortDepth([deep(0), shallow(1)], 1, eye))).toEqual([
    '0/0',
    '1/0',
  ]);
  expect(painted(sortDepth([shallow(0), deep(1)], 1, eye))).toEqual([
    '1/0',
    '0/0',
  ]);
});
it('paints floor faces at equal depth in scene order', () => {
  const floor = (index: number, x: number) =>
    face(index, { ops: [T(x, 0, 0)], layer: 'floor' });
  expect(painted(sortDepth([floor(1, 0), floor(0, 10)], 1, eye))).toEqual([
    '0/0',
    '1/0',
  ]);
});
// A line rising from (0, 0, −40) to (40, 0, 40), drawn by its 1px border as the engine's are.
const line = (index: number) =>
  face(index, {
    ops: [
      T(0, 0, -40),
      rotation('RY', (-Math.atan2(80, 40) * 180) / Math.PI, 2),
    ],
    w: Math.hypot(40, 80),
    h: 0,
    fill: transparent,
    border: border(1, token('ink')),
    group: 'line',
  });
it('paints a line under the plate that hides its far end', () => {
  // The plate floats at z = −10, over the line's −36…−24 there but below its
  // middle, so the line's average depth alone would put the line on top.
  const plate = face(1, { ops: [T(2, -3, -10)], w: 6, h: 6, group: 'plate' });
  expect(painted(sortDepth([line(0), plate], 1, eye))).toEqual(['0/0', '1/0']);
});
it('splits a line where it passes through a plate, never the plate', () => {
  // The line crosses the plate's plane at x = 20: its far piece paints first.
  const plate = face(0, { ops: [T(15, -3, 0)], w: 10, h: 6, group: 'plate' });
  expect(painted(sortDepth([plate, line(1)], 1, eye))).toEqual([
    '1/2',
    '0/0',
    '1/1',
  ]);
});
it('orders a face with no area at all by its average depth', () => {
  // Without borders or padding a 0-height face is a bare segment: it cannot be
  // split, and its average depth stands in wherever it overlaps.
  const segment = face(0, { ops: [T(0, 1, 5)], w: 10, h: 0 });
  expect(painted(sortDepth([segment, ground(1)], 1, eye))).toEqual([
    '1/0',
    '0/0',
  ]);
});
type Screen = readonly { x: number; y: number; z: number }[];
// Depth of a convex screen polygon at (x, y), or null outside it.
function depthOn(points: Screen, x: number, y: number): number | null {
  for (let i = 1; i + 1 < points.length; i++) {
    const a = points[0]!,
      b = points[i]!,
      c = points[i + 1]!;
    const d = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
    if (Math.abs(d) < 1e-9) {
      continue;
    }
    const u = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / d,
      v = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / d;
    if (u >= 1e-8 && v >= 1e-8 && 1 - u - v >= 1e-8) {
      return u * a.z + v * b.z + (1 - u - v) * c.z;
    }
  }
  return null;
}
// Whether a convex local polygon contains (x, y).
const contains = (polygon: readonly Point3[], x: number, y: number) =>
  polygon.every((p, i) => {
    const q = polygon[(i + 1) % polygon.length]!;
    return (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]) >= 0;
  });
it("orders the Runtime still's lines against every face they pass over", () => {
  const runtime = {
    width: 390,
    height: 300,
    unit: 5.6,
    origin: [0.479, 0.44] as const,
    perspectiveOrigin: [0.479, 0.34] as const,
  };
  const still = engineFrame(1, 0);
  const projected = projectFaces(still, runtime);
  const sorted = sortDepth(projected, runtime.unit, [
    0,
    (0.34 - 0.44) * runtime.height,
    still.perspective * runtime.unit,
  ]);
  const at = new Map(sorted.map((piece, k) => [piece, k]));
  const lines = projected.filter((f) => f.face.h === 0 && f.face.op > 0);
  const wrong: string[] = [];
  for (const whole of lines) {
    const pieces = sorted.filter((f) => f.index === whole.index);
    const length = whole.localPolygon[1]![0];
    for (let k = 0; k < 100; k++) {
      // The middle of the drawn 2px band, at its true depth.
      const x = ((k + 0.5) / 100) * length,
        p = transformPoint(whole.matrix, [x, 1, 0]);
      const piece =
        pieces.length === 1
          ? pieces[0]!
          : pieces.find((f) => contains(f.localPolygon, x, 1));
      // Border-only faces are never split, so only filled faces are held to depth.
      const filled = sorted.filter(
        (f) => f.face.h > 0 && f.face.fill.k !== 'transparent',
      );
      for (const other of piece === undefined ? [] : filled) {
        const z = depthOn(other.polygon, p.x, p.y);
        if (z === null || Math.abs(z - p.z) <= 1e-4) {
          continue;
        }
        // Whichever is nearer must paint later.
        if (z > p.z !== at.get(other)! > at.get(piece!)!) {
          wrong.push(`line ${whole.index} at ${k}% vs face ${other.index}`);
        }
      }
    }
  }
  expect(lines.length).toBeGreaterThan(0);
  expect(wrong).toEqual([]);
});
