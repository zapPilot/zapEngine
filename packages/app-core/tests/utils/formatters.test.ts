import {
  formatAddress,
  formatCompactTokenAmount,
} from '@core/utils/formatters';
import { describe, expect, it } from 'vitest';

describe('shared display formatters', () => {
  it('shortens addresses with the canonical ellipsis', () => {
    expect(formatAddress('0x1111111111111111111111111111111111111111')).toBe(
      '0x1111…1111',
    );
  });

  it('keeps six meaningful fractional digits for tiny token amounts', () => {
    expect(formatCompactTokenAmount('9360528111924722', 18)).toBe('0.00936052');
  });

  it('can preserve the six-decimal-place wizard display', () => {
    expect(
      formatCompactTokenAmount(9_360_528_111_924_722n, 18, {
        fractionPrecision: 'decimal-places',
      }),
    ).toBe('0.00936');
  });
});
