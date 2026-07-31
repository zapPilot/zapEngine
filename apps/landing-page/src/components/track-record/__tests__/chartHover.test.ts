import { describe, expect, it } from 'vitest';
import {
  indexFromPointer,
  nextIndexForKey,
  tooltipLeftStyle,
} from '../chartHover';

const box = { left: 0, width: 720 };

describe('indexFromPointer', () => {
  it('maps the box edges to the first and last index', () => {
    expect(indexFromPointer(0, box, 100)).toBe(0);
    expect(indexFromPointer(720, box, 100)).toBe(99);
  });

  it('snaps to the nearest index at the midpoint', () => {
    expect(indexFromPointer(360, box, 101)).toBe(50);
  });

  it('clamps a pointer outside the box', () => {
    expect(indexFromPointer(-200, box, 100)).toBe(0);
    expect(indexFromPointer(9_000, box, 100)).toBe(99);
  });

  it('is scale-invariant: the same fraction gives the same index', () => {
    // The chart renders roughly 0.4x-1.5x depending on the column it sits in.
    // Reading the surface box rather than converting viewBox units is what
    // makes this hold, so a marker never drifts off the pointer on mobile.
    const desktop = { left: 0, width: 1056 };
    const phone = { left: 137, width: 291 };

    for (const fraction of [0, 0.17, 0.5, 0.83, 1]) {
      expect(
        indexFromPointer(desktop.left + desktop.width * fraction, desktop, 500),
      ).toBe(indexFromPointer(phone.left + phone.width * fraction, phone, 500));
    }
  });

  it('reports -1 when the box has no layout', () => {
    // jsdom has no layout engine, so an unstubbed getBoundingClientRect
    // returns zeros. Failing loudly beats asserting on garbage.
    expect(indexFromPointer(100, { left: 0, width: 0 }, 100)).toBe(-1);
    expect(indexFromPointer(100, box, 0)).toBe(-1);
  });

  it('collapses a single-point series onto index 0', () => {
    expect(indexFromPointer(500, box, 1)).toBe(0);
  });
});

describe('nextIndexForKey', () => {
  const key = (name: string, shiftKey = false) => ({ key: name, shiftKey });

  it('steps one day and clamps at both ends', () => {
    expect(nextIndexForKey(key('ArrowRight'), 3, 10, [])).toBe(4);
    expect(nextIndexForKey(key('ArrowLeft'), 3, 10, [])).toBe(2);
    expect(nextIndexForKey(key('ArrowRight'), 9, 10, [])).toBe(9);
    expect(nextIndexForKey(key('ArrowLeft'), 0, 10, [])).toBe(0);
  });

  it('pages by ten and jumps to the ends', () => {
    expect(nextIndexForKey(key('PageDown'), 3, 100, [])).toBe(13);
    expect(nextIndexForKey(key('PageUp'), 3, 100, [])).toBe(0);
    expect(nextIndexForKey(key('Home'), 40, 100, [])).toBe(0);
    expect(nextIndexForKey(key('End'), 40, 100, [])).toBe(99);
  });

  it('jumps between events with shift and stops at the last one', () => {
    const events = [1, 20, 44];
    expect(nextIndexForKey(key('ArrowRight', true), 3, 100, events)).toBe(20);
    expect(nextIndexForKey(key('ArrowLeft', true), 30, 100, events)).toBe(20);
    expect(nextIndexForKey(key('ArrowRight', true), 44, 100, events)).toBe(44);
    expect(nextIndexForKey(key('ArrowLeft', true), 1, 100, events)).toBe(1);
  });

  it('degrades to a plain step when there are no events to jump to', () => {
    expect(nextIndexForKey(key('ArrowRight', true), 3, 100, [])).toBe(4);
  });

  it('returns null for keys it does not own', () => {
    expect(nextIndexForKey(key('a'), 3, 100, [])).toBeNull();
    expect(nextIndexForKey(key('Enter'), 3, 100, [])).toBeNull();
    expect(nextIndexForKey(key('ArrowRight'), 0, 0, [])).toBeNull();
  });
});

describe('tooltipLeftStyle', () => {
  it('clamps in CSS so the tooltip never escapes the card', () => {
    expect(tooltipLeftStyle('7.7778%')).toBe(
      'clamp(112px, 7.7778%, calc(100% - 112px))',
    );
  });
});
