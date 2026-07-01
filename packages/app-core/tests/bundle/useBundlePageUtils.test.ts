import { describe, expect, it } from 'vitest';

import {
  buildBundlePageUrl,
  buildUserBundleParams,
  computeIsDifferentUser,
  computeRedirectUrl,
  computeShowEmailBanner,
  computeShowQuickSwitch,
  findWalletByAddress,
  shouldAttemptAutoSwitch,
  shouldRedirectDisconnectedOwner,
} from '../../src/hooks/bundle/useBundlePageUtils';

describe('bundle page utilities', () => {
  it('computes owner and visitor prompts from connection state', () => {
    expect(computeIsDifferentUser(true, 'user-a', 'user-b')).toBe(true);
    expect(computeIsDifferentUser(true, 'user-a', 'user-a')).toBe(false);
    expect(computeShowQuickSwitch(true, false, 'user-a')).toBe(true);
    expect(computeShowQuickSwitch(true, true, 'user-a')).toBe(false);
    expect(computeShowEmailBanner(true, true, undefined, false)).toBe(true);
    expect(computeShowEmailBanner(true, true, 'hi@example.com', false)).toBe(
      false,
    );
  });

  it('builds bundle URLs while preserving and replacing user params', () => {
    const params = buildUserBundleParams('?foo=1&etlJobId=old', {
      userId: 'user-a',
      etlJobId: 'etl-1',
    });

    expect(buildBundlePageUrl(params)).toBe(
      '/bundle?foo=1&etlJobId=etl-1&userId=user-a',
    );

    const withoutEtl = buildUserBundleParams('?etlJobId=old', {
      userId: 'user-b',
      etlJobId: null,
    });

    expect(buildBundlePageUrl(withoutEtl)).toBe('/bundle?userId=user-b');
  });

  it('normalizes redirect URLs for disconnected owners', () => {
    expect(shouldRedirectDisconnectedOwner(false, 'user-a', 'user-a')).toBe(
      true,
    );
    expect(computeRedirectUrl('userId=user-a')).toBe('/?userId=user-a');
    expect(computeRedirectUrl('?userId=user-a')).toBe('/?userId=user-a');
    expect(computeRedirectUrl('')).toBe('/');
  });

  it('finds wallet ids case-insensitively for auto switching', () => {
    const wallets = [{ address: '0xABC', isActive: false }];

    expect(shouldAttemptAutoSwitch('0xabc', true, 'user-a', 'user-a')).toBe(
      true,
    );
    expect(findWalletByAddress(wallets, '0xabc')).toEqual(wallets[0]);
  });
});
