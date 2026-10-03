import { readFileSync } from 'node:fs';
import path from 'node:path';

import { tokens } from '@zapengine/design-tokens/tokens';
import { describe, expect, it } from 'vitest';

import { parseCubicBezier } from './easing';
import { assetColor, color, easeOut } from './tokens';

const repo = path.resolve(import.meta.dirname, '../../../..');
const read = (relative: string) => readFileSync(path.join(repo, relative));

describe('parseCubicBezier', () => {
  it('reads the four control points', () => {
    expect(parseCubicBezier(' cubic-bezier(0.2, 0.65, 0.3, 0.99) ')).toEqual([
      0.2, 0.65, 0.3, 0.99,
    ]);
  });

  it('rejects anything else', () => {
    for (const value of [
      'ease-out',
      'cubic-bezier(1, 2, 3)',
      'cubic-bezier(a, 1, 2, 3)',
      'cubic-bezier(,,,)',
    ]) {
      expect(() => parseCubicBezier(value)).toThrow(
        `Not a cubic-bezier() token: "${value}"`,
      );
    }
  });
});

describe('brand tokens', () => {
  it('come from @zapengine/design-tokens', () => {
    expect(color.bg).toBe(tokens.color.bg);
    expect(color.accent).toBe('#d4c5a3');
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
  });
});

// The video copies these from the product. If the product changes them,
// re-copy (or update) so the video keeps showing what the page shows.
describe('assets copied from other workspaces', () => {
  it('uses the calculator chart palette from landing.css', () => {
    const css = read('apps/landing-page/src/app/landing.css').toString();
    for (const [asset, hex] of Object.entries(assetColor)) {
      expect(css).toContain(`--event-${asset.toLowerCase()}: ${hex};`);
    }
  });

  it('ships the landing logo byte for byte', () => {
    expect(
      read('apps/video/public/brand/zap-pilot-logo.svg').equals(
        read('apps/landing-page/public/zap-pilot-logo.svg'),
      ),
    ).toBe(true);
  });

  it('ships the podcast music bed byte for byte', () => {
    expect(
      read('apps/video/public/music/bgm-03.mp3').equals(
        read('apps/podcast-pipeline/assets/video/music/bgm-03.mp3'),
      ),
    ).toBe(true);
  });
});
