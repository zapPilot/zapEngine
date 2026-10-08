import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import paths from './asset-glyphs.json' with { type: 'json' };
import { engineScene } from './engine.js';
it('keeps the embedded story marks identical to the platform-neutral registry', () => {
  const registry = JSON.parse(
    readFileSync(
      new URL('../../../brand-assets/src/asset-glyphs.json', import.meta.url),
      'utf8',
    ),
  );
  expect(paths).toEqual(registry);
});
it('renders four recognizable asset marks with solid sleeve materials and finite zero-weight geometry', () => {
  for (const time of [0, 0.2, 0.48, 1]) {
    const scene = engineScene(time);
    expect(
      new Set(scene.faces.flatMap((face) => (face.glyph ? [face.glyph] : []))),
    ).toEqual(new Set(['btc', 'eth', 'spy', 'stable']));
    expect(scene.faces.some((face) => face.clip.includes('polygon'))).toBe(
      true,
    );
    expect(
      scene.faces.some((face) => face.bg.includes('--sleeve-stable')),
    ).toBe(true);
    expect(scene.faces.every((face) => Number.isFinite(Number(face.op)))).toBe(
      true,
    );
  }
});
