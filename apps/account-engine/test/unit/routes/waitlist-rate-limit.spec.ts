import { RateLimitException } from '../../../src/common/http';
import { createWaitlistRateLimiter } from '../../../src/routes/waitlist-rate-limit';

describe('createWaitlistRateLimiter', () => {
  // Each test names the previously-uncovered branch it locks.
  // mutation: not run (offline sandbox — vitest could not be executed here).

  it('locks the fixed-window limit, the increment path, and the expiry reset', () => {
    // Locks: `!current || current.resetAt <= now` second-operand true;
    // `current.count >= limit` true and false (the `count += 1` increment).
    vi.useFakeTimers();
    try {
      const limiter = createWaitlistRateLimiter({ limit: 2, windowMs: 1_000 });
      limiter.consume('ip');
      limiter.consume('ip');
      expect(() => limiter.consume('ip')).toThrow(RateLimitException);
      vi.advanceTimersByTime(1_001);
      limiter.consume('ip');
    } finally {
      vi.useRealTimers();
    }
  });

  it('locks the capacity sweep evicting only expired buckets', () => {
    // Locks: `buckets.size < maxBuckets` false; sweep `bucket.resetAt <= now`
    // true (evicted) and false (kept).
    vi.useFakeTimers();
    try {
      const limiter = createWaitlistRateLimiter({
        limit: 1,
        windowMs: 1_000,
        maxBuckets: 2,
      });
      limiter.consume('stale');
      vi.advanceTimersByTime(1_500);
      limiter.consume('keeper');

      // The sweep ran when 'keeper' was inserted (size hit 2): 'stale' was
      // expired and evicted, 'keeper' survived and still owns its window.
      expect(() => limiter.consume('keeper')).toThrow(RateLimitException);
      limiter.consume('stale');
    } finally {
      vi.useRealTimers();
    }
  });
});
