import { isFiniteNumber, percentChange } from '../../../../src/common/utils';

describe('isFiniteNumber', () => {
  it('returns true for finite numbers', () => {
    expect(isFiniteNumber(0)).toBe(true);
    expect(isFiniteNumber(-1.5)).toBe(true);
    expect(isFiniteNumber(1e10)).toBe(true);
  });

  it('returns false for NaN and ±Infinity', () => {
    expect(isFiniteNumber(Number.NaN)).toBe(false);
    expect(isFiniteNumber(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isFiniteNumber(Number.NEGATIVE_INFINITY)).toBe(false);
  });

  it('returns false for non-number types', () => {
    expect(isFiniteNumber('5')).toBe(false);
    expect(isFiniteNumber(null)).toBe(false);
    expect(isFiniteNumber(undefined)).toBe(false);
    expect(isFiniteNumber({})).toBe(false);
  });
});

describe('percentChange', () => {
  it('computes ((latest - baseline) / baseline) * 100', () => {
    expect(percentChange(110, 100)).toBe(10);
    expect(percentChange(95, 100)).toBe(-5);
    expect(percentChange(100, 100)).toBe(0);
  });

  it('returns null for non-positive baseline (no divide by zero, no inverted sign)', () => {
    expect(percentChange(100, 0)).toBeNull();
    expect(percentChange(100, -50)).toBeNull();
  });

  it('returns null when either input is not a finite number', () => {
    expect(percentChange(Number.NaN, 100)).toBeNull();
    expect(percentChange(100, Number.NaN)).toBeNull();
    expect(percentChange(undefined, 100)).toBeNull();
    expect(percentChange(100, undefined)).toBeNull();
    expect(percentChange('100', 100)).toBeNull();
  });

  // Parity tests: both analytics-client (ROI window) and weekly-report processor
  // (balance history) used to inline the formula independently. They MUST now
  // produce byte-identical results when given the same inputs.
  it('parity: ROI window inputs produce identical numbers to processor inputs', () => {
    // analytics-client used (total_net_usd, start_balance) pairs
    const roi = percentChange(5500, 5000);
    // weekly-report processor used (latest.usdValue, baseline.usdValue) pairs
    const history = percentChange(5500, 5000);
    expect(roi).toBe(history);
    expect(roi).toBe(10);
  });
});
