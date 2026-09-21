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
});

afterEach(() => {
  resetAccountBootstrapForTests();
});

it('ignores a stale refetch callback after the wallet disconnects', async () => {
  mocks.activeAddress.value = '0xaaa';
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

  const { result, rerender } = renderHook(() => useCurrentUser(), {
    wrapper: createWrapper(),
  });

  // Capture the pre-bootstrap callback. Its closure still wants to ensure the
  // session account, even after the current hook instance becomes ready.
  const staleRefetch = result.current.refetch;
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  const bootstrapCalls = mocks.connectWallet.mock.calls.length;
  const queryCalls = mocks.getUserByWallet.mock.calls.length;

  mocks.activeAddress.value = null;
  rerender();
  await waitFor(() => expect(result.current.isConnected).toBe(false));

  await act(async () => {
    await staleRefetch();
  });

  expect(mocks.connectWallet).toHaveBeenCalledTimes(bootstrapCalls);
  expect(mocks.getUserByWallet).toHaveBeenCalledTimes(queryCalls);
});
