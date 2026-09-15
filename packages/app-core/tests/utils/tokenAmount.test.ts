import { describe, expect, it } from 'vitest';

import {
  formatCompactTokenAmount,
  formatTokenBaseUnits,
} from '@core/utils/formatting/tokenAmount';

describe('token amount formatting', () => {
  it('formats positive, negative, zero-decimal, and padded base units exactly', () => {
    expect(formatTokenBaseUnits('1234500', 6)).toBe('1.2345');
    expect(formatTokenBaseUnits(-1234500n, 6)).toBe('-1.2345');
    expect(formatTokenBaseUnits('42', 0)).toBe('42');
    expect(formatTokenBaseUnits('1', 6)).toBe('0.000001');
    expect(formatTokenBaseUnits('1000000', 6)).toBe('1');
  });

  it('returns exact integer values when no fraction remains', () => {
    expect(formatCompactTokenAmount('1000000', 6)).toBe('1');
    expect(formatCompactTokenAmount('-2000000', 6)).toBe('-2');
  });

  it('keeps six significant fractional digits after leading zeros by default', () => {
    expect(formatCompactTokenAmount('123456789', 12)).toBe('0.000123456');
    expect(formatCompactTokenAmount('-123456789', 12)).toBe('-0.000123456');
  });

  it('caps decimal-place precision at six when requested', () => {
    expect(
      formatCompactTokenAmount('123456789', 8, {
        fractionPrecision: 'decimal-places',
      }),
    ).toBe('1.234567');
    expect(
      formatCompactTokenAmount('100000001', 8, {
        fractionPrecision: 'decimal-places',
      }),
    ).toBe('1');
  });

  it('uses six places for nonzero integer portions even in significant mode', () => {
    expect(formatCompactTokenAmount('123456789', 6)).toBe('123.456789');
    expect(formatCompactTokenAmount('1234567899', 7)).toBe('123.456789');
  });

  it('handles all-zero fractional portions and trims trailing visible zeros', () => {
    expect(formatCompactTokenAmount('0', 18)).toBe('0');
    expect(formatCompactTokenAmount('1200000', 6)).toBe('1.2');
    expect(formatCompactTokenAmount('120000', 6)).toBe('0.12');
  });
});
