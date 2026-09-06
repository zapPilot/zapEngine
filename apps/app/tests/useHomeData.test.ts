import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEMO } from '../src/data/demo';
import {
  calculateHomeRangeChange,
  DEFAULT_HOME_RANGE,
  getHomeDashboardWindowParams,
  sliceHomeDailyValuesForRange,
  useHomeData,
} from '../src/integration/useHomeData';

const usePortfolioDashboardMock = vi.hoisted(() => vi.fn());
const usePortfolioDataProgressiveMock = vi.hoisted(() => vi.fn());
const useStrategySuggestionMock = vi.hoisted(() => vi.fn());
const useDailyYieldReturnsMock = vi.hoisted(() => vi.fn());

vi.mock('react', () => ({
  useMemo: <T>(factory: () => T): T => factory(),
}));

vi.mock('@zapengine/app-core/hooks/analytics/usePortfolioDashboard', () => ({
  usePortfolioDashboard: usePortfolioDashboardMock,
}));

vi.mock(
  '@zapengine/app-core/hooks/queries/analytics/usePortfolioDataProgressive',
  () => ({
    usePortfolioDataProgressive: usePortfolioDataProgressiveMock,
  }),
);

// Fully replaced rather than partially: `react` is stubbed down to useMemo
// above, so loading the real query package here would be loading it against a
// React that barely exists.
vi.mock('@zapengine/app-core/hooks/queries', () => ({
  useDailyYieldReturns: useDailyYieldReturnsMock,
}));

vi.mock('@/integration/useStrategySuggestion', () => ({
  useStrategySuggestion: useStrategySuggestionMock,
}));

function mockSettledSources() {
  usePortfolioDataProgressiveMock.mockReturnValue({
    unifiedData: null,
    sections: {},
  });
  usePortfolioDashboardMock.mockReturnValue({
    dashboard: null,
    isLoading: false,
    isError: false,
  });
  useStrategySuggestionMock.mockReturnValue({
    data: null,
    isLoading: false,
    isError: false,
  });
  useDailyYieldReturnsMock.mockReturnValue({ data: undefined });
}

beforeEach(() => {
  usePortfolioDashboardMock.mockReset();
  usePortfolioDataProgressiveMock.mockReset();
  useStrategySuggestionMock.mockReset();
  useDailyYieldReturnsMock.mockReset();
  mockSettledSources();
});

describe('Home data analytics subject', () => {
  it('does not have a wallet-address parameter that can leak into analytics paths', () => {
    useHomeData(null, '1Y');

    expect(usePortfolioDataProgressiveMock).toHaveBeenCalledWith(null, false);
    expect(usePortfolioDashboardMock).toHaveBeenCalledWith(
      undefined,
      getHomeDashboardWindowParams(),
    );
  });

  it('passes a bundle-view subject id through verbatim', () => {
    useHomeData('5fc63d4e-4e07-47d8-840b-ccd3420d553f', '1Y');

    expect(usePortfolioDataProgressiveMock).toHaveBeenCalledWith(
      '5fc63d4e-4e07-47d8-840b-ccd3420d553f',
      false,
    );
  });
});

describe('Home data historical dashboard window', () => {
  const dailyValues = [
    { date: '2026-05-20T00:00:00', total_value_usd: 100 },
    { date: '2026-06-22T00:00:00', total_value_usd: 200 },
    { date: '2026-06-23T00:00:00', total_value_usd: 210 },
    { date: '2026-06-29T00:00:00', total_value_usd: 220 },
  ];

  it('defaults the Home chart to a historical one-year view', () => {
    expect(DEFAULT_HOME_RANGE).toBe('1Y');
    expect(getHomeDashboardWindowParams()).toEqual({
      trend_days: 365,
      drawdown_days: 365,
      rolling_days: 365,
    });
  });

  it('slices the 365-day dashboard series locally for shorter ranges', () => {
    expect(sliceHomeDailyValuesForRange(dailyValues, '1W')).toEqual([
      dailyValues[1],
      dailyValues[2],
      dailyValues[3],
    ]);
    expect(sliceHomeDailyValuesForRange(dailyValues, '1D')).toEqual([
      dailyValues[2],
      dailyValues[3],
    ]);
    expect(sliceHomeDailyValuesForRange(dailyValues, '1Y')).toEqual(
      dailyValues,
    );
  });

  it('calculates performance from the first and last point in the selected range', () => {
    expect(calculateHomeRangeChange(dailyValues)).toEqual({
      usd: 120,
      pct: 120,
    });
    expect(calculateHomeRangeChange(dailyValues.slice(-2))).toEqual({
      usd: 10,
      pct: (10 / 210) * 100,
    });
  });
});

describe('useHomeData', () => {
  it('shows the live loading state while the backend user record resolves', () => {
    const result = useHomeData(null, '1W', {
      isResolvingSubject: true,
    });

    expect(result).toMatchObject({ isLoading: true, isError: false });
    expect(result.data.home.totalBalance).toBeNull();
    expect(result.data.strategyStatus).toBeNull();
    expect(usePortfolioDataProgressiveMock).toHaveBeenCalledWith(null, false);
  });

  it('keeps disconnected users on demo data without surfacing a live error', () => {
    const result = useHomeData(null, '1W');

    expect(result).toMatchObject({ isLoading: false, isError: false });
    expect(result.data.home.totalBalance).toBe(DEMO.home.totalBalance);
    expect(result.data.strategyStatus).toMatchObject({ status: 'no_action' });
    expect(usePortfolioDashboardMock).toHaveBeenCalledWith(undefined, {
      trend_days: 365,
      drawdown_days: 365,
      rolling_days: 365,
    });
  });

  it('surfaces connected live misses without falling back to demo balances', () => {
    usePortfolioDataProgressiveMock.mockReturnValue({
      sections: {
        balance: { data: null, isLoading: false, error: null },
      },
    });

    const result = useHomeData('user-123', '1M');

    expect(result).toMatchObject({ isLoading: false, isError: false });
    expect(result.data.home).toMatchObject({
      totalBalance: null,
      rangeChangePct: null,
      rangeChangeUsd: null,
      trendPoints: [],
    });
    expect(result.data.strategyStatus).toBeNull();
    expect(usePortfolioDashboardMock).toHaveBeenCalledWith('user-123', {
      trend_days: 365,
      drawdown_days: 365,
      rolling_days: 365,
    });
  });

  it('treats a missing snapshot as unavailable instead of a zero balance', () => {
    usePortfolioDataProgressiveMock.mockReturnValue({
      unifiedData: { lastUpdated: null },
      sections: {
        balance: {
          data: { balance: 0 },
          isLoading: false,
          error: null,
        },
      },
    });

    const result = useHomeData('user-123', '1Y');

    expect(result.snapshotAvailability).toBe('unavailable');
    expect(result.data.home.totalBalance).toBeNull();
  });

  it('preserves a legitimate zero balance when a snapshot timestamp exists', () => {
    usePortfolioDataProgressiveMock.mockReturnValue({
      unifiedData: { lastUpdated: '2026-08-02T00:00:00.000Z' },
      sections: {
        balance: {
          data: { balance: 0 },
          isLoading: false,
          error: null,
        },
      },
    });

    const result = useHomeData('user-123', '1Y');

    expect(result.snapshotAvailability).toBe('available');
    expect(result.data.home.totalBalance).toBe(0);
  });

  it('forwards the active ETL state to the landing query', () => {
    useHomeData('user-123', '1Y', { isEtlInProgress: true });

    expect(usePortfolioDataProgressiveMock).toHaveBeenCalledWith(
      'user-123',
      true,
    );
  });

  it('keeps chart and performance semantics aligned to the selected range', () => {
    usePortfolioDataProgressiveMock.mockReturnValue({
      unifiedData: { lastUpdated: '2026-08-22T00:00:00.000Z' },
      sections: {
        balance: {
          data: { balance: 130 },
          isLoading: false,
          error: null,
        },
      },
    });
    usePortfolioDashboardMock.mockReturnValue({
      dashboard: {
        trends: {
          daily_values: [
            { date: '2026-07-01', total_value_usd: 100 },
            { date: '2026-08-15', total_value_usd: 120 },
            { date: '2026-08-22', total_value_usd: 130 },
          ],
        },
      },
      isLoading: false,
      isError: false,
    });

    const result = useHomeData('user-123', '1W');

    expect(result.data.home.trendPoints).toEqual([
      expect.objectContaining({ total_value_usd: 120 }),
      expect.objectContaining({ total_value_usd: 130 }),
    ]);
    expect(result.data.home.rangeChangeUsd).toBe(10);
    expect(result.data.home.rangeChangePct).toBeCloseTo((10 / 120) * 100);
  });

  it('reports upstream errors while preserving partial live portfolio data', () => {
    usePortfolioDataProgressiveMock.mockReturnValue({
      unifiedData: { lastUpdated: '2026-08-02T00:00:00.000Z' },
      sections: {
        balance: {
          data: { balance: 1234 },
          isLoading: false,
          error: new Error('balance failed'),
        },
      },
    });
    usePortfolioDashboardMock.mockReturnValue({
      dashboard: {
        trends: {
          daily_values: [
            { date: '2026-08-01', total_value_usd: 1000 },
            { date: '2026-08-02', total_value_usd: 1234 },
          ],
        },
      },
      isLoading: false,
      isError: true,
    });

    const result = useHomeData('user-123', '1Y');

    expect(result).toMatchObject({ isLoading: false, isError: true });
    expect(result.data.home).toMatchObject({
      totalBalance: 1234,
      rangeChangeUsd: 234,
    });
    expect(result.data.home.rangeChangePct).toBeCloseTo(23.4);
    expect(result.data.home.trendPoints).toEqual([
      expect.objectContaining({ total_value_usd: 1000 }),
      expect.objectContaining({ total_value_usd: 1234 }),
    ]);
  });
});

describe('Home change attribution', () => {
  const dailyReturn = (
    date: string,
    protocolUsd: number,
    marketUsd: number,
  ) => ({
    date,
    protocol_name: 'Aave',
    chain: 'ethereum',
    yield_return_usd: protocolUsd,
    outlier: false,
    tokens: [
      {
        symbol: 'ETH',
        amount_change: 0,
        current_price: 2_400,
        yield_return_usd: 0,
        market_return_usd: marketUsd,
      },
    ],
  });

  function mockLiveSeries(daily_returns: ReturnType<typeof dailyReturn>[]) {
    usePortfolioDataProgressiveMock.mockReturnValue({
      unifiedData: { lastUpdated: '2026-08-22T00:00:00.000Z' },
      sections: {
        balance: { data: { balance: 130 }, isLoading: false, error: null },
      },
    });
    usePortfolioDashboardMock.mockReturnValue({
      dashboard: {
        trends: {
          daily_values: [
            { date: '2026-07-01', total_value_usd: 100 },
            { date: '2026-08-15', total_value_usd: 120 },
            { date: '2026-08-22', total_value_usd: 130 },
          ],
        },
      },
      isLoading: false,
      isError: false,
    });
    useDailyYieldReturnsMock.mockReturnValue({
      data: { user_id: 'user-123', daily_returns, wallet_returns: [] },
    });
  }

  it('requests one year so Home and Portfolio share a cache slice', () => {
    useHomeData('user-123', '1D');

    expect(useDailyYieldReturnsMock).toHaveBeenCalledWith('user-123', 365);
  });

  it('attributes before slicing, so a range keeps its first point explained', () => {
    mockLiveSeries([dailyReturn('2026-08-15', 5, 12)]);

    const result = useHomeData('user-123', '1W');

    // 2026-08-15 opens the 1W window but its change is measured against
    // 2026-07-01, which only exists in the unsliced series.
    expect(result.data.home.trendPoints[0]?.attribution).toEqual([
      { kind: 'market', label: 'ETH', valueUsd: 12 },
      { kind: 'protocol', label: 'Aave', valueUsd: 5 },
      { kind: 'residual', valueUsd: 3 },
    ]);
  });

  it('keeps the breakdown reconciled with the headline change', () => {
    mockLiveSeries([
      dailyReturn('2026-08-15', 4, 12),
      dailyReturn('2026-08-22', 1, 6),
    ]);

    const { attribution } = useHomeData('user-123', '1W').data.home;

    expect(attribution).not.toBeNull();
    const summary = attribution!;
    expect(summary.netChangeUsd).toBe(10);
    expect(
      summary.marketUsd +
        summary.protocolUsd +
        summary.flowUsd +
        summary.otherUsd,
    ).toBeCloseTo(summary.netChangeUsd);
    expect(summary.gainsUsd + summary.lossesUsd).toBeCloseTo(
      summary.marketUsd + summary.protocolUsd,
    );
    expect(summary.attributedDays).toBe(1);
    expect(summary.totalDays).toBe(1);
  });

  it('hides the breakdown when the endpoint explained nothing', () => {
    mockLiveSeries([]);

    const { attribution } = useHomeData('user-123', '1W').data.home;

    expect(attribution?.attributedDays).toBe(0);
  });

  it('gives the demo preview a breakdown too', () => {
    const { attribution } = useHomeData(null, '1Y').data.home;

    expect(attribution).not.toBeNull();
    expect(attribution!.attributedDays).toBe(attribution!.totalDays);
    expect(attribution!.protocolUsd).toBeGreaterThan(0);
  });
});
