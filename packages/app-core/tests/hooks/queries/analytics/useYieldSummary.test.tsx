// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getYieldSummary: vi.fn() }));

vi.mock('@core/services/analyticsService', () => ({
  getYieldSummary: mocks.getYieldSummary,
}));

import { useYieldSummary } from '@core/hooks/queries/analytics/useYieldSummary';

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => vi.clearAllMocks());

describe('useYieldSummary', () => {
  it('loads the summary for the requested subject and wallet', async () => {
    mocks.getYieldSummary.mockResolvedValue({ user_id: 'user', windows: {} });
    const { result } = renderHook(() => useYieldSummary('user', '0xabc'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.getYieldSummary).toHaveBeenCalledWith('user', {
      walletAddress: '0xabc',
    });
  });

  it('loads the bundle summary without a wallet filter', async () => {
    mocks.getYieldSummary.mockResolvedValue({ user_id: 'user', windows: {} });
    const { result } = renderHook(() => useYieldSummary('user'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.getYieldSummary).toHaveBeenCalledWith('user', {});
  });

  it('stays disabled without a user id and guards manual refetch', async () => {
    const { result } = renderHook(() => useYieldSummary(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mocks.getYieldSummary).not.toHaveBeenCalled();

    let refetched;
    await act(async () => {
      refetched = await result.current.refetch();
    });
    expect(refetched).toMatchObject({
      status: 'error',
      error: expect.objectContaining({
        message: 'userId is required to fetch yield summary',
      }),
    });
  });
});
