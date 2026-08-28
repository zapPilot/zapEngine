import { numberFrom } from '@core/utils';
import { describe, expect, it } from 'vitest';

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
