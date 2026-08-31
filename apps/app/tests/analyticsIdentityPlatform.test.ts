import { describe, expect, it } from 'vitest';

import { AnalyticsIdentitySync } from '@/integration/analyticsIdentity';

describe('AnalyticsIdentitySync native boundary', () => {
  it('stays provider-free when the shared root layout renders on native', () => {
    expect(AnalyticsIdentitySync()).toBeNull();
  });
});
