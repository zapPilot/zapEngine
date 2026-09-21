// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getDailyYieldReturns: vi.fn() }));

vi.mock('@core/services/analyticsService', () => ({
  getDailyYieldReturns: mocks.getDailyYieldReturns,
}));

// Keep the real timings, drop the real retry: the guard test below forces a
// rejected refetch, and two backoff waits would sit on vitest's timeout.
vi.mock('@core/hooks/queries/queryDefaults', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@core/hooks/queries/queryDefaults')>();
  return {
    ...actual,
    createQueryConfig: (
      options?: Parameters<typeof actual.createQueryConfig>[0],
    ) => ({
      ...actual.createQueryConfig(options),
      retry: false,
    }),
  };
});

import { CACHE_WINDOW } from '@core/config/cacheWindow';
import { useDailyYieldReturns } from '@core/hooks/queries/analytics/useDailyYieldReturns';
import { queryKeys } from '@core/lib/state/queryClient';

function createHarness() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return { client, wrapper };
}

beforeEach(() => vi.clearAllMocks());

describe('useDailyYieldReturns', () => {
  it('caches the bundle window under the shared dailyYield key', async () => {
    mocks.getDailyYieldReturns.mockResolvedValue({ daily_returns: [] });
    const { client, wrapper } = createHarness();

    const { result } = renderHook(() => useDailyYieldReturns('user-123', 365), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.getDailyYieldReturns).toHaveBeenCalledWith(
      'user-123',
      365,
      undefined,
    );
    expect(
      client.getQueryData(queryKeys.dailyYield.list('user-123', 365, null)),
    ).toEqual({ daily_returns: [] });
    // Timing is the shared ETL profile, not a hook-local constant.
    expect(
      client
        .getQueryCache()
        .find({ queryKey: queryKeys.dailyYield.list('user-123', 365, null) })
        ?.options,
    ).toMatchObject({
      staleTime: CACHE_WINDOW.staleTimeMs,
      gcTime: CACHE_WINDOW.gcTimeMs,
    });
  });

  it('forwards a wallet filter to the service', async () => {
    mocks.getDailyYieldReturns.mockResolvedValue({ daily_returns: [] });
    const { wrapper } = createHarness();

    const { result } = renderHook(
      () => useDailyYieldReturns('user-123', 30, '0xabc'),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.getDailyYieldReturns).toHaveBeenCalledWith(
      'user-123',
      30,
      '0xabc',
    );
  });

  it('stays disabled without a user id and guards manual refetch', async () => {
    const { wrapper } = createHarness();

    const { result } = renderHook(() => useDailyYieldReturns(undefined, 365), {
      wrapper,
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mocks.getDailyYieldReturns).not.toHaveBeenCalled();

    let refetched;
    await act(async () => {
      refetched = await result.current.refetch();
    });
    expect(refetched).toMatchObject({
      status: 'error',
      error: expect.objectContaining({ message: 'User ID is required' }),
    });
    expect(mocks.getDailyYieldReturns).not.toHaveBeenCalled();
  });
});
