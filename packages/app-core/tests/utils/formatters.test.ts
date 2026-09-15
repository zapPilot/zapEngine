import {
  formatAddress,
  formatCompactTokenAmount,
  formatters,
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

  it('exercises the unified formatter facade', () => {
    expect(formatters.currency(1234.56)).toBe('$1,235');
    expect(formatters.percent(12.345)).toBe('12.3%');
    expect(formatters.percent(12.345, 2)).toBe('12.35%');
    expect(formatters.number(1234)).toBe('1,234');
    expect(formatters.currencyPrecise(1.5)).toContain('$');
    expect(formatters.chartDate('2026-09-15')).toBeTruthy();
    expect(formatters.dataFreshness(new Date().toISOString())).toBeTruthy();
    expect(formatters.relativeTime(new Date().toISOString())).toBeTruthy();
  });
});
