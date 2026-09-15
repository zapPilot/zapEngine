import { describe, expect, it } from 'vitest';

import {
  amountInputToUsd6,
  amountUsdFromInput,
  normalizeAmountInput,
  quickAmountUsdInput,
  singleChainFromAmount,
  usd6ToAmountInput,
} from '@/integration/investAmountModel';
import { BASE_DEPOSIT_TOKENS } from '@/integration/depositTokens';
import { formatTokenBalance } from '@/lib/format';

describe('Invest amount helpers', () => {
  it('preserves exact bigint capacities and floors chip shares', () => {
    expect(usd6ToAmountInput(1234567890123456789n)).toBe(
      '1,234,567,890,123.456789',
    );
    expect(quickAmountUsdInput(1234567891n, 5000)).toBe('617.283945');
    expect(quickAmountUsdInput(null, 10000)).toBe('');
    expect(usd6ToAmountInput(0n)).toBe('');
  });
  it('parses grouped USD input and rejects an empty amount', () => {
    expect(amountUsdFromInput('1,000')).toBe(1000);
    expect(amountUsdFromInput('0')).toBeNull();
  });

  it('normalizes direct keyboard amount input while preserving decimals', () => {
    expect(normalizeAmountInput('$1000111')).toBe('1,000,111');
    expect(normalizeAmountInput('001234.50')).toBe('1,234.50');
    expect(normalizeAmountInput('12.3.4')).toBe('12.34');
    expect(normalizeAmountInput('1.123456789')).toBe('1.123456');
    expect(normalizeAmountInput('')).toBe('');
  });

  it('converts USD input to exact 6-decimal base units', () => {
    expect(amountInputToUsd6('1,234.5678919')).toBe('1234567891');
    expect(amountInputToUsd6('0.000001')).toBe('1');
  });

  it('formats invalid token balances as zero instead of NaN', () => {
    expect(formatTokenBalance('not-a-number', 'USDC', 'loaded')).toBe('0 USDC');
    expect(formatTokenBalance('1.23456789', 'ETH', 'loaded')).toBe(
      '1.234568 ETH',
    );
  });

  it('freezes Base USDC directly and Base ETH with conservative integer math', () => {
    expect(
      singleChainFromAmount({
        totalUsd6: '10000000',
        token: BASE_DEPOSIT_TOKENS[0],
        usdPrice: null,
      }),
    ).toBe('10000000');
    expect(
      singleChainFromAmount({
        totalUsd6: '10000000',
        token: BASE_DEPOSIT_TOKENS[1],
        usdPrice: 2_000,
      }),
    ).toBe('5000000000000000');

    const roundedDownWei = singleChainFromAmount({
      totalUsd6: '10000000',
      token: BASE_DEPOSIT_TOKENS[1],
      usdPrice: 2_000.0000001,
    });
    expect(roundedDownWei).not.toBeNull();
    expect(BigInt(roundedDownWei!)).toBeLessThan(5_000_000_000_000_000n);
    expect(
      singleChainFromAmount({
        totalUsd6: '10000000',
        token: BASE_DEPOSIT_TOKENS[1],
        usdPrice: null,
      }),
    ).toBeNull();
  });
});
