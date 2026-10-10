import { expect, it } from 'vitest';
import {
  colorCss,
  fillCss,
  lengthCss,
  borderCss,
  radiusCss,
  shadowCss,
  maskCss,
  clipCss,
  transformCss,
  serializeEngineCss,
} from './css.js';
import { engineFrame, createEngineModel, ASSET_GLYPH_PATHS } from './index.js';
import {
  token,
  transparent,
  mix,
  world,
  px,
  bare,
  corners,
  border,
  rotation,
  translate,
} from './scene.js';
it('serializes dimensioned lengths, closed materials and negative-zero angles faithfully', () => {
  expect(lengthCss(world(-0.00001))).toBe('calc(-0.0000 * var(--zp-u))');
  expect(lengthCss(px(3))).toBe('3px');
  expect(lengthCss(bare(0))).toBe('0');
  expect(colorCss(mix(token('ink'), 65, transparent))).toBe(
    'color-mix(in srgb, var(--ink) 65%, transparent)',
  );
  expect(colorCss(mix(token('ink'), 65.5, transparent, 0))).toContain('66%');
  expect(
    fillCss({ k: 'linear135', a: token('ink'), b: token('sign') }),
  ).toContain('linear-gradient(135deg');
  expect(fillCss({ k: 'radialShadow' })).toContain('closest-side');
  expect(fillCss({ k: 'stripes', step: 1.2, base: token('ink') })).toContain(
    'calc(1.2 * var(--zp-u))',
  );
  expect(fillCss({ k: 'grid', step: 4 })).toContain(
    'calc(4.0000 * var(--zp-u))',
  );
  expect(borderCss(border(1, token('ink')))).toBe('1px solid var(--ink)');
  expect(radiusCss(corners(px(2), world(0.5), bare(0)))).toBe(
    '2px calc(0.5000 * var(--zp-u)) 0',
  );
  expect(radiusCss({ k: 'percent', n: 50 })).toBe('50%');
  expect(shadowCss({ k: 'none' })).toBe('none');
  expect(shadowCss({ k: 'insetEdge' })).toContain('inset');
  expect(shadowCss({ k: 'signRing', spread: 2.55, pct: 18.2 })).toContain(
    '2.5px',
  );
  for (const k of ['none', 'floor', 'signWash', 'signStrip'] as const) {
    expect(maskCss({ k })).toBeTypeOf('string');
  }
  for (const k of ['none', 'triangle', 'hexagon', 'circle'] as const) {
    expect(clipCss({ k })).toBeTypeOf('string');
  }
  expect(
    transformCss([
      ...translate(1, 2, 3),
      rotation('RX', -0.00001, 2),
      rotation('RY', 45),
      rotation('RZ', 90),
      { k: 'S', value: 0.85, digits: 4 },
      { k: 'anchor', x: -50, y: -100 },
    ]),
  ).toContain(
    'rotateX(-0.00deg) rotateY(45deg) rotateZ(90deg) scale(0.8500) translate(-50%,-100%)',
  );
  expect(serializeEngineCss(engineFrame(0.09)).faces.length).toBeGreaterThan(
    40,
  );
  const model = createEngineModel({
    dmaDistance: { SPY: 0, BTC: 0, ETH: 0 },
    held: [0, 0, 0, 100, 0],
    target: [0, 0, 0, 100],
  });
  expect(model(1).dial.value).toBe('100.00%');
  expect(Object.keys(ASSET_GLYPH_PATHS)).toHaveLength(4);
});
it('rejects unsupported runtime material and transform variants', () => {
  for (const serialize of [
    colorCss,
    fillCss,
    lengthCss,
    radiusCss,
    shadowCss,
    maskCss,
    clipCss,
  ]) {
    expect(() => serialize({ k: 'unsupported' } as never)).toThrow(
      'Unknown scene variant',
    );
  }
  expect(() => transformCss([{ k: 'unsupported' } as never])).toThrow(
    'Unknown scene variant',
  );
});
