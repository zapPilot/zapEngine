import { describe, expect, it } from 'vitest';

import { getAnalyticsStaleTime } from '@/lib/analytics/cacheConfig';

describe('getAnalyticsStaleTime', () => {
  it('returns 0 when period changed', () => {
    expect(getAnalyticsStaleTime(true)).toBe(0);
    expect(getAnalyticsStaleTime(true, '0x123')).toBe(0);
  });

  it('returns 2 minutes for wallet-specific views', () => {
    expect(getAnalyticsStaleTime(false, '0x123')).toBe(2 * 60 * 1000);
  });

  it('returns 12 hours for bundle views (null wallet filter)', () => {
    expect(getAnalyticsStaleTime(false, null)).toBe(12 * 60 * 60 * 1000);
    expect(getAnalyticsStaleTime(false)).toBe(12 * 60 * 60 * 1000);
    expect(getAnalyticsStaleTime(false, undefined)).toBe(12 * 60 * 60 * 1000);
  });
});
