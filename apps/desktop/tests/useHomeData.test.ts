import { describe, expect, it } from 'vitest';

import { resolveHomeAnalyticsSubjectId } from '../src/integration/useHomeData';

describe('Home data analytics subject resolution', () => {
  it('prefers account-engine user id and falls back to connected wallet address', () => {
    expect(
      resolveHomeAnalyticsSubjectId(
        'user-123',
        '0x1234567890123456789012345678901234567890',
      ),
    ).toBe('user-123');
    expect(
      resolveHomeAnalyticsSubjectId(
        null,
        '0x1234567890123456789012345678901234567890',
      ),
    ).toBe('0x1234567890123456789012345678901234567890');
    expect(resolveHomeAnalyticsSubjectId(null, null)).toBeNull();
  });
});
