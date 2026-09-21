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

it('returns safely when a pre-bootstrap refetch callback outlives its wallet session', async () => {
  const bootstrap = deferred<{ user_id: string; is_new_user: boolean }>();
  mocks.activeAddress.value = '0xaaa';
  mocks.connectWallet.mockReturnValue(bootstrap.promise);

  const { result, rerender } = renderHook(() => useCurrentUser(), {
    wrapper: createWrapper(),
  });

  // Keep bootstrap pending so this callback is guaranteed to have captured
  // bootstrapReady=false and therefore routes through ensureSessionAccount().
  const staleRefetch = result.current.refetch;
  await waitFor(() => expect(mocks.connectWallet).toHaveBeenCalledTimes(1));

  mocks.activeAddress.value = null;
  await act(async () => {
    rerender();
  });
  expect(result.current.isConnected).toBe(false);

  // The disconnect effect has synchronously cleared sessionWalletRef by the
  // time act() settles, so the stale callback takes ensureSessionAccount's
  // no-wallet guard instead of joining the still-pending bootstrap request.
  await expect(staleRefetch()).resolves.toBeUndefined();
  expect(mocks.connectWallet).toHaveBeenCalledTimes(1);

  bootstrap.resolve({ user_id: 'user-1', is_new_user: false });
  await act(async () => {
    await bootstrap.promise;
  });
});
