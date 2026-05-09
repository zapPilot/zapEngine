import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildBundlePageUrl,
  buildUserBundleParams,
  computeIsDifferentUser,
  computeRedirectUrl,
  computeShowEmailBanner,
  computeShowQuickSwitch,
  EMPTY_CONNECTED_WALLETS,
  findWalletByAddress,
  noopSwitchActiveWallet,
  performWalletSwitchAndRefresh,
  shouldAttemptAutoSwitch,
  shouldRedirectDisconnectedOwner,
} from '@/hooks/bundle/useBundlePageUtils';
import { logger } from '@/utils';

vi.mock('@/utils', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('useBundlePageUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes immutable empty wallet and noop switch defaults', async () => {
    expect(EMPTY_CONNECTED_WALLETS).toEqual([]);
    await expect(noopSwitchActiveWallet()).resolves.toBeUndefined();
  });

  it('determines when wallet auto-switch should be attempted', () => {
    expect(shouldAttemptAutoSwitch('0xabc', true, 'user-1', 'user-1')).toBe(
      true,
    );
    expect(shouldAttemptAutoSwitch(undefined, true, 'user-1', 'user-1')).toBe(
      false,
    );
    expect(shouldAttemptAutoSwitch('0xabc', false, 'user-1', 'user-1')).toBe(
      false,
    );
    expect(shouldAttemptAutoSwitch('0xabc', true, 'user-1', 'user-2')).toBe(
      false,
    );
  });

  it('finds connected wallets case-insensitively', () => {
    expect(
      findWalletByAddress([{ address: '0xABC', isActive: false }], '0xabc'),
    ).toEqual({ address: '0xABC', isActive: false });
    expect(
      findWalletByAddress([{ address: '0xDEF' }], '0xabc'),
    ).toBeUndefined();
  });

  it('switches wallets and invalidates portfolio and wallet queries', async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockResolvedValue(undefined);
    const switchActiveWallet = vi.fn().mockResolvedValue(undefined);

    await performWalletSwitchAndRefresh(
      '0xabc',
      switchActiveWallet,
      queryClient,
    );

    expect(switchActiveWallet).toHaveBeenCalledWith('0xabc');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['portfolio'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['wallets'] });
    expect(logger.info).toHaveBeenCalledWith(
      'Cache invalidated after wallet switch',
    );
  });

  it('logs wallet switch failures without throwing', async () => {
    const queryClient = new QueryClient();
    const error = new Error('switch failed');
    const switchActiveWallet = vi.fn().mockRejectedValue(error);

    await expect(
      performWalletSwitchAndRefresh('0xabc', switchActiveWallet, queryClient),
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to auto-switch wallet:',
      error,
    );
  });

  it('builds bundle page URLs from search params', () => {
    expect(buildBundlePageUrl(new URLSearchParams())).toBe('/bundle');
    expect(
      buildBundlePageUrl(new URLSearchParams('userId=user-1&tab=invest')),
    ).toBe('/bundle?userId=user-1&tab=invest');
  });

  it('computes user-viewing flags', () => {
    expect(computeIsDifferentUser(true, 'user-1', 'user-2')).toBe(true);
    expect(computeIsDifferentUser(false, 'user-1', 'user-2')).toBe(false);
    expect(computeShowQuickSwitch(true, false, 'user-1')).toBe(true);
    expect(computeShowQuickSwitch(true, true, 'user-1')).toBe(false);
    expect(computeShowEmailBanner(true, true, undefined, false)).toBe(true);
    expect(computeShowEmailBanner(true, true, 'owner@example.com', false)).toBe(
      false,
    );
  });

  it('computes redirect URLs from existing search strings', () => {
    expect(computeRedirectUrl('')).toBe('/');
    expect(computeRedirectUrl('?tab=invest')).toBe('/?tab=invest');
    expect(computeRedirectUrl('tab=invest')).toBe('/?tab=invest');
  });

  it('detects disconnected owners that should redirect', () => {
    expect(shouldRedirectDisconnectedOwner(false, 'user-1', 'user-1')).toBe(
      true,
    );
    expect(shouldRedirectDisconnectedOwner(true, 'user-1', 'user-1')).toBe(
      false,
    );
    expect(shouldRedirectDisconnectedOwner(false, 'user-1', 'user-2')).toBe(
      false,
    );
  });

  it('adds and clears user bundle params', () => {
    const paramsWithJob = buildUserBundleParams('tab=invest', {
      userId: 'user-1',
      etlJobId: 'job-1',
    });
    expect(paramsWithJob.toString()).toBe(
      'tab=invest&userId=user-1&etlJobId=job-1',
    );

    const paramsWithoutJob = buildUserBundleParams(
      'tab=invest&etlJobId=stale',
      {
        userId: 'user-1',
        etlJobId: null,
      },
    );
    expect(paramsWithoutJob.toString()).toBe('tab=invest&userId=user-1');

    const unchangedParams = buildUserBundleParams('tab=invest', {});
    expect(unchangedParams.toString()).toBe('tab=invest');
  });
});
