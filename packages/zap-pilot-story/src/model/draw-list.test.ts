import { describe, expect, it } from 'vitest';
import {
  ASSET_GLYPH_PATHS,
  buildDrawList,
  engineFrame,
  projectBillboard,
  projectFaces,
  type DrawColor,
  type DrawCommand,
  type DrawList,
  type DrawListOptions,
  type EngineFrame,
  type ProjectionLayout,
  type SceneDot,
  type SceneFace,
  type ScenePin,
  type SceneTag,
  type TextMeasure,
} from './index.js';
import {
  bare,
  border,
  corners,
  mix,
  px,
  token,
  translate,
  transparent,
  world,
} from './scene.js';

const U = 5.6;
const FIRST_RUN: ProjectionLayout = {
  width: 390,
  height: 350,
  unit: U,
  origin: [0.465, 0.51],
  perspectiveOrigin: [0.465, 0.42],
};
const RUNTIME: ProjectionLayout = {
  width: 390,
  height: 300,
  unit: U,
  origin: [0.479, 0.44],
  perspectiveOrigin: [0.479, 0.34],
};
// Martian Mono advances 0.7em per glyph; hosts measure with their own text engine.
const measure: TextMeasure = (text, font) =>
  [...text].length * (0.7 * font.size + font.letterSpacing);
const role = (id: string) => ({ k: 'token', id }) as DrawColor;
const BASE = engineFrame(0.09);
const scene = (parts: Partial<EngineFrame>): EngineFrame => ({
  ...BASE,
  faces: [],
  pins: [],
  tags: [],
  dots: [],
  ...parts,
});
function face(overrides: Partial<SceneFace> = {}): SceneFace {
  return {
    ops: translate(-10, -10, 2),
    w: 10,
    h: 5,
    op: 1,
    layer: 'solid',
    group: 'test',
    fill: token('ink'),
    border: border(0, transparent, 'none'),
    radius: corners(px(0)),
    shadow: { k: 'none' },
    mask: { k: 'none' },
    clip: { k: 'none' },
    text: {
      value: '',
      color: token('ink-3'),
      size: 0.6,
      weight: 500,
      padding: [px(0)],
      align: 'left',
    },
    glyph: undefined,
    ...overrides,
  };
}
const text = (value: string, overrides: Partial<SceneFace['text']> = {}) =>
  ({ ...face().text, value, ...overrides }) satisfies SceneFace['text'];
const draw = (frame: EngineFrame, options: Partial<DrawListOptions> = {}) =>
  buildDrawList(frame, {
    layout: FIRST_RUN,
    measure,
    layers: ['faces'],
    ...options,
  });
/** A lone face draws as save, concat, body, restore. */
function body(overrides: Partial<SceneFace>): DrawCommand[] {
  const { commands } = draw(scene({ faces: [face(overrides)] }));
  expect(commands[0]).toEqual({ op: 'save' });
  expect(commands[1]!.op).toBe('concat');
  expect(commands.at(-1)).toEqual({ op: 'restore' });
  return commands.slice(2, -1);
}
const only = <K extends DrawCommand['op']>(
  commands: readonly DrawCommand[],
  op: K,
) =>
  commands.filter(
    (command): command is Extract<DrawCommand, { op: K }> => command.op === op,
  );
function expectBalanced(list: DrawList) {
  let depth = 0;
  for (const command of list.commands) {
    if (command.op === 'save' || command.op === 'layer') {
      depth++;
    } else if (command.op === 'restore') {
      depth--;
    }
    expect(depth).toBeGreaterThanOrEqual(0);
  }
  expect(depth).toBe(0);
}
const MISSING_MARKS = /[↘↗⇄∶◇⊥✓]/;
function pin(overrides: Partial<ScenePin> = {}): ScenePin {
  return {
    id: 'your-wallet',
    anchor: [6, 22.5, 2.6],
    ops: [],
    op: 1,
    title: 'YOUR WALLET',
    subtitle: 'you sign',
    glyph: 'live',
    tone: '',
    stem: 1.7,
    asset: undefined,
    ...overrides,
  };
}
function tag(overrides: Partial<SceneTag> = {}): SceneTag {
  return {
    anchor: [-14, -17, 5],
    ops: [],
    op: 1,
    number: '1',
    title: 'Cross-down exit',
    subtitle: '',
    tone: '',
    ...overrides,
  };
}
const dot = (overrides: Partial<SceneDot> = {}): SceneDot => ({
  anchor: [-12, -30, 12],
  ops: [],
  size: 7,
  color: token('ink'),
  op: 0.8,
  ...overrides,
});

describe('engine drawing list', () => {
  it('draws the landed First Run frame with host pin copy matched by id', () => {
    const list = buildDrawList(BASE, {
      layout: FIRST_RUN,
      measure,
      pinLabels: { 'your-wallet': 'Ton portefeuille', constructor: 'x' },
    });
    expect(JSON.parse(JSON.stringify(list))).toEqual(list);
    expectBalanced(list);
    expect(list).toMatchObject({ width: 390, height: 350 });
    const runs = only(list.commands, 'text');
    const texts = runs.map((c) => c.text);
    // Billboards set 10px type; a labelled pin shows only its label.
    expect(runs.filter((c) => c.font.size === 10).map((c) => c.text)).toEqual(
      expect.arrayContaining([
        'TON PORTEFEUILLE',
        'YOUR STRATEGY',
        'READABLE RULES',
        'YOUR MACHINE',
        'PLANNED · HOSTED TODAY',
      ]),
    );
    expect(texts).not.toContain('YOU SIGN');
    expect(texts).toEqual(
      expect.arrayContaining([
        BASE.dial.value,
        'STABLES · TARGET',
        'ZAP PILOT · PORTFOLIO RUNTIME',
        '↑',
      ]),
    );
    expect(texts.filter((t) => MISSING_MARKS.test(t))).toEqual([]);
    const paths = new Set(only(list.commands, 'path').map((c) => c.d));
    for (const asset of ['btc', 'eth', 'spy', 'stable'] as const) {
      expect(paths.has(ASSET_GLYPH_PATHS[asset])).toBe(true);
    }
    // ↘ ↗ ⇄ ∶ are vectors; four sleeve glyphs; three dial strokes.
    expect(paths.size).toBe(4 + 4 + 3);
    const perspective = only(list.commands, 'concat').filter(
      (c) => c.matrix[6] !== 0 || c.matrix[7] !== 0,
    );
    expect(perspective.length).toBeGreaterThan(100);
    const fragmentClips = list.commands.filter(
      (c, i) =>
        c.op === 'clip' &&
        c.shape.k === 'polygon' &&
        list.commands[i - 1]?.op === 'concat',
    );
    expect(fragmentClips.length).toBeGreaterThan(0);
  });

  it('draws the Runtime still with faces, dial and stream dots but no billboards', () => {
    const frame = engineFrame(1);
    const list = buildDrawList(frame, {
      layout: RUNTIME,
      measure,
      layers: ['faces', 'dial', 'dots'],
    });
    expectBalanced(list);
    const texts = only(list.commands, 'text').map((c) => c.text);
    expect(texts).toEqual(
      expect.arrayContaining(['RULE 1 · FIRED', frame.dial.value, 'SIGN']),
    );
    expect(texts).not.toContain('MARKET DATA');
    expect(texts).not.toContain('Cross-down exit');
    const discs = only(list.commands, 'fill').filter(
      (c) => c.shape.k === 'ellipse' && c.shape.rect.w !== 9,
    );
    expect(frame.dots.length).toBeGreaterThan(0);
    expect(discs.length).toBeGreaterThanOrEqual(frame.dots.length);
  });

  it('keeps every app frame in front of the eye, so homographies need no near-plane clip', () => {
    const cases = [
      [FIRST_RUN, [0, 0.02, 0.045, 0.07, 0.09]],
      [RUNTIME, [1]],
    ] as const;
    let least = Infinity;
    for (const [layout, times] of cases) {
      for (const time of times) {
        for (const projected of projectFaces(engineFrame(time, 1.3), layout)) {
          for (const p of projected.polygon) {
            least = Math.min(least, p.w);
          }
        }
      }
    }
    expect(least).toBeGreaterThanOrEqual(0.58);
  });

  it('paints colour, gradient, stripe and grid fills in the face box', () => {
    const w = 10 * U,
      h = 5 * U;
    const paint = (fill: SceneFace['fill']) => {
      const [command] = body({ fill });
      return command?.op === 'fill' ? command.paint : command;
    };
    expect(paint(mix(token('ink'), 65.5, transparent, 0))).toEqual({
      k: 'color',
      color: { k: 'mix', a: role('ink'), pct: 66, b: { k: 'transparent' } },
    });
    expect(
      paint({ k: 'linear135', a: token('sleeve-btc'), b: token('ink') }),
    ).toMatchObject({
      k: 'linear',
      from: [(w - h) / 4, (h - w) / 4],
      to: [(3 * w + h) / 4, (3 * h + w) / 4],
      repeat: false,
    });
    expect(paint({ k: 'radialShadow' })).toMatchObject({
      k: 'radial',
      center: [w / 2, h / 2],
      radius: [w / 2, h / 2],
      stops: [
        { offset: 0, color: role('material-shadow') },
        { offset: 1, color: { k: 'transparent' } },
      ],
    });
    expect(
      paint({ k: 'stripes', step: 0.5, base: token('material-front') }),
    ).toMatchObject({
      k: 'blend',
      mode: 'srcOver',
      dst: { k: 'color', color: role('material-front') },
      src: {
        k: 'linear',
        to: [0, 0.5 * U],
        repeat: true,
        stops: [
          { offset: 0 },
          { offset: 1 / (0.5 * U) },
          { offset: 1 / (0.5 * U), color: { k: 'transparent' } },
          { offset: 1 },
        ],
      },
    });
    // Horizontal rules are the top CSS layer; sub-pixel periods stay solid.
    expect(paint({ k: 'grid', step: 0.1 })).toMatchObject({
      k: 'blend',
      dst: { to: [0.1 * U, 0], stops: [{}, { offset: 1 }, {}, {}] },
      src: { to: [0, 0.1 * U] },
    });
  });

  it('folds a lone mask into the fill shader and masks richer faces in a layer', () => {
    const [floor] = body({
      fill: { k: 'grid', step: 4 },
      mask: { k: 'floor' },
    });
    expect(floor).toMatchObject({
      op: 'fill',
      paint: {
        k: 'blend',
        mode: 'dstIn',
        dst: { k: 'blend' },
        src: { k: 'radial', stops: [{}, { offset: 0.35 }, {}] },
      },
    });
    const [strip] = body({ fill: token('sign'), mask: { k: 'signStrip' } });
    expect(strip).toMatchObject({
      paint: {
        src: {
          k: 'linear',
          to: [10 * U, 0],
          stops: [{}, { offset: 0.25 }, {}, {}],
        },
      },
    });
    const washed = body({
      fill: token('sign-wash'),
      mask: { k: 'signWash' },
      text: text('YOUR SIDE'),
    });
    expect(washed[0]).toMatchObject({ op: 'layer', alpha: 1 });
    expect(washed.at(-2)).toMatchObject({
      op: 'fill',
      blend: 'dstIn',
      paint: { k: 'radial', center: [5 * U, 0], radius: [5 * U, 5 * U] },
    });
    expect(washed.at(-1)).toEqual({ op: 'restore' });
  });

  it('clips triangles, hexagons and circles to the CSS clip-path shapes', () => {
    const w = 2.4 * U;
    const clipOf = (clip: SceneFace['clip']) =>
      body({ w: 2.4, h: 2.4, clip })[0];
    expect(clipOf({ k: 'triangle' })).toEqual({
      op: 'clip',
      shape: {
        k: 'polygon',
        points: [
          [0, 0],
          [w, 0],
          [w / 2, w],
        ],
      },
    });
    expect(clipOf({ k: 'hexagon' })).toMatchObject({
      shape: { k: 'polygon', points: { length: 6 } },
    });
    const circle = clipOf({ k: 'circle' });
    expect(circle).toMatchObject({ op: 'clip', shape: { k: 'ellipse' } });
    if (circle?.op === 'clip' && circle.shape.k === 'ellipse') {
      expect(circle.shape.rect.x).toBeCloseTo(0);
      expect(circle.shape.rect.w).toBeCloseTo(w);
    }
  });

  it('draws inset edges and the SIGN ring with its raised inner shade', () => {
    const edge = body({ shadow: { k: 'insetEdge' } });
    expect(edge[1]).toMatchObject({
      op: 'fill',
      paint: { color: role('material-edge') },
      shape: {
        k: 'difference',
        outer: { rect: { x: 0, y: 0 } },
        inner: { rect: { x: 1, y: 1, w: 10 * U - 2 } },
      },
    });
    const sign = body({
      w: 2.8,
      h: 2.8,
      radius: { k: 'percent', n: 50 },
      shadow: { k: 'signRing', spread: 2.55, pct: 18.2 },
    });
    const r = (2.8 * U) / 2;
    // Opaque: the halo, the key and the shade draw directly, in CSS paint order.
    expect(sign.map((c) => c.op === 'fill' && c.shape.k)).toEqual([
      'difference',
      'rect',
      'difference',
    ]);
    const key = body({
      w: 2.8,
      h: 2.8,
      op: 0.5,
      radius: { k: 'percent', n: 50 },
      shadow: { k: 'signRing', spread: 2.55, pct: 18.2 },
    });
    expect(key[0]).toMatchObject({
      op: 'layer',
      alpha: 0.5,
      bounds: { x: -2.5, y: -2.5, w: 2.8 * U + 5 },
    });
    expect(key[1]).toMatchObject({
      paint: {
        color: { k: 'mix', a: role('sign'), pct: 18 },
      },
      shape: {
        outer: { rect: { x: -2.5 }, radii: [[r + 2.5, r + 2.5], {}, {}, {}] },
        inner: { rect: { x: 0 }, radii: [[r, r], {}, {}, {}] },
      },
    });
    expect(key[3]).toMatchObject({
      paint: { color: { k: 'shade', alpha: 0.22 } },
      shape: { outer: { rect: { y: 0 } }, inner: { rect: { y: -3 } } },
    });
  });

  it('dashes square borders per mitred side like Chromium, rounded ones as one contour', () => {
    const square = body({
      fill: transparent,
      border: border(1.5, token('ink-3'), 'dashed'),
    });
    const strokes = only(square, 'stroke');
    // Measured in Chromium: a 56px side dashes 3px with ≈1.82px gaps, a 28px side 3/2.
    expect(strokes.map((s) => s.dash)).toEqual([
      [3, 20 / 11],
      [3, 2],
      [3, 20 / 11],
      [3, 2],
    ]);
    expect(only(square, 'clip')).toHaveLength(4);
    expect(only(square, 'save')).toHaveLength(4);
    // A zero-height line keeps both 1px borders; its 2px ends stay solid.
    const line = only(
      body({
        h: 0,
        fill: transparent,
        border: border(1, token('ink-3'), 'dashed'),
      }),
      'stroke',
    );
    expect(line.map((s) => s.dash?.[0] ?? null)).toEqual([3, null, 3, null]);
    expect(line[1]!.shape).toEqual({
      k: 'line',
      points: [
        [10 * U - 0.5, 0],
        [10 * U - 0.5, 2],
      ],
    });
    // Too short for a third dash: the gap widens instead.
    const tight = only(
      body({
        w: 1.5893,
        fill: transparent,
        border: border(1, token('ink-3'), 'dashed'),
      }),
      'stroke',
    );
    expect(tight[0]!.dash![1]).toBeCloseTo(2.90008);
    const rounded = body({
      fill: transparent,
      radius: corners(px(2)),
      border: border(1.5, token('ink-3'), 'dashed'),
    });
    expect(rounded).toHaveLength(1);
    expect(rounded[0]).toMatchObject({
      op: 'stroke',
      shape: {
        k: 'rect',
        rect: { x: 0.75 },
        radii: [[1.25, 1.25], {}, {}, {}],
      },
    });
    if (rounded[0]?.op === 'stroke') {
      expect(rounded[0].dash![0]).toBe(3);
      expect(rounded[0].dash![1]).toBeCloseTo(1.995, 3);
    }
    const dot = body({
      w: 0.18,
      h: 0.18,
      fill: transparent,
      radius: corners(px(0.4)),
      border: border(1, token('ink-3'), 'dashed'),
    });
    expect(dot).toMatchObject([{ op: 'stroke', dash: null }]);
    const wide = only(
      body({ fill: transparent, border: border(3, token('ink'), 'dashed') }),
      'stroke',
    );
    expect(wide[0]!.dash![0]).toBe(6);
  });

  it('rings solid borders and resolves radius shorthand with CSS overlap scaling', () => {
    const [solid] = body({
      fill: transparent,
      border: { width: world(0.3), style: 'solid', color: token('ink') },
      radius: corners(world(0.5), world(0.5), bare(0), bare(0)),
    });
    const r = 0.5 * U,
      b = 0.3 * U;
    expect(solid).toMatchObject({
      op: 'fill',
      paint: { color: role('ink') },
      shape: {
        outer: {
          radii: [
            [r, r],
            [r, r],
            [0, 0],
            [0, 0],
          ],
        },
        inner: {
          rect: { x: b, y: b },
          radii: [
            [r - b, r - b],
            [r - b, r - b],
            [0, 0],
            [0, 0],
          ],
        },
      },
    });
    const [huge] = body({ radius: corners(px(40)) });
    // 40px corners on a 28px-high box shrink to 14px.
    expect(huge).toMatchObject({ shape: { radii: [[14, 14], {}, {}, {}] } });
    const [three] = body({ radius: corners(px(1), px(2), px(3)) });
    expect(three).toMatchObject({
      shape: {
        radii: [
          [1, 1],
          [2, 2],
          [3, 3],
          [2, 2],
        ],
      },
    });
    const [none] = body({ radius: corners() });
    expect(none).toMatchObject({ shape: { radii: [[0, 0], {}, {}, {}] } });
  });

  it('sets face text in the padded content box in Martian Mono at 0.06em and 1.25 lines', () => {
    const paddings = [
      [[], { x: 0, y: 0, width: 10 * U }],
      [[world(0.5)], { x: 0.5 * U, y: 0.5 * U, width: 9 * U }],
      [[world(0.45), world(1.2)], { x: 1.2 * U, y: 0.45 * U, width: 7.6 * U }],
      [[world(1.02), px(0), px(0)], { x: 0, y: 1.02 * U, width: 10 * U }],
      [[px(1), px(2), px(3), px(4)], { x: 4, y: 1, width: 10 * U - 6 }],
    ] as const;
    for (const [padding, box] of paddings) {
      const [clip, run] = body({
        fill: transparent,
        text: text('STRATEGY\nRULES', { padding, weight: 600 }),
      }).slice(1);
      expect(clip).toMatchObject({ op: 'clip', shape: { k: 'rect' } });
      expect(run).toMatchObject({ op: 'text', origin: 'top', align: 'left' });
      if (run?.op === 'text') {
        expect(run.x).toBeCloseTo(box.x);
        expect(run.y).toBeCloseTo(box.y);
        expect(run.width).toBeCloseTo(box.width);
        expect(run.font).toEqual({
          weight: 600,
          size: 0.6 * U,
          letterSpacing: 0.06 * 0.6 * U,
          lineHeight: 1.25,
        });
      }
    }
    const [, , centred] = body({
      fill: transparent,
      text: text('SIGN', { align: 'center' }),
    });
    expect(centred).toMatchObject({ op: 'text', align: 'center' });
  });

  it('draws missing rule marks as vectors and asset glyphs as 24-unit SVG strokes', () => {
    const size = 0.95 * U;
    const mark = body({
      w: 1.1,
      h: 1.1,
      fill: transparent,
      text: text('↘', { size: 0.95 }),
    });
    expect(only(mark, 'text')).toEqual([]);
    expect(mark[3]).toMatchObject({ op: 'concat' });
    if (mark[3]?.op === 'concat') {
      expect(mark[3].matrix[0]).toBeCloseTo(size / 24);
      expect(mark[3].matrix[2]).toBe(0);
      expect(mark[3].matrix[5]).toBeCloseTo((0.25 * size) / 2);
    }
    expect(mark[4]).toMatchObject({
      op: 'path',
      style: 'stroke',
      cap: 'round',
    });
    const ratio = body({
      w: 1.1,
      h: 1.1,
      fill: transparent,
      text: text('∶', { size: 0.95, align: 'center' }),
    });
    expect(ratio[3]).toMatchObject({ op: 'concat' });
    if (ratio[3]?.op === 'concat') {
      expect(ratio[3].matrix[2]).toBeCloseTo((1.1 * U - size) / 2);
    }
    expect(ratio[4]).toMatchObject({ op: 'path', style: 'fill' });
    const glyph = body({
      w: 2.4,
      h: 2.4,
      fill: transparent,
      glyph: 'btc',
      text: text('', { color: token('ink') }),
    });
    expect(glyph[3]).toMatchObject({ op: 'concat' });
    if (glyph[3]?.op === 'concat') {
      expect(glyph[3].matrix[0]).toBeCloseTo((2.4 * U) / 24);
      expect(glyph[3].matrix[2]).toBeCloseTo(0);
    }
    expect(glyph[4]).toEqual({
      op: 'path',
      d: ASSET_GLYPH_PATHS.btc,
      style: 'stroke',
      width: 1.6,
      cap: 'round',
      color: role('ink'),
      alpha: 1,
    });
  });

  it('folds opacity into a single part and groups multi-part faces in a layer', () => {
    expect(body({ op: 0.4 })).toMatchObject([{ op: 'fill', alpha: 0.4 }]);
    const dim = body({ op: 0.45, text: text('2  CROSS-UP') });
    expect(dim[0]).toMatchObject({
      op: 'layer',
      alpha: 0.45,
      bounds: { x: 0, y: 0, w: 10 * U, h: 5 * U },
    });
    expect(only(dim, 'fill')[0]!.alpha).toBe(1);
    expect(only(dim, 'text')[0]!.alpha).toBe(1);
    expect(
      draw(scene({ faces: [face({ fill: transparent })] })).commands,
    ).toEqual([]);
  });

  it('anchors pins at the stem foot and tags at the lead end, farthest first', () => {
    const high = pin({ anchor: [6, 22.5, 20] });
    const low = pin({
      id: 'market-data',
      title: 'MARKET DATA',
      subtitle: '',
      anchor: [-6, -41, 1],
    });
    const list = draw(scene({ pins: [high, low], tags: [tag()] }), {
      layers: ['tags', 'pins'],
    });
    expectBalanced(list);
    const at = (anchor: readonly number[]) =>
      projectBillboard(BASE, anchor, FIRST_RUN);
    const expected = [
      { kind: 'tag', ...at(tag().anchor) },
      { kind: 'pin', ...at(high.anchor) },
      { kind: 'pin', ...at(low.anchor) },
    ].sort((a, b) => a.scale - b.scale);
    // Each billboard: save, concat, its box fill … its stem or lead fill, restore.
    const groups: DrawCommand[][] = [];
    for (const command of list.commands) {
      if (command.op === 'concat') {
        groups.push([]);
      }
      groups.at(-1)?.push(command);
    }
    expect(groups).toHaveLength(3);
    groups.forEach((group, i) => {
      const [placement] = group;
      const matrix = placement?.op === 'concat' ? placement.matrix : [];
      const fills = only(group, 'fill');
      const box = fills[0]!.shape,
        foot = fills.at(-1)!.shape;
      if (box.k !== 'rect' || foot.k !== 'rect') {
        throw new Error('billboard boxes are rectangles');
      }
      const target = expected[i]!;
      // A tag's lead ends at its anchor; a pin's stem foot is centred on it.
      const [ax, ay] =
        target.kind === 'tag'
          ? [foot.rect.x + foot.rect.w, box.rect.h / 2]
          : [foot.rect.x + 0.5, foot.rect.y + foot.rect.h];
      expect(target.kind === 'tag' ? foot.rect.w : foot.rect.h).toBeCloseTo(
        target.kind === 'tag' ? 18 : 1.7 * U,
      );
      expect(matrix[0]).toBeCloseTo(target.scale);
      expect(matrix[0]! * ax + matrix[2]!).toBeCloseTo(target.x);
      expect(matrix[4]! * ay + matrix[5]!).toBeCloseTo(target.y);
    });
  });

  it('styles pins by tone and shows asset marks, gate marks and ink subtitles', () => {
    const look = (tone: ScenePin['tone'], subtitle = 'you sign') => {
      const { commands } = draw(scene({ pins: [pin({ tone, subtitle })] }), {
        layers: ['pins'],
      });
      return {
        fill: only(commands, 'fill')[0],
        edge: commands[3],
        texts: only(commands, 'text'),
        commands,
      };
    };
    const plain = look('');
    expect(plain.fill).toMatchObject({ paint: { color: role('sheet') } });
    expect(plain.edge).toMatchObject({ paint: { color: role('rule-2') } });
    expect(plain.texts.map((t) => [t.text, t.color, t.font.weight])).toEqual([
      ['YOUR WALLET', role('ink'), 600],
      ['YOU SIGN', role('ink-3'), 400],
    ]);
    expect(plain.texts[0]!.font).toMatchObject({
      size: 10,
      letterSpacing: 0.6,
      lineHeight: 1.3,
    });
    expect(plain.texts[1]!.x - plain.texts[0]!.x).toBeCloseTo(
      measure('YOUR WALLET', plain.texts[0]!.font) + 6,
    );
    const ink = look('ink');
    expect(ink.fill).toMatchObject({ paint: { color: role('ink') } });
    expect(ink.texts[1]!.color).toEqual({
      k: 'mix',
      a: role('ground'),
      pct: 72,
      b: { k: 'transparent' },
    });
    expect(look('sign').edge).toMatchObject({ paint: { color: role('sign') } });
    const plan = look('plan', '');
    expect(plan.texts).toHaveLength(1);
    expect(only(plan.commands, 'stroke')[0]).toMatchObject({
      shape: { k: 'rect' },
      width: 1,
    });
    expect(plan.fill).toMatchObject({
      paint: { color: { k: 'mix', pct: 86 } },
    });
    const gate = look('', '✓');
    expect(gate.texts).toHaveLength(1);
    expect(only(gate.commands, 'path')).toMatchObject([{ style: 'stroke' }]);
    const asset = draw(
      scene({ pins: [pin({ asset: 'eth', subtitle: '3.88%' })] }),
      {
        layers: ['pins'],
        pinLabels: { 'your-wallet': 'ignored for asset pins' },
      },
    ).commands;
    expect(only(asset, 'path')[0]!.d).toBe(ASSET_GLYPH_PATHS.eth);
    expect(only(asset, 'text').map((t) => t.text)).toEqual(['3.88%']);
    expect(only(asset, 'concat')[1]!.matrix[0]).toBeCloseTo(18 / 24);
  });

  it('draws tag numbers bold, subtitles small at 80% and the ink tone inverted', () => {
    const tagged = (subtitle: string, tone: SceneTag['tone']) => {
      const { commands } = draw(scene({ tags: [tag({ subtitle, tone })] }), {
        layers: ['tags'],
      });
      return { commands, texts: only(commands, 'text') };
    };
    const fired = tagged('fired', 'ink');
    expect(fired.texts.map((t) => [t.text, t.font.weight, t.alpha])).toEqual([
      ['1', 700, 1],
      ['Cross-down exit', 400, 1],
      ['FIRED', 400, 0.8],
    ]);
    expect(fired.texts[2]!.font.size).toBeCloseTo(8.6);
    expect(fired.texts[2]!.color).toEqual(role('ground'));
    expect(only(fired.commands, 'fill')[0]).toMatchObject({
      paint: { color: role('ink') },
    });
    for (const tone of ['', 'sign', 'plan'] as const) {
      const quiet = tagged('', tone);
      expect(quiet.texts).toHaveLength(2);
      expect(only(quiet.commands, 'fill')[0]).toMatchObject({
        paint: { color: { k: 'mix', a: role('sheet'), pct: 90 } },
      });
      expect(quiet.commands[3]).toMatchObject({
        paint: { color: role('rule') },
      });
    }
  });

  it('draws only the requested layers, with dots centred and the dial in its panel', () => {
    const frame = scene({
      faces: [face()],
      pins: [pin()],
      tags: [tag()],
      dots: [dot()],
    });
    expect(draw(frame, { layers: [] }).commands).toEqual([]);
    const dial = draw(frame, { layers: ['dial'] }).commands;
    expect(only(dial, 'text').map((t) => [t.text, t.origin, t.align])).toEqual([
      [BASE.dial.value, 'baseline', 'center'],
      ['STABLES · TARGET', 'baseline', 'center'],
    ]);
    const needle = only(dial, 'concat')[2]!.matrix;
    const angle = (Math.round(BASE.dial.angle * 100) / 100) * (Math.PI / 180);
    expect(needle[0]).toBeCloseTo(Math.cos(angle));
    expect(needle[3]).toBeCloseTo(Math.sin(angle));
    const dots = draw(frame, { layers: ['dots'] }).commands;
    expect(dots).toMatchObject([
      { op: 'save' },
      { op: 'concat' },
      {
        op: 'fill',
        shape: { k: 'ellipse', rect: { x: 0, y: 0, w: 7, h: 7 } },
        paint: { color: role('ink') },
        alpha: 0.8,
      },
      { op: 'restore' },
    ]);
    const centre = projectBillboard(BASE, dot().anchor, FIRST_RUN);
    const m = only(dots, 'concat')[0]!.matrix;
    const X =
      (m[0]! * 3.5 + m[1]! * 3.5 + m[2]!) / (m[6]! * 3.5 + m[7]! * 3.5 + m[8]!);
    expect(X).toBeCloseTo(centre.x);
    const everything = buildDrawList(frame, { layout: FIRST_RUN, measure });
    expect(only(everything.commands, 'text').map((t) => t.text)).toEqual(
      expect.arrayContaining([
        'YOUR WALLET',
        'Cross-down exit',
        'STABLES · TARGET',
      ]),
    );
  });

  it('groups translucent billboards and falls back to the frame camera origins', () => {
    const faded = draw(scene({ pins: [pin({ op: 0.5 })] }), {
      layers: ['pins'],
    });
    expect(faded.commands[2]).toMatchObject({
      op: 'layer',
      alpha: 0.5,
      bounds: { x: 0, y: 0 },
    });
    expect(faded.commands.at(-2)).toEqual({ op: 'restore' });
    const frame = scene({ faces: [face()], dots: [dot()] });
    const { width, height, unit } = FIRST_RUN;
    expect(
      buildDrawList(frame, { layout: { width, height, unit }, measure }),
    ).toEqual(
      buildDrawList(frame, {
        layout: {
          width,
          height,
          unit,
          origin: frame.origin,
          perspectiveOrigin: frame.perspectiveOrigin,
        },
        measure,
      }),
    );
  });

  it('rejects scene variants it cannot draw', () => {
    const bad = (overrides: Partial<SceneFace>) => () =>
      draw(scene({ faces: [face(overrides)] }));
    const bogus = { k: 'bogus' } as never;
    for (const overrides of [
      { fill: bogus },
      { fill: mix(bogus, 10, transparent) },
      { mask: bogus },
      { clip: bogus },
      { shadow: bogus },
      { radius: bogus },
      { border: { width: px(1), style: 'bogus' as never, color: transparent } },
      { text: text('x', { padding: [bogus] }) },
    ] satisfies Partial<SceneFace>[]) {
      expect(bad(overrides)).toThrow('Unknown draw variant');
    }
    expect(() =>
      draw(scene({ pins: [pin({ tone: 'bogus' as never })] }), {
        layers: ['pins'],
      }),
    ).toThrow('Unknown draw variant');
    expect(() =>
      draw(scene({ tags: [tag({ tone: 'bogus' as never })] }), {
        layers: ['tags'],
      }),
    ).toThrow('Unknown draw variant');
  });
});
