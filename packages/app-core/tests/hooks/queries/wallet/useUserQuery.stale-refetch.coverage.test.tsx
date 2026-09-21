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
  // Keep this session pre-bootstrap without leaving unresolved async work.
  // The callback captured below therefore takes the ensureSessionAccount path.
  suspendAccountBootstrap('0xaaa');
  mocks.activeAddress.value = '0xaaa';

  const { result, rerender } = renderHook(() => useCurrentUser(), {
    wrapper: createWrapper(),
  });
  const staleRefetch = result.current.refetch;

  await act(async () => {
    await Promise.resolve();
  });
  expect(mocks.connectWallet).not.toHaveBeenCalled();

  // Disconnect and flush the effect that clears sessionWalletRef. The stale
  // callback still closes over the old sessionWallet, so invoking it now must
  // reach ensureSessionAccount's no-wallet early return.
  await act(async () => {
    mocks.activeAddress.value = null;
    rerender();
  });
  await waitFor(() => expect(result.current.isConnected).toBe(false));

  mocks.connectWallet.mockClear();
  await act(async () => {
    await staleRefetch();
  });

  expect(mocks.connectWallet).not.toHaveBeenCalled();
});
