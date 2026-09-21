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

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
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
  const bootstrap = deferred<{ user_id: string; is_new_user: boolean }>();
  mocks.activeAddress.value = '0xaaa';
  mocks.connectWallet.mockReturnValue(bootstrap.promise);

  const { result, rerender } = renderHook(() => useCurrentUser(), {
    wrapper: createWrapper(),
  });

  const staleRefetch = result.current.refetch;
  await waitFor(() => expect(mocks.connectWallet).toHaveBeenCalledTimes(1));

  mocks.activeAddress.value = null;
  rerender();
  await waitFor(() => expect(result.current.isConnected).toBe(false));

  await act(async () => {
    await staleRefetch();
  });

  expect(mocks.connectWallet).toHaveBeenCalledTimes(1);
  expect(mocks.getUserByWallet).not.toHaveBeenCalled();

  bootstrap.resolve({ user_id: 'user-1', is_new_user: false });
  await act(async () => {
    await bootstrap.promise;
  });
});
