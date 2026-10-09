import { beforeEach, describe, expect, it } from 'vitest';
import { tokens } from '@zapengine/design-tokens/tokens';
import type {
  DrawColor,
  DrawCommand,
  DrawFont,
  DrawRole,
} from '@zapengine/zap-pilot-story/model';
import {
  parseTokenColor,
  skiaColor,
} from '@/components/runtime-model/skia/colors';
import {
  SKIA_MONO_FAMILIES,
  createSkiaRecorder,
} from '@/components/runtime-model/skia/recorder';
import {
  FAKE_FONTS,
  FakeParagraph,
  fakeSkia,
  skiaTestRuntime,
  type FakePaint,
  type FakePath,
  type FakePicture,
  type FakeShader,
  type SkiaCall,
} from './support/skiaStub';

const night = tokens.mode.night;
const role = (id: DrawRole): DrawColor => ({ k: 'token', id });
const recorder = () =>
  createSkiaRecorder(fakeSkia as never, FAKE_FONTS as never);
function record(...commands: DrawCommand[]): SkiaCall[] {
  const picture = recorder().record({
    width: 390,
    height: 350,
    commands,
  }) as unknown as FakePicture;
  return [...picture.calls];
}
const paintOf = (call: SkiaCall | undefined) =>
  (call?.args[1] as FakePaint).settings;
const hex = (value: string) =>
  [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);
const square = {
  k: 'rect',
  rect: { x: 1, y: 2, w: 3, h: 4 },
  radii: [
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
  ],
} as const;
const FONT: DrawFont = {
  weight: 500,
  size: 3.36,
  letterSpacing: 0.2,
  lineHeight: 1.25,
};

beforeEach(() => skiaTestRuntime.reset());

describe('runtime model colours', () => {
  it('parses the token formats into premultiplied sRGB', () => {
    expect(parseTokenColor(night.ground)).toEqual([...hex(night.ground), 1]);
    const [r, g, b, a] = parseTokenColor('rgba(238,238,234,.34)');
    expect(a).toBe(0.34);
    expect(r).toBeCloseTo((238 / 255) * 0.34);
    expect(g).toBeCloseTo((238 / 255) * 0.34);
    expect(b).toBeCloseTo((234 / 255) * 0.34);
    expect(parseTokenColor('rgba(255, 122, 102, 0.14)')[3]).toBe(0.14);
    expect(parseTokenColor('rgb(1, 2, 3)')[3]).toBe(1);
    expect(() => parseTokenColor('hsl(0 0% 0%)')).toThrow(
      'Unsupported token colour',
    );
  });

  it('resolves every drawing role from the night palette', () => {
    const roles: Record<string, string> = {
      ink: night.ink,
      sheet: night.sheet,
      rule: night.rule,
      'sign-wash': night['sign-wash'],
      'material-top': tokens.material.night.top,
      'material-ink-left': tokens.material.night['ink-left'],
      'sleeve-stable': tokens.sleeve.night.stable,
      'sleeve-btc': tokens.sleeve.night.btc,
    };
    for (const [id, css] of Object.entries(roles)) {
      const [r, g, b, a] = parseTokenColor(css);
      const color = skiaColor(role(id as DrawRole));
      expect(color[3]).toBeCloseTo(a);
      expect(color[0]).toBeCloseTo(r / a);
      expect(color[1]).toBeCloseTo(g / a);
      expect(color[2]).toBeCloseTo(b / a);
    }
  });

  it('precomputes color-mix and opacity in premultiplied space', () => {
    // Mixing with transparent keeps the hue and scales alpha, as CSS does.
    const halo = skiaColor({
      k: 'mix',
      a: role('sign'),
      pct: 18,
      b: { k: 'transparent' },
    });
    expect(Array.from(halo.slice(0, 3))).toEqual(
      hex(night.sign).map((v) => Math.fround(v)),
    );
    expect(halo[3]).toBeCloseTo(0.18);
    const half = skiaColor({
      k: 'mix',
      a: role('ink'),
      pct: 50,
      b: role('ground'),
    });
    expect(half[0]).toBeCloseTo(
      (hex(night.ink)[0]! + hex(night.ground)[0]!) / 2,
    );
    expect(half[3]).toBe(1);
    const rule = skiaColor(
      { k: 'mix', a: role('rule-2'), pct: 50, b: { k: 'transparent' } },
      0.5,
    );
    expect(rule[0]).toBeCloseTo(238 / 255);
    expect(rule[3]).toBeCloseTo(0.34 * 0.5 * 0.5);
    expect(Array.from(skiaColor({ k: 'shade', alpha: 0.22 }))).toEqual([
      0,
      0,
      0,
      Math.fround(0.22),
    ]);
    expect(Array.from(skiaColor({ k: 'transparent' }))).toEqual([0, 0, 0, 0]);
    expect(() => skiaColor({ k: 'bogus' } as never)).toThrow(
      'Unknown draw colour',
    );
  });
});

describe('runtime model Skia recorder', () => {
  it('replays the canvas state commands', () => {
    const calls = record(
      { op: 'save' },
      { op: 'concat', matrix: [1, 0.1, 40, -0.1, 1, 80, 0.001, 0.0005, 1] },
      { op: 'layer', alpha: 0.45, bounds: { x: -2, y: -2, w: 20, h: 10 } },
      { op: 'clip', shape: square },
      { op: 'restore' },
      { op: 'restore' },
    );
    expect(calls.map((c) => c.method)).toEqual([
      'save',
      'concat',
      'saveLayer',
      'clipPath',
      'restore',
      'restore',
    ]);
    expect(calls[1]!.args[0]).toEqual([
      1, 0.1, 40, -0.1, 1, 80, 0.001, 0.0005, 1,
    ]);
    expect((calls[2]!.args[0] as FakePaint).settings.alpha).toBe(0.45);
    expect(calls[2]!.args[1]).toEqual({ x: -2, y: -2, width: 20, height: 10 });
    expect(calls[3]!.args).toEqual([
      { path: 'rect', args: [{ x: 1, y: 2, width: 3, height: 4 }] },
      1,
      true,
    ]);
  });

  it('builds rounded, polygonal, open, oval and subtracted paths', () => {
    const shapes = record(
      {
        op: 'clip',
        shape: {
          ...square,
          radii: [
            [2, 2],
            [2, 2],
            [0, 0],
          ],
        },
      },
      {
        op: 'clip',
        shape: {
          k: 'polygon',
          points: [
            [0, 0],
            [1, 0],
            [0, 1],
          ],
        },
      },
      {
        op: 'clip',
        shape: {
          k: 'line',
          points: [
            [0, 0],
            [5, 0],
          ],
        },
      },
      { op: 'clip', shape: { k: 'ellipse', rect: { x: 0, y: 0, w: 7, h: 7 } } },
      { op: 'clip', shape: { k: 'difference', outer: square, inner: square } },
      {
        op: 'clip',
        shape: {
          k: 'difference',
          outer: square,
          inner: { k: 'polygon', points: [] },
        },
      },
    ).map((call) => call.args[0] as FakePath);
    expect(shapes[0]).toEqual({
      path: 'rrect',
      args: [
        {
          rect: { x: 1, y: 2, width: 3, height: 4 },
          topLeft: { x: 2, y: 2 },
          topRight: { x: 2, y: 2 },
          bottomRight: { x: 0, y: 0 },
          bottomLeft: { x: 0, y: 0 },
        },
      ],
    });
    expect(shapes[1]).toMatchObject({
      path: 'polygon',
      args: [{ length: 3 }, true],
    });
    expect(shapes[2]).toMatchObject({
      path: 'polygon',
      args: [{ length: 2 }, false],
    });
    expect(shapes[3]).toMatchObject({ path: 'oval' });
    expect(shapes[4]).toMatchObject({ path: 'op', args: [{}, {}, 0] });
    // A failed path op draws nothing rather than the whole outer shape.
    expect(shapes[5]).toEqual({ path: 'empty', args: [] });
  });

  it('fills with token colours at opacity and DstIn masks', () => {
    const calls = record(
      {
        op: 'fill',
        shape: square,
        paint: { k: 'color', color: role('ink') },
        alpha: 0.5,
        blend: 'srcOver',
      },
      {
        op: 'fill',
        shape: square,
        paint: { k: 'color', color: { k: 'shade', alpha: 1 } },
        alpha: 1,
        blend: 'dstIn',
      },
    );
    const ink = paintOf(calls[0]);
    expect(ink).toMatchObject({ antiAlias: true, style: 0 });
    expect(Array.from(ink.color as Float32Array)).toEqual(
      [...hex(night.ink), 0.5].map((v) => Math.fround(v)),
    );
    expect(ink.blendMode).toBeUndefined();
    expect(paintOf(calls[1]).blendMode).toBe(6);
  });

  it('maps gradients to premultiplied Skia shaders and caches them', () => {
    const rec = recorder();
    const linear = {
      k: 'linear',
      from: [0, 0],
      to: [0, 4],
      stops: [
        { offset: 0, color: role('material-edge') },
        { offset: 0.25, color: role('material-edge') },
        { offset: 0.25, color: { k: 'transparent' } },
        { offset: 1, color: { k: 'transparent' } },
      ],
      repeat: true,
    } as const;
    const fill = (paint: object, alpha = 1): DrawCommand =>
      ({
        op: 'fill',
        shape: square,
        paint,
        alpha,
        blend: 'srcOver',
      }) as DrawCommand;
    const picture = rec.record({
      width: 1,
      height: 1,
      commands: [
        fill(linear, 0.7),
        fill({ ...linear, repeat: false }),
        fill({
          k: 'radial',
          center: [5, 6],
          radius: [5, 2],
          stops: [
            { offset: 0, color: role('material-shadow') },
            { offset: 1, color: { k: 'transparent' } },
          ],
        }),
        fill({
          k: 'blend',
          mode: 'dstIn',
          dst: { k: 'color', color: role('sign') },
          src: { ...linear, repeat: false },
        }),
        fill({
          k: 'blend',
          mode: 'srcOver',
          dst: { k: 'color', color: role('sign') },
          src: linear,
        }),
        fill(linear),
      ],
    }) as unknown as FakePicture;
    const shaders = picture.calls.map(
      (call) => (call.args[1] as FakePaint).settings.shader as FakeShader,
    );
    expect(shaders[0]).toMatchObject({
      shader: 'linear',
      args: [
        { x: 0, y: 0 },
        { x: 0, y: 4 },
        { length: 4 },
        [0, 0.25, 0.25, 1],
        1,
        undefined,
        1,
      ],
    });
    expect(paintOf(picture.calls[0]).alpha).toBe(0.7);
    expect(shaders[1]!.args[4]).toBe(0);
    expect(shaders[2]).toMatchObject({
      shader: 'radial',
      args: [
        { x: 0, y: 0 },
        1,
        { length: 2 },
        [0, 1],
        0,
        { matrix: [5, 0, 5, 0, 2, 6, 0, 0, 1] },
        1,
      ],
    });
    expect(shaders[3]).toMatchObject({
      shader: 'blend',
      args: [6, { shader: 'color' }, { shader: 'linear' }],
    });
    expect(shaders[4]!.args[0]).toBe(3);
    // The repeated paint reuses its cached shader.
    expect(shaders[5]).toBe(shaders[0]);
  });

  it('strokes borders butt-ended with Chromium dash intervals', () => {
    const calls = record(
      {
        op: 'stroke',
        shape: {
          k: 'line',
          points: [
            [0, 0],
            [56, 0],
          ],
        },
        width: 1.5,
        dash: [3, 1.8],
        color: role('ink-3'),
        alpha: 0.75,
      },
      {
        op: 'stroke',
        shape: square,
        width: 1,
        dash: null,
        color: role('ink-3'),
        alpha: 1,
      },
    );
    expect(paintOf(calls[0])).toMatchObject({
      style: 1,
      strokeWidth: 1.5,
      strokeCap: 0,
      strokeJoin: 0,
      pathEffect: { intervals: [3, 1.8], phase: 0 },
    });
    expect((paintOf(calls[0]).color as Float32Array)[3]).toBeCloseTo(0.75);
    expect(paintOf(calls[1]).pathEffect).toBeUndefined();
  });

  it('parses SVG glyph and mark paths once and draws them stroked or filled', () => {
    const glyph: DrawCommand = {
      op: 'path',
      d: 'M12 3v18',
      style: 'stroke',
      width: 1.6,
      cap: 'round',
      color: role('ink'),
      alpha: 1,
    };
    const calls = record(
      glyph,
      glyph,
      { ...glyph, style: 'fill', d: 'M10 8a1 1 0 1 0 2 0' },
      { ...glyph, cap: 'butt', d: 'not a path' },
    );
    expect(skiaTestRuntime.svgPaths).toBe(3);
    expect(calls[0]!.args[0]).toBe(calls[1]!.args[0]);
    expect(paintOf(calls[0])).toMatchObject({
      style: 1,
      strokeCap: 1,
      strokeJoin: 1,
    });
    expect(paintOf(calls[2])).toMatchObject({ antiAlias: true });
    expect(paintOf(calls[2]).style).toBeUndefined();
    expect(calls[3]!.args[0]).toEqual({ path: 'empty', args: [] });
    expect(paintOf(calls[3])).toMatchObject({ strokeCap: 0, strokeJoin: 0 });
  });

  it('sets text as cached Martian Mono paragraphs, top- or baseline-aligned', () => {
    const run = (overrides: Partial<Extract<DrawCommand, { op: 'text' }>>) =>
      ({
        op: 'text',
        text: 'STRATEGY',
        x: 4,
        y: 5,
        width: 47,
        align: 'left',
        origin: 'top',
        font: FONT,
        color: role('ink-2'),
        alpha: 1,
        ...overrides,
      }) as DrawCommand;
    const calls = record(
      run({}),
      run({}),
      run({ font: { ...FONT, weight: 400 }, align: 'center' }),
      run({ font: { ...FONT, weight: 600 }, origin: 'baseline', y: 72 }),
      run({
        font: { ...FONT, weight: 700 },
        text: 'no-lines',
        origin: 'baseline',
      }),
      run({ alpha: 0.5 }),
    );
    expect(skiaTestRuntime.paragraphs).toBe(5);
    const paragraphs = calls.map((call) => call.args[0] as FakeParagraph);
    expect(paragraphs[0]).toBe(paragraphs[1]);
    expect(paragraphs[0]!.style).toMatchObject({
      fontFamilies: [tokens.font.native['mono-medium'].family],
      fontSize: 3.36,
      fontStyle: { weight: 500 },
      letterSpacing: 0.2,
      heightMultiplier: 1.25,
      halfLeading: true,
    });
    expect(paragraphs[0]!.paragraphStyle).toEqual({ textAlign: 0 });
    expect(paragraphs[0]!.fonts).toBe(FAKE_FONTS);
    expect(paragraphs[0]!.width).toBe(47);
    expect(calls[0]!.args.slice(1)).toEqual([4, 5]);
    expect(paragraphs[2]!.style.fontFamilies).toEqual([
      tokens.font.native.mono.family,
    ]);
    expect(paragraphs[2]!.paragraphStyle).toEqual({ textAlign: 2 });
    expect(paragraphs[3]!.style.fontFamilies).toEqual([
      tokens.font.native['mono-semibold'].family,
    ]);
    // SVG text sits on its baseline; the fake paragraph's baseline is 8px down.
    expect(calls[3]!.args.slice(1)).toEqual([4, 64]);
    expect(paragraphs[4]!.style.fontFamilies).toEqual([
      tokens.font.native['mono-semibold'].family,
    ]);
    expect(calls[4]!.args.slice(1)).toEqual([4, 5]);
    expect((paragraphs[5]!.style.color as Float32Array)[3]).toBeCloseTo(0.5);
  });

  it('measures unwrapped lines and bounds its caches', () => {
    const rec = recorder();
    expect(rec.measure('YOUR WALLET', FONT)).toBe(66);
    expect(rec.measure('YOUR WALLET', FONT)).toBe(66);
    expect(skiaTestRuntime.paragraphs).toBe(1);
    for (let i = 0; i < 512; i++) rec.measure(`label ${i}`, FONT);
    expect(skiaTestRuntime.paragraphs).toBe(513);
    // The cache cleared when it filled, so the first label lays out again.
    rec.measure('YOUR WALLET', FONT);
    expect(skiaTestRuntime.paragraphs).toBe(514);
    const picture = rec.record({
      width: 390,
      height: 300,
      commands: [],
    }) as unknown as FakePicture;
    expect(picture.bounds).toEqual({ x: 0, y: 0, width: 390, height: 300 });
    expect(() => record({ op: 'bogus' } as never)).toThrow(
      'Unknown draw command',
    );
    expect(() =>
      record({
        op: 'fill',
        shape: { k: 'bogus' } as never,
        paint: { k: 'color', color: role('ink') },
        alpha: 1,
        blend: 'srcOver',
      }),
    ).toThrow('Unknown draw command');
    expect(() =>
      record({
        op: 'fill',
        shape: square,
        paint: { k: 'bogus' } as never,
        alpha: 1,
        blend: 'srcOver',
      }),
    ).toThrow('Unknown draw command');
  });

  it('registers exactly the three static Martian Mono instances', () => {
    expect(SKIA_MONO_FAMILIES).toEqual([
      tokens.font.native.mono.family,
      tokens.font.native['mono-medium'].family,
      tokens.font.native['mono-semibold'].family,
    ]);
  });
});
