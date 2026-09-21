// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getLandingPagePortfolioData: vi.fn() }));

vi.mock('@core/services/analyticsService', () => ({
  getLandingPagePortfolioData: mocks.getLandingPagePortfolioData,
}));

import { useLandingPageData } from '@core/hooks/queries/analytics/usePortfolioQuery';

function createHarness() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return { client, invalidateSpy, wrapper };
}

function invalidatedKeys(invalidateSpy: ReturnType<typeof vi.spyOn>) {
  return invalidateSpy.mock.calls.map(
    ([options]) => (options as { queryKey?: readonly unknown[] })?.queryKey,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('useLandingPageData snapshot detection', () => {
  it('treats the first snapshot as a baseline, not a change', async () => {
    mocks.getLandingPagePortfolioData.mockResolvedValue({
      last_updated: 'A',
    });
    const { invalidateSpy, wrapper } = createHarness();

    const { result } = renderHook(() => useLandingPageData('user-1'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('refreshes the other home queries when the ETL snapshot moves', async () => {
    mocks.getLandingPagePortfolioData
      .mockResolvedValueOnce({ last_updated: 'A' })
      .mockResolvedValue({ last_updated: 'B' });
    const { invalidateSpy, wrapper } = createHarness();

    const { result } = renderHook(() => useLandingPageData('user-1'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    invalidateSpy.mockClear();

    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());
    expect(invalidatedKeys(invalidateSpy)).toEqual([
      ['portfolio'],
      ['portfolio-dashboard', 'user-1'],
      ['dailyYield', 'user-1'],
      ['desktop', 'portfolio', 'dailyYield', 'user-1'],
      ['desktop', 'strategy-suggestion', 'user-1'],
    ]);
    // The landing slice produced this snapshot; re-fetching it would loop.
    expect(invalidateSpy.mock.calls[0]?.[0]).toHaveProperty('predicate');
  });

  it('sweeps once no matter how many observers home mounts', async () => {
    mocks.getLandingPagePortfolioData
      .mockResolvedValueOnce({ last_updated: 'A' })
      .mockResolvedValue({ last_updated: 'B' });
    const { invalidateSpy, wrapper } = createHarness();

    const { result } = renderHook(
      () => {
        useLandingPageData('user-1');
        return useLandingPageData('user-1');
      },
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    invalidateSpy.mockClear();

    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());
    expect(invalidatedKeys(invalidateSpy)).toHaveLength(5);
  });

  it('never sweeps for a response without a snapshot timestamp', async () => {
    mocks.getLandingPagePortfolioData.mockResolvedValue({
      last_updated: null,
    });
    const { invalidateSpy, wrapper } = createHarness();

    const { result } = renderHook(() => useLandingPageData('user-1'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await act(async () => {
      await result.current.refetch();
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
