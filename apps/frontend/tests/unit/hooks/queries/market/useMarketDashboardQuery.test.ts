import { useQuery } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { useMarketDashboardQuery } from '@zapengine/app-core/hooks/queries/market/useMarketDashboardQuery';
import { getMarketDashboardData } from '@zapengine/app-core/services';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: vi.fn(),
  };
});

vi.mock('@zapengine/app-core/services', () => ({
  getMarketDashboardData: vi.fn(),
}));

describe('useMarketDashboardQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useQuery>);
  });

  it('uses a 365-day market dashboard query by default', async () => {
    vi.mocked(getMarketDashboardData).mockResolvedValue({
      snapshots: [],
      count: 0,
    } as never);

    renderHook(() => useMarketDashboardQuery());

    const queryOptions = vi.mocked(useQuery).mock.calls[0][0] as {
      queryKey: unknown[];
      queryFn: () => Promise<unknown>;
      refetchOnWindowFocus: boolean;
    };
    expect(queryOptions.queryKey).toEqual(['market-dashboard', 365]);
    expect(queryOptions.refetchOnWindowFocus).toBe(false);
    await queryOptions.queryFn();
    expect(getMarketDashboardData).toHaveBeenCalledWith(365);
  });

  it('includes the requested day window in the query key and fetch call', async () => {
    vi.mocked(getMarketDashboardData).mockResolvedValue({
      snapshots: [],
      count: 0,
    } as never);

    renderHook(() => useMarketDashboardQuery(90));

    const queryOptions = vi.mocked(useQuery).mock.calls[0][0] as {
      queryKey: unknown[];
      queryFn: () => Promise<unknown>;
    };
    expect(queryOptions.queryKey).toEqual(['market-dashboard', 90]);
    await queryOptions.queryFn();
    expect(getMarketDashboardData).toHaveBeenCalledWith(90);
  });
});
