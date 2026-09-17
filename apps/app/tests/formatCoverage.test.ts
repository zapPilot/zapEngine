import { describe, expect, it } from 'vitest';

import { formatSignedPct, formatTokenBalance, formatUsd6 } from '@/lib/format';

describe('format branch coverage', () => {
  it('formats positive, negative, and zero signed percentages', () => {
    expect(formatSignedPct(1.25, 2)).toBe('+1.25%');
    expect(formatSignedPct(-1.25, 2)).toBe('−1.25%');
    expect(formatSignedPct(0, 2)).toBe('0.00%');
  });

  it('formats every token balance state and safely handles invalid balances', () => {
    expect(formatTokenBalance('12.3', 'USDC', 'loading')).toBe('Loading…');
    expect(formatTokenBalance('12.3', 'USDC', 'unavailable')).toBe(
      'Unavailable',
    );
    expect(formatTokenBalance(null, 'USDC', 'loaded')).toBe('0 USDC');
    expect(formatTokenBalance('not-a-number', 'ETH', 'loaded')).toBe('0 ETH');
    expect(formatTokenBalance('1.1234567', 'ETH', 'loaded')).toBe(
      '1.123457 ETH',
    );
  });

  it('rounds USD6 values without losing bigint precision or their sign', () => {
    expect(formatUsd6(1_234_567n)).toBe('$1.23');
    expect(formatUsd6('1235000')).toBe('$1.24');
    expect(formatUsd6(-1_235_000n)).toBe('-$1.24');
  });
});
