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
import {
  resetAccountBootstrapForTests,
  suspendAccountBootstrap,
} from '@core/lib/state/accountBootstrap';

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

it('ignores a stale pre-bootstrap refetch after the wallet disconnects', async () => {
  // Keep the session unready without an unresolved transport promise. This
  // guarantees the captured callback routes through ensureSessionAccount().
  suspendAccountBootstrap('0xaaa');
  mocks.activeAddress.value = '0xaaa';

  const { result, rerender } = renderHook(() => useCurrentUser(), {
    wrapper: createWrapper(),
  });
  const staleRefetch = result.current.refetch;

  await act(async () => {});
  expect(result.current.isConnected).toBe(true);
  expect(mocks.connectWallet).not.toHaveBeenCalled();

  // Flush the disconnect effect so sessionWalletRef is null before invoking
  // the old callback. It must then take ensureSessionAccount's no-wallet guard.
  await act(async () => {
    mocks.activeAddress.value = null;
    rerender();
  });
  await waitFor(() => expect(result.current.isConnected).toBe(false));

  let staleResult: unknown;
  await act(async () => {
    staleResult = await staleRefetch();
  });

  expect(staleResult).toBeUndefined();
  expect(mocks.connectWallet).not.toHaveBeenCalled();
  expect(mocks.getUserByWallet).not.toHaveBeenCalled();
});
