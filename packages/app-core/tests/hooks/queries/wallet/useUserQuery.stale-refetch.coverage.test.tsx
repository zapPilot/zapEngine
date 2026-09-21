import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

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

import { useCurrentUser } from '@core/hooks/queries/wallet/useUserQuery';
import { resetAccountBootstrapForTests } from '@core/lib/state/accountBootstrap';

const USER_ID = '5fc63d4e-4e07-47d8-840b-ccd3420d553f';

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetAccountBootstrapForTests();
  mocks.activeAddress.value = null;
  mocks.connectWallet.mockResolvedValue({
    user_id: USER_ID,
    is_new_user: false,
  });
  mocks.getUserByWallet.mockResolvedValue({ user_id: USER_ID });
  mocks.getUserProfile.mockResolvedValue({
    user: {
      id: USER_ID,
      email: 'user@example.com',
      is_subscribed_to_reports: true,
      created_at: '2026-01-01T00:00:00.000Z',
    },
    wallets: [],
  });
});

afterEach(() => {
  resetAccountBootstrapForTests();
});

it('returns safely when a pre-bootstrap refetch callback outlives its wallet session', async () => {
  mocks.activeAddress.value = '0xaaa';
  const { result, rerender } = renderHook(() => useCurrentUser(), {
    wrapper: createWrapper(),
  });

  // Capture the callback while bootstrapReady is still false. This callback
  // will call ensureSessionAccount() even if invoked after a later disconnect.
  const staleRefetch = result.current.refetch;
  await waitFor(() => expect(result.current.isSuccess).toBe(true));

  mocks.activeAddress.value = null;
  rerender();
  // isConnected reflects the provider immediately, but the session-ref cleanup
  // happens in an effect. A changed refetch callback proves that cleanup render
  // completed before we exercise the stale callback.
  await waitFor(() => expect(result.current.refetch).not.toBe(staleRefetch));
  expect(result.current.isConnected).toBe(false);

  let staleResult: unknown = Symbol('pending');
  await act(async () => {
    staleResult = await staleRefetch();
  });

  expect(staleResult).toBeUndefined();
  expect(result.current.isConnected).toBe(false);
});
