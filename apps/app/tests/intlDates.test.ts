import { describe, expect, it } from 'vitest';

import { cachedDateFormatter } from '@/lib/intlDates';

describe('cachedDateFormatter', () => {
  it('returns the same formatter instance for the same locale and options', () => {
    const options: Intl.DateTimeFormatOptions = {
      month: 'short',
      day: 'numeric',
    };

    expect(cachedDateFormatter('en-US', options)).toBe(
      cachedDateFormatter('en-US', { month: 'short', day: 'numeric' }),
    );
  });

  it('keeps a separate formatter per options set for the same locale', () => {
    // Local noon sidesteps UTC/local-time conversion at day boundaries.
    const sample = new Date(2026, 0, 5, 12);
    const short = cachedDateFormatter('en-US', {
      month: 'short',
      day: 'numeric',
    });
    const long = cachedDateFormatter('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

    expect(short).not.toBe(long);
    expect(short.format(sample)).toBe('Jan 5');
    expect(long.format(sample)).toBe('January 5, 2026');
  });
});
