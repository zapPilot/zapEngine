// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connectWallet: vi.fn(),
  getUserByWallet: vi.fn(),
  getUserProfile: vi.fn(),
  activeAddress: { value: null as string | null },
}));

vi.mock('@core/services/accountService', () => ({
  connectWallet: mocks.connectWallet,
  getUserByWallet: mocks.getUserByWallet,
  getUserProfile: mocks.getUserProfile,
}));

vi.mock('@core/providers/walletContext', () => ({
  useWalletProvider: () => ({
    account: mocks.activeAddress.value
      ? { address: mocks.activeAddress.value, isConnected: true }
      : null,
  }),
}));

import {
  useCurrentUser,
  useUserById,
} from '@core/hooks/queries/wallet/useUserQuery';

const USER_ID = '5fc63d4e-4e07-47d8-840b-ccd3420d553f';

function createWrapper(
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  }),
) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

function mockProfile(isSubscribedToReports: boolean) {
  mocks.getUserProfile.mockResolvedValue({
    user: {
      id: USER_ID,
      email: 'user@example.com',
      is_subscribed_to_reports: isSubscribedToReports,
      created_at: '2026-01-01T00:00:00.000Z',
    },
    wallets: [],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.activeAddress.value = null;
  mocks.getUserByWallet.mockResolvedValue({ user_id: USER_ID });
});

describe('useCurrentUser session identity', () => {
  it('keeps the original account while the active ownership signer changes', async () => {
    mocks.activeAddress.value = '0xaaa';
    mocks.connectWallet.mockResolvedValue({
      user_id: USER_ID,
      is_new_user: false,
    });
    mockProfile(true);

    const { result, rerender } = renderHook(() => useCurrentUser(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    mocks.activeAddress.value = '0xbbb';
    rerender();

    expect(result.current.userInfo?.userId).toBe(USER_ID);
    expect(result.current.connectedWallet).toBe('0xbbb');
    expect(mocks.connectWallet).toHaveBeenCalledTimes(1);
    expect(mocks.connectWallet).toHaveBeenCalledWith('0xaaa');
    expect(mocks.getUserByWallet).toHaveBeenCalledWith('0xaaa');
  });

  it('does not bootstrap the account again after the query cache is cleared', async () => {
    mocks.activeAddress.value = '0xaaa';
    mocks.connectWallet.mockResolvedValue({
      user_id: USER_ID,
      is_new_user: false,
    });
    mockProfile(true);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });

    const { result, rerender } = renderHook(() => useCurrentUser(), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    client.clear();
    rerender();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mocks.connectWallet).toHaveBeenCalledTimes(1);
    expect(mocks.getUserByWallet.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe('useUserById report subscription state', () => {
  it('maps a subscribed profile to UserInfo', async () => {
    mockProfile(true);
    const { result } = renderHook(() => useUserById(USER_ID), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.isSubscribedToReports).toBe(true);
  });

  it('keeps an email while mapping an unsubscribed profile as unsubscribed', async () => {
    mockProfile(false);
    const { result } = renderHook(() => useUserById(USER_ID), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(
      expect.objectContaining({
        email: 'user@example.com',
        isSubscribedToReports: false,
      }),
    );
  });
});
