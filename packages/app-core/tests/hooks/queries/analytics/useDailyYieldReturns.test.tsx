// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getDailyYieldReturns: vi.fn() }));

vi.mock('@core/services/analyticsService', () => ({
  getDailyYieldReturns: mocks.getDailyYieldReturns,
}));

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

  it('stays disabled without a user id', () => {
    const { wrapper } = createHarness();

    const { result } = renderHook(() => useDailyYieldReturns(undefined, 365), {
      wrapper,
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mocks.getDailyYieldReturns).not.toHaveBeenCalled();
  });
});
