import { BackoffCalculator } from '@/common/utils/backoff.util';

const MAX_RETRY_DELAY_MS = 3_600_000;
const JITTER_PERCENTAGE = 0.1;

describe('BackoffCalculator.calculateDelay', () => {
  it('attempt 1 returns approximately baseDelay with no exponential growth', () => {
    const base = 1000;
    const result = BackoffCalculator.calculateDelay(1, base);
    // 2^(1-1) = 1, so exponential = base * 1 = 1000
    // with up to 10% jitter: [1000, 1100]
    expect(result).toBeGreaterThanOrEqual(base);
    expect(result).toBeLessThanOrEqual(base * (1 + JITTER_PERCENTAGE));
  });

  it('attempt 2 returns approximately 2*baseDelay', () => {
    const base = 1000;
    const expected = base * 2; // 2^(2-1) = 2
    const result = BackoffCalculator.calculateDelay(2, base);
    expect(result).toBeGreaterThanOrEqual(expected);
    expect(result).toBeLessThanOrEqual(expected * (1 + JITTER_PERCENTAGE));
  });

  it('attempt 3 returns approximately 4*baseDelay', () => {
    const base = 1000;
    const expected = base * 4; // 2^(3-1) = 4
    const result = BackoffCalculator.calculateDelay(3, base);
    expect(result).toBeGreaterThanOrEqual(expected);
    expect(result).toBeLessThanOrEqual(expected * (1 + JITTER_PERCENTAGE));
  });

  it('clamps to MAX_RETRY_DELAY_MS for very large attempt numbers', () => {
    const result = BackoffCalculator.calculateDelay(100, 60_000);
    expect(result).toBe(MAX_RETRY_DELAY_MS);
  });

  it('result is always at or above the exponential delay (jitter is additive)', () => {
    for (let attempt = 1; attempt <= 5; attempt++) {
      const base = 500;
      const exponential = base * Math.pow(2, attempt - 1);
      const result = BackoffCalculator.calculateDelay(attempt, base);
      expect(result).toBeGreaterThanOrEqual(
        Math.min(exponential, MAX_RETRY_DELAY_MS),
      );
    }
  });
});
