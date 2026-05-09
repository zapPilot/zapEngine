import { useQuery } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useRegimeHistory } from '@/hooks/queries/market/useRegimeHistoryQuery';
import { DEFAULT_REGIME_HISTORY, fetchRegimeHistory } from '@/services';

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: vi.fn(),
  };
});

vi.mock('@/services', () => ({
  DEFAULT_REGIME_HISTORY: {
    currentRegime: 'n',
    previousRegime: null,
    direction: 'default',
    duration: null,
    transitions: [],
    timestamp: '2026-01-01T00:00:00.000Z',
    cached: false,
  },
  fetchRegimeHistory: vi.fn(),
}));

describe('useRegimeHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useQuery>);
  });

  it('configures regime history query fallback behavior', () => {
    renderHook(() => useRegimeHistory());

    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['sentiment', 'regime-history'],
        staleTime: 60 * 1000,
        gcTime: 180 * 1000,
        refetchInterval: 60 * 1000,
        retry: 1,
        placeholderData: DEFAULT_REGIME_HISTORY,
      }),
    );
  });

  it('fetches two regime transitions through the query function', async () => {
    const regimeHistory = {
      ...DEFAULT_REGIME_HISTORY,
      currentRegime: 'g',
      previousRegime: 'n',
      direction: 'fromRight',
    };
    vi.mocked(fetchRegimeHistory).mockResolvedValue(regimeHistory as any);

    renderHook(() => useRegimeHistory());

    const queryOptions = vi.mocked(useQuery).mock.calls[0][0] as {
      queryFn: () => Promise<unknown>;
    };
    await expect(queryOptions.queryFn()).resolves.toEqual(regimeHistory);
    expect(fetchRegimeHistory).toHaveBeenCalledWith(2);
  });

  it('returns default regime history when the fetch function fails', async () => {
    vi.mocked(fetchRegimeHistory).mockRejectedValue(new Error('offline'));

    renderHook(() => useRegimeHistory());

    const queryOptions = vi.mocked(useQuery).mock.calls[0][0] as {
      queryFn: () => Promise<unknown>;
    };
    await expect(queryOptions.queryFn()).resolves.toEqual(
      DEFAULT_REGIME_HISTORY,
    );
  });
});
