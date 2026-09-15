import { describe, expect, it } from 'vitest';

import { getBundleUser } from '@core/services/bundleService';

describe('bundleService', () => {
  it('builds bundle user metadata with the canonical formatted address', () => {
    expect(getBundleUser('0x1111111111111111111111111111111111111111')).toEqual(
      {
        userId: '0x1111111111111111111111111111111111111111',
        displayName: '0x1111…1111',
      },
    );
  });
});
