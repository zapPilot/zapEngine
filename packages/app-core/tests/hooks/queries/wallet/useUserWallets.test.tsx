// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUserWallets: vi.fn(),
}));

vi.mock('@core/services', () => ({
  getUserWallets: mocks.getUserWallets,
}));

import { useUserWallets } from '@core/hooks/queries/wallet/useUserWallets';

const USER_ID = '5fc63d4e-4e07-47d8-840b-ccd3420d553f';
const ROWS = [{ id: 'w1', wallet: '0xabc', label: 'Main' }];

function createHarness() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return { client, wrapper };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useUserWallets', () => {
  it('does not fetch when userId is null', () => {
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useUserWallets(null), { wrapper });

    expect(mocks.getUserWallets).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.data).toBeUndefined();
  });

  it('fetches and returns the wallet rows for a userId', async () => {
    mocks.getUserWallets.mockResolvedValue(ROWS);
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useUserWallets(USER_ID), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.getUserWallets).toHaveBeenCalledWith(USER_ID);
    expect(result.current.data).toEqual(ROWS);
  });

  it('caches under the shared user-wallets query key', async () => {
    mocks.getUserWallets.mockResolvedValue(ROWS);
    const { client, wrapper } = createHarness();
    const { result } = renderHook(() => useUserWallets(USER_ID), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData(['user-wallets', USER_ID])).toEqual(ROWS);
  });
});
