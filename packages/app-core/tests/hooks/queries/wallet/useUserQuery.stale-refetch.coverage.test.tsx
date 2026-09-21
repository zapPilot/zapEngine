import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

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

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.activeAddress.value = null;
});

it('ignores a stale pre-bootstrap refetch after the wallet disconnects', async () => {
  mocks.activeAddress.value = '0xaaa';

  const { result, rerender } = renderHook(() => useCurrentUser(), {
    wrapper: createWrapper(),
  });

  // Capture the first-render callback while bootstrapReady is still false.
  // It therefore closes over the ensureSessionAccount path even if the normal
  // mount effect subsequently finishes bootstrap.
  const staleRefetch = result.current.refetch;

  await act(async () => {
    mocks.activeAddress.value = null;
    rerender();
  });
  await waitFor(() => expect(result.current.isConnected).toBe(false));

  // Ignore bootstrap work from the original connected render. From this point
  // onward the disconnect effect has cleared sessionWalletRef, so the stale
  // callback must stop at ensureSessionAccount's no-wallet early return.
  mocks.connectWallet.mockClear();
  await act(async () => {
    await staleRefetch();
  });

  expect(mocks.connectWallet).not.toHaveBeenCalled();
});
