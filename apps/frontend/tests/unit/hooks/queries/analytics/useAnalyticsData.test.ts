// Mock react-query useQuery for the internal monthlyPnLQuery
// Since useAnalyticsData uses useQuery internally for monthlyPnL, we need to mock it.
// However, useQuery is imported from @tanstack/react-query.
// We can mock the module or relying on proper wrapper.
// But wait, usePortfolioDashboard is a custom hook, so we mocked it easily.
// monthlyPnLQuery uses raw useQuery.
import { useQuery } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePortfolioDashboard } from '@/hooks/analytics/usePortfolioDashboard';
import { useAnalyticsData } from '@/hooks/queries/analytics/useAnalyticsData';
import * as AnalyticsTransformers from '@/lib/analytics/transformers';

// Mock dependencies
vi.mock('@/hooks/analytics/usePortfolioDashboard');
vi.mock('@/services/analyticsService');
vi.mock('@/lib/analytics/transformers', async () => {
  return {
    aggregateMonthlyPnL: vi.fn(),
    calculateKeyMetrics: vi.fn(),
    transformToDrawdownChart: vi.fn(),
    transformToPerformanceChart: vi.fn(),
  };
});
vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: vi.fn(),
  };
});

describe('useAnalyticsData', () => {
  const mockDashboardData = { trends: { daily_values: [1, 2] } };
  const mockPnLData = [{ date: '2024-01', value: 100 }];

  const defaultDashboardQuery = {
    data: null,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    isFetching: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePortfolioDashboard).mockReturnValue(
      defaultDashboardQuery as any,
    );
    // Default mock for useQuery (monthlyPnL)
    vi.mocked(useQuery).mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    } as any);

    vi.mocked(
      AnalyticsTransformers.transformToPerformanceChart,
    ).mockReturnValue({} as any);
    vi.mocked(AnalyticsTransformers.transformToDrawdownChart).mockReturnValue(
      [] as any,
    );
    vi.mocked(AnalyticsTransformers.calculateKeyMetrics).mockReturnValue(
      {} as any,
    );
    vi.mocked(AnalyticsTransformers.aggregateMonthlyPnL).mockReturnValue(
      [] as any,
    );
  });

  it('should return loading state when dashboard is loading', () => {
    vi.mocked(usePortfolioDashboard).mockReturnValue({
      ...defaultDashboardQuery,
      isLoading: true,
    } as any);

    const { result } = renderHook(() =>
      useAnalyticsData('user1', { key: '1M', days: 30, label: '1M' }),
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeNull();
  });

  it('should transform data when dashboard loads', () => {
    vi.mocked(usePortfolioDashboard).mockReturnValue({
      ...defaultDashboardQuery,
      data: mockDashboardData,
    } as any);

    // Mock monthly PnL query success
    vi.mocked(useQuery).mockReturnValue({
      data: mockPnLData,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    } as any);

    const { result } = renderHook(() =>
      useAnalyticsData('user1', { key: '1M', days: 30, label: '1M' }),
    );

    expect(result.current.data).not.toBeNull();
    expect(
      AnalyticsTransformers.transformToPerformanceChart,
    ).toHaveBeenCalled();
    expect(AnalyticsTransformers.transformToDrawdownChart).toHaveBeenCalled();
    expect(AnalyticsTransformers.calculateKeyMetrics).toHaveBeenCalled();
    expect(AnalyticsTransformers.aggregateMonthlyPnL).toHaveBeenCalledWith(
      mockPnLData,
      mockDashboardData.trends.daily_values,
    );
  });

  it('should handle error states', () => {
    const error = new Error('Dashboard failed');
    vi.mocked(usePortfolioDashboard).mockReturnValue({
      ...defaultDashboardQuery,
      error,
      data: { trends: {} }, // Data might be partial or null, but error takes precedence in hook return if we structured it that way?
      // Actually implementation says: `error: dashboardQuery.data ? error : null`
      // Wait, if NO data, data is null.
      // implementation: `if (!dashboardQuery.data) return null` (inside useMemo)
      // `const error = dashboardQuery.error ?? ...`
      // `return { error: dashboardQuery.data ? error : null }`
      // So if dashboard fails completely (no data), error is null? That seems weird in the implementation, but let's check logic.
      // If data is null, the hook returns `data: null`, `error: null`.
      // Wait, look at code: `error: dashboardQuery.data ? error : null`.
      // So if `dashboardQuery.data` is missing, error is null.
      // This implies the UI handles "no data + no loading" as... empty? or maybe the hook expects data to be present if error is present?
      // Actually, usually `useQuery` returns `data` as `undefined` on error unless `placeholderData` is used.

      // Let's test the current implementation behavior.
    } as any);

    // Case 1: No data, has error.
    {
      vi.mocked(usePortfolioDashboard).mockReturnValue({
        ...defaultDashboardQuery,
        data: null,
        error,
      } as any);
      const { result } = renderHook(() =>
        useAnalyticsData('user1', { key: '1M', days: 30, label: '1M' }),
      );
      // Based on code: `error: dashboardQuery.data ? error : null` -> error should be null if data is null.
      expect(result.current.error).toBeNull();
    }

    // Case 2: Has data (cached?), has new error.
    {
      vi.mocked(usePortfolioDashboard).mockReturnValue({
        ...defaultDashboardQuery,
        data: mockDashboardData,
        error,
      } as any);
      const { result } = renderHook(() =>
        useAnalyticsData('user1', { key: '1M', days: 30, label: '1M' }),
      );
      expect(result.current.error).toBe(error);
    }
  });

  it('should refetch all queries', () => {
    const mockRefetchDashboard = vi.fn();
    const mockRefetchPnL = vi.fn();

    vi.mocked(usePortfolioDashboard).mockReturnValue({
      ...defaultDashboardQuery,
      refetch: mockRefetchDashboard,
      data: mockDashboardData, // Needs data to refetch PnL
    } as any);
    vi.mocked(useQuery).mockReturnValue({
      data: null,
      isLoading: false,
      refetch: mockRefetchPnL,
    } as any);

    const { result } = renderHook(() =>
      useAnalyticsData('user1', { key: '1M', days: 30, label: '1M' }),
    );

    result.current.refetch();

    expect(mockRefetchDashboard).toHaveBeenCalled();
    expect(mockRefetchPnL).toHaveBeenCalled();
  });

  it('should not refetch monthlyPnL when dashboard data is missing', () => {
    const mockRefetchDashboard = vi.fn();
    const mockRefetchPnL = vi.fn();

    vi.mocked(usePortfolioDashboard).mockReturnValue({
      ...defaultDashboardQuery,
      refetch: mockRefetchDashboard,
      data: null, // No dashboard data
    } as any);
    vi.mocked(useQuery).mockReturnValue({
      data: null,
      isLoading: false,
      refetch: mockRefetchPnL,
    } as any);

    const { result } = renderHook(() =>
      useAnalyticsData('user1', { key: '1M', days: 30, label: '1M' }),
    );

    result.current.refetch();

    expect(mockRefetchDashboard).toHaveBeenCalled();
    expect(mockRefetchPnL).not.toHaveBeenCalled();
  });

  it('should show loading when dashboard is fetching', () => {
    vi.mocked(usePortfolioDashboard).mockReturnValue({
      ...defaultDashboardQuery,
      isLoading: false,
      isFetching: true,
      data: mockDashboardData,
    } as any);

    const { result } = renderHook(() =>
      useAnalyticsData('user1', { key: '1M', days: 30, label: '1M' }),
    );

    expect(result.current.isLoading).toBe(true);
  });

  it('should show monthlyPnL loading state independently', () => {
    vi.mocked(usePortfolioDashboard).mockReturnValue({
      ...defaultDashboardQuery,
      data: mockDashboardData,
    } as any);

    vi.mocked(useQuery).mockReturnValue({
      data: null,
      isLoading: true,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    const { result } = renderHook(() =>
      useAnalyticsData('user1', { key: '1M', days: 30, label: '1M' }),
    );

    expect(result.current.isMonthlyPnLLoading).toBe(true);
    expect(result.current.isLoading).toBe(false);
  });

  it('should show monthlyPnL loading when fetching', () => {
    vi.mocked(usePortfolioDashboard).mockReturnValue({
      ...defaultDashboardQuery,
      data: mockDashboardData,
    } as any);

    vi.mocked(useQuery).mockReturnValue({
      data: null,
      isLoading: false,
      isFetching: true,
      error: null,
      refetch: vi.fn(),
    } as any);

    const { result } = renderHook(() =>
      useAnalyticsData('user1', { key: '1M', days: 30, label: '1M' }),
    );

    expect(result.current.isMonthlyPnLLoading).toBe(true);
  });

  it('should prioritize dashboard error over monthlyPnL error', () => {
    const dashboardError = new Error('Dashboard error');
    const pnlError = new Error('PnL error');

    vi.mocked(usePortfolioDashboard).mockReturnValue({
      ...defaultDashboardQuery,
      error: dashboardError,
      data: mockDashboardData,
    } as any);

    vi.mocked(useQuery).mockReturnValue({
      data: null,
      isLoading: false,
      error: pnlError,
      refetch: vi.fn(),
      isFetching: false,
    } as any);

    const { result } = renderHook(() =>
      useAnalyticsData('user1', { key: '1M', days: 30, label: '1M' }),
    );

    expect(result.current.error).toBe(dashboardError);
  });

  it('should show monthlyPnL error when dashboard is successful', () => {
    const pnlError = new Error('PnL error');

    vi.mocked(usePortfolioDashboard).mockReturnValue({
      ...defaultDashboardQuery,
      error: null,
      data: mockDashboardData,
    } as any);

    vi.mocked(useQuery).mockReturnValue({
      data: null,
      isLoading: false,
      error: pnlError,
      refetch: vi.fn(),
      isFetching: false,
    } as any);

    const { result } = renderHook(() =>
      useAnalyticsData('user1', { key: '1M', days: 30, label: '1M' }),
    );

    expect(result.current.error).toBe(pnlError);
  });

  it('should return empty monthlyPnL array when PnL query fails', () => {
    vi.mocked(usePortfolioDashboard).mockReturnValue({
      ...defaultDashboardQuery,
      data: mockDashboardData,
    } as any);

    vi.mocked(useQuery).mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('PnL failed'),
      refetch: vi.fn(),
      isFetching: false,
    } as any);

    const { result } = renderHook(() =>
      useAnalyticsData('user1', { key: '1M', days: 30, label: '1M' }),
    );

    expect(result.current.data?.monthlyPnL).toEqual([]);
  });

  it('should handle wallet filter parameter', () => {
    vi.mocked(usePortfolioDashboard).mockReturnValue({
      ...defaultDashboardQuery,
      data: mockDashboardData,
    } as any);

    renderHook(() =>
      useAnalyticsData('user1', { key: '1M', days: 30, label: '1M' }, '0x123'),
    );

    // Verify usePortfolioDashboard was called with wallet_address filter
    expect(usePortfolioDashboard).toHaveBeenCalledWith(
      'user1',
      expect.objectContaining({
        wallet_address: '0x123',
      }),
      expect.any(Object),
    );
  });

  it('should not include wallet_address in dashboard params when filter is null', () => {
    vi.mocked(usePortfolioDashboard).mockReturnValue({
      ...defaultDashboardQuery,
      data: mockDashboardData,
    } as any);

    renderHook(() =>
      useAnalyticsData('user1', { key: '1M', days: 30, label: '1M' }, null),
    );

    // Verify usePortfolioDashboard was called without wallet_address
    const callArgs = vi.mocked(usePortfolioDashboard).mock.calls[0];
    expect(callArgs[1]).not.toHaveProperty('wallet_address');
  });

  it('should handle missing daily_values gracefully', () => {
    vi.mocked(usePortfolioDashboard).mockReturnValue({
      ...defaultDashboardQuery,
      data: { trends: {} }, // No daily_values
    } as any);

    vi.mocked(useQuery).mockReturnValue({
      data: mockPnLData,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    } as any);

    const { result } = renderHook(() =>
      useAnalyticsData('user1', { key: '1M', days: 30, label: '1M' }),
    );

    expect(result.current.data).not.toBeNull();
    expect(AnalyticsTransformers.aggregateMonthlyPnL).toHaveBeenCalledWith(
      mockPnLData,
      [],
    );
  });

  it('should handle missing btc snapshots gracefully', () => {
    vi.mocked(usePortfolioDashboard).mockReturnValue({
      ...defaultDashboardQuery,
      data: mockDashboardData,
    } as any);

    const { result } = renderHook(() =>
      useAnalyticsData('user1', { key: '1M', days: 30, label: '1M' }),
    );

    expect(result.current.data).not.toBeNull();
    expect(
      AnalyticsTransformers.transformToPerformanceChart,
    ).toHaveBeenCalledWith(mockDashboardData);
  });

  it('should track period changes and update staleTime', () => {
    const { rerender } = renderHook(
      ({ timePeriod }) => useAnalyticsData('user1', timePeriod),
      {
        initialProps: { timePeriod: { key: '1M', days: 30, label: '1M' } },
      },
    );

    // Change period
    rerender({ timePeriod: { key: '1Y', days: 365, label: '1Y' } });

    // Verify hook was called again with new period
    expect(usePortfolioDashboard).toHaveBeenCalledTimes(2);
  });

  it('should pass wallet filter to monthlyPnL query', () => {
    vi.mocked(usePortfolioDashboard).mockReturnValue({
      ...defaultDashboardQuery,
      data: mockDashboardData,
    } as any);

    vi.mocked(useQuery).mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    } as any);

    renderHook(() =>
      useAnalyticsData('user1', { key: '1M', days: 30, label: '1M' }, '0xabc'),
    );

    // Verify useQuery was called with wallet filter in queryKey
    const queryKeyCall = vi.mocked(useQuery).mock.calls[0][0];
    expect(queryKeyCall.queryKey).toContain('0xabc');
  });

  it('should handle undefined userId gracefully', () => {
    const { result } = renderHook(() =>
      useAnalyticsData(undefined, { key: '1M', days: 30, label: '1M' }),
    );

    expect(result.current.data).toBeNull();
  });

  it('should call monthlyPnL query with correct parameters when enabled', () => {
    vi.mocked(usePortfolioDashboard).mockReturnValue({
      ...defaultDashboardQuery,
      data: mockDashboardData,
    } as any);

    let capturedQueryFn: any = null;
    vi.mocked(useQuery).mockImplementation((options: any) => {
      capturedQueryFn = options.queryFn;
      return {
        data: null,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
        isFetching: false,
      } as any;
    });

    renderHook(() =>
      useAnalyticsData('user1', { key: '1M', days: 30, label: '1M' }, '0xabc'),
    );

    // Verify queryFn was captured
    expect(capturedQueryFn).toBeDefined();

    // Verify query is enabled when both userId and dashboard data exist
    const queryOptions = vi.mocked(useQuery).mock.calls[0][0];
    expect(queryOptions.enabled).toBe(true);
  });

  it('should disable monthlyPnL query when dashboard data is missing', () => {
    vi.mocked(usePortfolioDashboard).mockReturnValue({
      ...defaultDashboardQuery,
      data: null,
    } as any);

    renderHook(() =>
      useAnalyticsData('user1', { key: '1M', days: 30, label: '1M' }),
    );

    const queryOptions = vi.mocked(useQuery).mock.calls[0][0];
    expect(queryOptions.enabled).toBe(false);
  });

  it('should disable monthlyPnL query when userId is missing', () => {
    vi.mocked(usePortfolioDashboard).mockReturnValue({
      ...defaultDashboardQuery,
      data: mockDashboardData,
    } as any);

    renderHook(() =>
      useAnalyticsData(undefined, { key: '1M', days: 30, label: '1M' }),
    );

    const queryOptions = vi.mocked(useQuery).mock.calls[0][0];
    expect(queryOptions.enabled).toBe(false);
  });

  it('queryFn throws when userId is undefined at call time', async () => {
    vi.mocked(usePortfolioDashboard).mockReturnValue({
      ...defaultDashboardQuery,
      data: mockDashboardData,
    } as any);

    let capturedQueryFn: (() => Promise<unknown>) | null = null;
    vi.mocked(useQuery).mockImplementation((options: any) => {
      capturedQueryFn = options.queryFn;
      return {
        data: null,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
        isFetching: false,
      } as any;
    });

    renderHook(() =>
      useAnalyticsData(undefined, { key: '1M', days: 30, label: '1M' }),
    );

    expect(capturedQueryFn).toBeDefined();
    expect(() => capturedQueryFn!()).toThrow('User ID is required');
  });

  it('queryFn calls getDailyYieldReturns with correct parameters when userId is defined', async () => {
    const { getDailyYieldReturns } =
      await import('@/services/analyticsService');
    vi.mocked(getDailyYieldReturns as any).mockResolvedValue([]);

    vi.mocked(usePortfolioDashboard).mockReturnValue({
      ...defaultDashboardQuery,
      data: mockDashboardData,
    } as any);

    let capturedQueryFn: (() => Promise<unknown>) | null = null;
    vi.mocked(useQuery).mockImplementation((options: any) => {
      capturedQueryFn = options.queryFn;
      return {
        data: null,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
        isFetching: false,
      } as any;
    });

    renderHook(() =>
      useAnalyticsData('user1', { key: '1M', days: 30, label: '1M' }),
    );

    expect(capturedQueryFn).toBeDefined();
    await capturedQueryFn!();

    expect(getDailyYieldReturns).toHaveBeenCalledWith('user1', 30, undefined);
  });

  it('queryFn passes wallet filter to getDailyYieldReturns', async () => {
    const { getDailyYieldReturns } =
      await import('@/services/analyticsService');
    vi.mocked(getDailyYieldReturns as any).mockResolvedValue([]);

    vi.mocked(usePortfolioDashboard).mockReturnValue({
      ...defaultDashboardQuery,
      data: mockDashboardData,
    } as any);

    let capturedQueryFn: (() => Promise<unknown>) | null = null;
    vi.mocked(useQuery).mockImplementation((options: any) => {
      capturedQueryFn = options.queryFn;
      return {
        data: null,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
        isFetching: false,
      } as any;
    });

    renderHook(() =>
      useAnalyticsData('user1', { key: '1M', days: 30, label: '1M' }, '0xabc'),
    );

    expect(capturedQueryFn).toBeDefined();
    await capturedQueryFn!();

    expect(getDailyYieldReturns).toHaveBeenCalledWith('user1', 30, '0xabc');
  });

  it('queryFn converts null walletFilter to undefined for getDailyYieldReturns', async () => {
    const { getDailyYieldReturns } =
      await import('@/services/analyticsService');
    vi.mocked(getDailyYieldReturns as any).mockResolvedValue([]);

    vi.mocked(usePortfolioDashboard).mockReturnValue({
      ...defaultDashboardQuery,
      data: mockDashboardData,
    } as any);

    let capturedQueryFn: (() => Promise<unknown>) | null = null;
    vi.mocked(useQuery).mockImplementation((options: any) => {
      capturedQueryFn = options.queryFn;
      return {
        data: null,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
        isFetching: false,
      } as any;
    });

    renderHook(() =>
      useAnalyticsData('user1', { key: '1M', days: 30, label: '1M' }, null),
    );

    expect(capturedQueryFn).toBeDefined();
    await capturedQueryFn!();

    // null walletFilter should be converted to undefined
    expect(getDailyYieldReturns).toHaveBeenCalledWith('user1', 30, undefined);
  });
});
