// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  getLandingPagePortfolioData: vi.fn(),
  getPortfolioDashboard: vi.fn(),
  getMarketDashboardData: vi.fn(),
  createQueryConfig: vi.fn(),
  useCurrentUser: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => mocks.useQuery(...args),
}));

vi.mock('@core/lib/state/queryClient', () => ({
  queryKeys: {
    portfolio: {
      landingPage: (userId: string) => ['portfolio', 'landing', userId],
    },
    portfolioDashboard: {
      detail: (userId: string | undefined, params: unknown) => [
        'portfolio-dashboard',
        userId,
        params,
      ],
    },
  },
}));

vi.mock('@core/services/analyticsService', () => ({
  getLandingPagePortfolioData: (...args: unknown[]) =>
    mocks.getLandingPagePortfolioData(...args),
}));

vi.mock('@core/services', () => ({
  getPortfolioDashboard: (...args: unknown[]) =>
    mocks.getPortfolioDashboard(...args),
  getMarketDashboardData: (...args: unknown[]) =>
    mocks.getMarketDashboardData(...args),
}));

vi.mock('@core/hooks/queries/queryDefaults', () => ({
  createQueryConfig: (...args: unknown[]) => mocks.createQueryConfig(...args),
}));

vi.mock('@core/hooks/queries/wallet/useUserQuery', () => ({
  useCurrentUser: () => mocks.useCurrentUser(),
}));

import { usePortfolioDashboard } from '@core/hooks/analytics/usePortfolioDashboard';
import { useLandingPageData } from '@core/hooks/queries/analytics/usePortfolioQuery';
import { useMarketDashboardQuery } from '@core/hooks/queries/market/useMarketDashboardQuery';
import { useUser } from '@core/hooks/queries/wallet/useUser';

describe('query hook coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createQueryConfig.mockReturnValue({ retry: 'config' });
    mocks.useQuery.mockImplementation((config) => ({
      data: 'query-data',
      config,
      refetch: vi.fn(),
    }));
  });

  it('configures landing-page query defaults and executes the query function', async () => {
    mocks.getLandingPagePortfolioData.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useLandingPageData('user-1'));
    const config = mocks.useQuery.mock.calls.at(-1)?.[0];

    expect(mocks.createQueryConfig).toHaveBeenCalledWith({
      retryConfig: { skipErrorMessages: ['USER_NOT_FOUND', '404'] },
    });
    expect(config).toMatchObject({
      enabled: true,
      refetchInterval: 5 * 60 * 1000,
    });
    await expect(config.queryFn()).resolves.toEqual({ ok: true });
    expect(mocks.getLandingPagePortfolioData).toHaveBeenCalledWith('user-1');
    expect(result.current.data).toBe('query-data');
  });

  it('disables landing-page query for missing user, ETL, or inactive view', async () => {
    renderHook(() => useLandingPageData(undefined));
    let config = mocks.useQuery.mock.calls.at(-1)?.[0];
    expect(config.enabled).toBe(false);
    await expect(config.queryFn()).rejects.toThrow('User ID is required');

    renderHook(() => useLandingPageData('user-1', true, true));
    config = mocks.useQuery.mock.calls.at(-1)?.[0];
    expect(config.enabled).toBe(false);
    expect(config.refetchInterval).toBe(5 * 60 * 1000);

    renderHook(() => useLandingPageData('user-1', false, false));
    config = mocks.useQuery.mock.calls.at(-1)?.[0];
    expect(config.enabled).toBe(false);
    expect(config.refetchInterval).toBe(false);
  });

  it('configures portfolio dashboard defaults and returns dashboard alias', async () => {
    mocks.getPortfolioDashboard.mockResolvedValue({ dashboard: true });
    const { result } = renderHook(() => usePortfolioDashboard('user-1'));
    const config = mocks.useQuery.mock.calls.at(-1)?.[0];

    expect(config.enabled).toBe(true);
    expect(config.staleTime).toBe(2 * 60 * 1000);
    expect(config.gcTime).toBe(12 * 60 * 60 * 1000);
    expect(config.refetchOnMount).toBeUndefined();
    await expect(config.queryFn()).resolves.toEqual({ dashboard: true });
    expect(mocks.getPortfolioDashboard).toHaveBeenCalledWith('user-1', {});
    expect(result.current.dashboard).toBe('query-data');
  });

  it('honors dashboard overrides and disables missing users', () => {
    renderHook(() =>
      usePortfolioDashboard(
        undefined,
        { trend_days: 30 },
        { staleTime: 0, refetchOnMount: 'always' },
      ),
    );
    const config = mocks.useQuery.mock.calls.at(-1)?.[0];
    expect(config.enabled).toBe(false);
    expect(config.staleTime).toBe(0);
    expect(config.refetchOnMount).toBe('always');
  });

  it('configures market dashboard defaults and enabled overrides', async () => {
    mocks.getMarketDashboardData.mockResolvedValue({ count: 1 });
    renderHook(() => useMarketDashboardQuery());
    let config = mocks.useQuery.mock.calls.at(-1)?.[0];
    expect(config.queryKey).toEqual(['market-dashboard', 365]);
    expect(config.enabled).toBe(true);
    expect(config.refetchOnWindowFocus).toBe(false);
    await expect(config.queryFn()).resolves.toEqual({ count: 1 });
    expect(mocks.getMarketDashboardData).toHaveBeenCalledWith(365);

    renderHook(() => useMarketDashboardQuery(30, { enabled: false }));
    config = mocks.useQuery.mock.calls.at(-1)?.[0];
    expect(config.queryKey).toEqual(['market-dashboard', 30]);
    expect(config.enabled).toBe(false);
  });

  it('flattens current-user state and combines loading/fetching flags', () => {
    const refetch = vi.fn();
    mocks.useCurrentUser.mockReturnValue({
      userInfo: { id: 'user-1' },
      isLoading: true,
      isFetching: false,
      error: null,
      isConnected: true,
      connectedWallet: '0xabc',
      refetch,
    });
    const first = renderHook(() => useUser());
    expect(first.result.current).toMatchObject({
      userInfo: { id: 'user-1' },
      loading: true,
      error: null,
      isConnected: true,
      connectedWallet: '0xabc',
      refetch,
    });
    first.unmount();

    mocks.useCurrentUser.mockReturnValue({
      userInfo: null,
      isLoading: false,
      isFetching: true,
      error: 'failed',
      isConnected: false,
      connectedWallet: null,
      refetch,
    });
    const second = renderHook(() => useUser());
    expect(second.result.current.loading).toBe(true);
    expect(second.result.current.error).toBe('failed');
  });
});
