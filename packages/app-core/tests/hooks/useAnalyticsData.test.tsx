// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { useAnalyticsData } from '@core/hooks/queries/analytics/useAnalyticsData';
import type { AnalyticsTimePeriod } from '@core/types/analytics';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dashboard: {
    data: undefined as unknown,
    isLoading: false,
    isFetching: false,
    error: null as Error | null,
    refetch: vi.fn(),
  },
  monthly: {
    data: undefined as unknown,
    isLoading: false,
    isFetching: false,
    error: null as Error | null,
    refetch: vi.fn(),
  },
  usePortfolioDashboard: vi.fn(),
  useDailyYieldReturns: vi.fn(),
  getAnalyticsStaleTime: vi.fn(),
  transformToPerformanceChart: vi.fn(),
  transformToDrawdownChart: vi.fn(),
  calculateKeyMetrics: vi.fn(),
  aggregateMonthlyPnL: vi.fn(),
}));

vi.mock('@core/hooks/analytics/usePortfolioDashboard', () => ({
  usePortfolioDashboard: (...args: unknown[]) => {
    mocks.usePortfolioDashboard(...args);
    return mocks.dashboard;
  },
}));

vi.mock('@core/hooks/queries/analytics/useDailyYieldReturns', () => ({
  useDailyYieldReturns: (...args: unknown[]) => {
    mocks.useDailyYieldReturns(...args);
    return mocks.monthly;
  },
}));

vi.mock('@core/lib/analytics/cacheConfig', () => ({
  getAnalyticsStaleTime: (...args: unknown[]) =>
    mocks.getAnalyticsStaleTime(...args),
}));

vi.mock('@core/lib/analytics/transformers', () => ({
  transformToPerformanceChart: (...args: unknown[]) =>
    mocks.transformToPerformanceChart(...args),
  transformToDrawdownChart: (...args: unknown[]) =>
    mocks.transformToDrawdownChart(...args),
  calculateKeyMetrics: (...args: unknown[]) =>
    mocks.calculateKeyMetrics(...args),
  aggregateMonthlyPnL: (...args: unknown[]) =>
    mocks.aggregateMonthlyPnL(...args),
}));

const PERIOD_30 = { key: '1M', days: 30, label: '1M' } as AnalyticsTimePeriod;
const PERIOD_90 = { key: '3M', days: 90, label: '3M' } as AnalyticsTimePeriod;

function resetQuery(query: typeof mocks.dashboard) {
  query.data = undefined;
  query.isLoading = false;
  query.isFetching = false;
  query.error = null;
  query.refetch.mockReset();
  query.refetch.mockResolvedValue(undefined);
}

describe('useAnalyticsData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetQuery(mocks.dashboard);
    resetQuery(mocks.monthly);
    mocks.getAnalyticsStaleTime.mockReturnValue(1234);
    mocks.transformToPerformanceChart.mockReturnValue(['performance']);
    mocks.transformToDrawdownChart.mockReturnValue(['drawdown']);
    mocks.calculateKeyMetrics.mockReturnValue({ metric: true });
    mocks.aggregateMonthlyPnL.mockReturnValue(['monthly']);
  });

  it('configures initial dashboard and yield queries without a wallet filter', () => {
    const { result } = renderHook(() =>
      useAnalyticsData('user-1', PERIOD_30, null),
    );

    expect(mocks.getAnalyticsStaleTime).toHaveBeenCalledWith(false, null);
    expect(mocks.usePortfolioDashboard).toHaveBeenCalledWith(
      'user-1',
      {
        trend_days: 30,
        drawdown_days: 30,
        rolling_days: 30,
      },
      { staleTime: 1234, refetchOnMount: false },
    );
    expect(mocks.useDailyYieldReturns).toHaveBeenCalledWith('user-1', 30, null);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('adds a truthy wallet filter and forces an always-refetch on period changes', () => {
    const { rerender } = renderHook(
      ({ period }) => useAnalyticsData('user-1', period, '0xwallet'),
      { initialProps: { period: PERIOD_30 } },
    );

    rerender({ period: PERIOD_90 });

    expect(mocks.getAnalyticsStaleTime).toHaveBeenLastCalledWith(
      true,
      '0xwallet',
    );
    expect(mocks.usePortfolioDashboard).toHaveBeenLastCalledWith(
      'user-1',
      {
        trend_days: 90,
        drawdown_days: 90,
        rolling_days: 90,
        wallet_address: '0xwallet',
      },
      { staleTime: 1234, refetchOnMount: 'always' },
    );
  });

  it('transforms dashboard data and gracefully omits monthly PnL when yield data is absent', () => {
    mocks.dashboard.data = {
      trends: { daily_values: [{ date: '2026-01-01', value: 1 }] },
    };
    const { result, rerender } = renderHook(() =>
      useAnalyticsData('user-1', PERIOD_30),
    );

    expect(result.current.data).toEqual({
      performanceChart: ['performance'],
      drawdownChart: ['drawdown'],
      keyMetrics: { metric: true },
      monthlyPnL: [],
    });
    expect(mocks.aggregateMonthlyPnL).not.toHaveBeenCalled();

    mocks.monthly.data = { daily_returns: [] };
    rerender();
    expect(mocks.aggregateMonthlyPnL).toHaveBeenCalledWith(mocks.monthly.data, [
      { date: '2026-01-01', value: 1 },
    ]);
    expect(result.current.data?.monthlyPnL).toEqual(['monthly']);
  });

  it('uses an empty daily-values fallback when dashboard trends are absent', () => {
    mocks.dashboard.data = {};
    mocks.monthly.data = { daily_returns: [] };
    renderHook(() => useAnalyticsData('user-1', PERIOD_30));

    expect(mocks.aggregateMonthlyPnL).toHaveBeenCalledWith(
      mocks.monthly.data,
      [],
    );
  });

  it('combines loading/fetching flags independently for dashboard and monthly data', () => {
    mocks.dashboard.isLoading = true;
    mocks.monthly.isFetching = true;
    const first = renderHook(() => useAnalyticsData('user-1', PERIOD_30));
    expect(first.result.current.isLoading).toBe(true);
    expect(first.result.current.isMonthlyPnLLoading).toBe(true);
    first.unmount();

    mocks.dashboard.isLoading = false;
    mocks.dashboard.isFetching = true;
    mocks.monthly.isFetching = false;
    mocks.monthly.isLoading = true;
    const second = renderHook(() => useAnalyticsData('user-1', PERIOD_30));
    expect(second.result.current.isLoading).toBe(true);
    expect(second.result.current.isMonthlyPnLLoading).toBe(true);
  });

  it('hides query errors until dashboard data exists and prioritizes dashboard errors', () => {
    const dashboardError = new Error('dashboard');
    const monthlyError = new Error('monthly');
    mocks.dashboard.error = dashboardError;
    mocks.monthly.error = monthlyError;

    const { result, rerender } = renderHook(() =>
      useAnalyticsData('user-1', PERIOD_30),
    );
    expect(result.current.error).toBeNull();

    mocks.dashboard.data = { trends: { daily_values: [] } };
    rerender();
    expect(result.current.error).toBe(dashboardError);

    mocks.dashboard.error = null;
    rerender();
    expect(result.current.error).toBe(monthlyError);

    mocks.monthly.error = null;
    rerender();
    expect(result.current.error).toBeNull();
  });

  it('always refetches dashboard but only refetches monthly data after dashboard data exists', () => {
    const { result, rerender } = renderHook(() =>
      useAnalyticsData('user-1', PERIOD_30),
    );

    act(() => result.current.refetch());
    expect(mocks.dashboard.refetch).toHaveBeenCalledTimes(1);
    expect(mocks.monthly.refetch).not.toHaveBeenCalled();

    mocks.dashboard.data = { trends: { daily_values: [] } };
    rerender();
    act(() => result.current.refetch());
    expect(mocks.dashboard.refetch).toHaveBeenCalledTimes(2);
    expect(mocks.monthly.refetch).toHaveBeenCalledTimes(1);
  });
});
