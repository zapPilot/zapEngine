import { clamp, clampMin, numberFrom } from '@core/utils';
import { describe, expect, it } from 'vitest';

describe('math utilities', () => {
  it('clamps values to min/max bounds', () => {
    expect(clamp(15, 0, 10)).toBe(10);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clampMin(-5, 0)).toBe(0);
    expect(clampMin(5, 0)).toBe(5);
  });

  describe('numberFrom', () => {
    it('parses finite numbers and numeric strings', () => {
      expect(numberFrom(12.5)).toBe(12.5);
      expect(numberFrom(' 12.5 ')).toBe(12.5);
    });

    it('rejects empty, missing, and non-finite values', () => {
      expect(numberFrom('   ')).toBeNull();
      expect(numberFrom(undefined)).toBeNull();
      expect(numberFrom(Number.POSITIVE_INFINITY)).toBeNull();
      expect(numberFrom('Infinity')).toBeNull();
    });
  });
});
