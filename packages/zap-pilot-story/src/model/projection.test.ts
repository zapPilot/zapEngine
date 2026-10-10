import { expect, it } from 'vitest';
import {
  perspectiveMatrix,
  projectBillboard,
  projectFace,
  transform4,
  transformPoint,
} from './projection.js';
import {
  border,
  corners,
  px,
  rotation,
  token,
  transparent,
  type EngineFrame,
  type SceneFace,
  type TransformOp,
} from './scene.js';
const frame = (overrides: Partial<EngineFrame> = {}): EngineFrame => ({
  camera: { ax: 0, az: 0, scale: 1, center: [0, 0, 0] },
  faces: [],
  pins: [],
  tags: [],
  dots: [],
  dial: { w: 0, h: 0, ops: [], angle: 0, value: '' },
  perspective: 100,
  origin: [0, 0],
  perspectiveOrigin: [0, 0],
  ...overrides,
});
const sceneFace = (overrides: Partial<SceneFace>): SceneFace => ({
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
});
const flat = {
  width: 0,
  height: 0,
  unit: 1,
  origin: [0, 0] as const,
  perspectiveOrigin: [0, 0] as const,
};
it('applies rounded scales and percentage anchors of the box', () => {
  const matrix = transform4(
    [
      { k: 'S', value: 1.26, digits: 1 },
      { k: 'anchor', x: 50, y: -25 },
    ],
    2,
    40,
    20,
  );
  const point = transformPoint(matrix, [1, 1, 1]);
  expect(point.x).toBeCloseTo(1.3 * 21);
  expect(point.y).toBeCloseTo(1.3 * -4);
  expect(point.z).toBeCloseTo(1.3);
  expect(point.w).toBe(1);
});
it('rejects transforms it cannot project', () => {
  expect(() =>
    transform4([{ k: 'skew' } as unknown as TransformOp], 1),
  ).toThrow('Unknown transform: {"k":"skew"}');
});
it("falls back to the frame's origins when the layout has none", () => {
  const scene = frame({ origin: [0.25, 0.5], perspectiveOrigin: [0.5, 0.4] });
  expect(
    perspectiveMatrix(scene, { width: 200, height: 100, unit: 2 }),
  ).toEqual(
    perspectiveMatrix(scene, {
      width: 200,
      height: 100,
      unit: 2,
      origin: [0.25, 0.5],
      perspectiveOrigin: [0.5, 0.4],
    }),
  );
});
it('projects billboard anchors and scales them with their distance', () => {
  // Camera space is the world here: the anchor sits 20px towards an eye 200px away.
  const billboard = projectBillboard(frame(), [3, -4, 10], {
    ...flat,
    unit: 2,
  });
  expect(billboard.x).toBeCloseTo(6 / 0.9);
  expect(billboard.y).toBeCloseTo(-8 / 0.9);
  expect(billboard.z).toBeCloseTo(20 / 0.9);
  expect(billboard.scale).toBeCloseTo(200 / 180);
});
it('averages every corner into the depth of clipped and rounded faces', () => {
  // Tilted 30° about x, a face's height h lifts its points by h / 2.
  const ops = [{ k: 'T', x: 0, y: 0, z: 3 } as const, rotation('RX', 30)];
  const depth = (overrides: Partial<SceneFace>) =>
    projectFace(frame(), sceneFace({ ops, ...overrides }), 0, flat).depth;
  expect(depth({})).toBeCloseTo(4);
  expect(depth({ clip: { k: 'hexagon' } })).toBeCloseTo(4);
  expect(depth({ clip: { k: 'circle' } })).toBeCloseTo(4);
  expect(depth({ radius: { k: 'percent', n: 50 } })).toBeCloseTo(4);
  // A triangle's corners average to its centroid, a third of the way up.
  expect(depth({ clip: { k: 'triangle' } })).toBeCloseTo(3 + 4 / 3 / 2);
});
it('projects the box a face draws, so lines keep the height of their borders', () => {
  const drawn = (overrides: Partial<SceneFace>) =>
    projectFace(frame(), sceneFace(overrides), 0, flat).localPolygon;
  expect(drawn({ h: 0, border: border(1, token('ink')) })).toEqual([
    [0, 0, 0],
    [4, 0, 0],
    [4, 2, 0],
    [0, 2, 0],
  ]);
  // Padding grows a box smaller than itself, as it does in CSS.
  const padding = [px(3)];
  expect(
    drawn({ w: 1, h: 1, text: { ...sceneFace({}).text, padding } })[2],
  ).toEqual([6, 6, 0]);
});
