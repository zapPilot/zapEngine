import { formatUsd6, parseUsdcInput } from '@core/lib/wallet/usd6';
import { describe, expect, it } from 'vitest';

describe('formatUsd6', () => {
  it('formats base units with two decimals by default', () => {
    expect(formatUsd6(49_500_000n)).toBe('49.50');
    expect(formatUsd6(0n)).toBe('0.00');
    expect(formatUsd6(1n)).toBe('0.00');
  });

  it('supports custom fraction digits and whole-number formatting', () => {
    expect(formatUsd6(1_234_567n, 6)).toBe('1.234567');
    expect(formatUsd6(1_234_567n, 0)).toBe('1');
  });

  it('formats negative values', () => {
    expect(formatUsd6(-49_500_000n)).toBe('-49.50');
  });
});

describe('parseUsdcInput', () => {
  it('parses whole and fractional inputs to base units', () => {
    expect(parseUsdcInput('100')).toBe('100000000');
    expect(parseUsdcInput('99.5')).toBe('99500000');
    expect(parseUsdcInput(' 0.000001 ')).toBe('1');
  });

  it('rejects malformed input', () => {
    expect(() => parseUsdcInput('')).toThrow('Invalid USDC amount');
    expect(() => parseUsdcInput('1.2345678')).toThrow('Invalid USDC amount');
    expect(() => parseUsdcInput('abc')).toThrow('Invalid USDC amount');
    expect(() => parseUsdcInput('-5')).toThrow('Invalid USDC amount');
  });
});
