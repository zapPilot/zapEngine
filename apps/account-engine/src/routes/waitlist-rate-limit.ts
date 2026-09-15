import { RateLimitException } from '../common/http';

interface RateBucket {
  count: number;
  resetAt: number;
}

interface WaitlistRateLimiterOptions {
  limit?: number;
  windowMs?: number;
  maxBuckets?: number;
}

/**
 * Fixed-window rate limiter for waitlist signups. State lives behind a factory
 * so the sweep-on-capacity policy is exercisable with a handful of buckets
 * instead of a thousand-request test.
 */
export function createWaitlistRateLimiter(
  options: WaitlistRateLimiterOptions = {},
): { consume(ip: string): void } {
  const limit = options.limit ?? 10;
  const windowMs = options.windowMs ?? 10 * 60 * 1000;
  const maxBuckets = options.maxBuckets ?? 1_000;
  const buckets = new Map<string, RateBucket>();

  const sweep = (now: number): void => {
    if (buckets.size < maxBuckets) return;
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  };

  return {
    consume(ip: string): void {
      const now = Date.now();
      const current = buckets.get(ip);
      if (!current || current.resetAt <= now) {
        buckets.set(ip, { count: 1, resetAt: now + windowMs });
        sweep(now);
        return;
      }
      if (current.count >= limit) {
        throw new RateLimitException('Too many waitlist submissions');
      }
      current.count += 1;
    },
  };
}
