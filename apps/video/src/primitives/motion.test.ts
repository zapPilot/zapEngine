import { describe, expect, it } from 'vitest';

import { frame, safe } from './layout';
import { enter, glide, rise } from './motion';

describe('rise and glide', () => {
  it('run from 0 to 1 over the window and clamp outside it', () => {
    for (const curve of [rise, glide]) {
      expect(curve(0, 10, 20)).toBe(0);
      expect(curve(30, 10, 20)).toBe(1);
      expect(curve(40, 10, 20)).toBe(1);
      expect(curve(20, 10, 20)).toBeGreaterThan(0);
    }
  });

  it('rise defaults to an 18-frame entrance', () => {
    expect(rise(18, 0)).toBe(1);
  });
});

describe('enter', () => {
  it('starts transparent and lowered, and lands in place', () => {
    expect(enter(0, 0)).toEqual({ opacity: 0, translate: '0px 28.00px' });
    expect(enter(18, 0)).toEqual({ opacity: 1, translate: '0px 0.00px' });
  });

  it('adds a blur only when asked', () => {
    expect(enter(0, 0, { blur: 8, distance: 10, duration: 4 })).toEqual({
      opacity: 0,
      translate: '0px 10.00px',
      filter: 'blur(8.00px)',
    });
  });
});

describe('layout', () => {
  it('keeps the margins inside a 1080p frame', () => {
    expect(safe.left + safe.right).toBeLessThan(frame.width / 4);
    expect(safe.top).toBeLessThan(frame.height / 8);
  });
});
