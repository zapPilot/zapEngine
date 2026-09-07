import { queryKeys } from '@zapengine/app-core/lib/state/queryClient';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEMO } from '../src/data/demo';
import { portfolioDaysForRange } from '../src/integration/usePortfolioData';
import {
  calculateHomeRangeChange,
  DEFAULT_HOME_RANGE,
  getHomeDashboardWindowParams,
  sliceHomeDailyValuesForRange,
  useHomeData,
} from '../src/integration/useHomeData';

const usePortfolioDashboardMock = vi.hoisted(() => vi.fn());
const useLandingPageDataMock = vi.hoisted(() => vi.fn());
const useStrategySuggestionMock = vi.hoisted(() => vi.fn());
const useDailyYieldReturnsMock = vi.hoisted(() => vi.fn());

vi.mock('react', () => ({
  useMemo: <T>(factory: () => T): T => factory(),
}));

vi.mock('@zapengine/app-core/hooks/analytics/usePortfolioDashboard', () => ({
  usePortfolioDashboard: usePortfolioDashboardMock,
}));

// Fully replaced rather than partially: `react` is stubbed down to useMemo
// above, so loading the real query package here would be loading it against a
// React that barely exists.
vi.mock('@zapengine/app-core/hooks/queries', () => ({
  useDailyYieldReturns: useDailyYieldReturnsMock,
  useLandingPageData: useLandingPageDataMock,
}));

vi.mock('@/integration/useStrategySuggestion', () => ({
  useStrategySuggestion: useStrategySuggestionMock,
}));

/** The raw `useLandingPageData` result shape, with only what Home reads set. */
function landingResult(
  overrides: {
    data?: {
      net_portfolio_value?: number | null;
      total_net_usd?: number;
      last_updated?: string | null;
    };
    isLoading?: boolean;
    error?: unknown;
  } = {},
) {
  return {
    data: overrides.data,
    isLoading: overrides.isLoading ?? false,
    isError: overrides.error !== undefined,
    error: overrides.error ?? null,
  };
}

function mockSettledSources() {
  useLandingPageDataMock.mockReturnValue(landingResult());
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
  useLandingPageDataMock.mockReset();
  useStrategySuggestionMock.mockReset();
  useDailyYieldReturnsMock.mockReset();
  mockSettledSources();
});

describe('Home data analytics subject', () => {
  it('does not have a wallet-address parameter that can leak into analytics paths', () => {
    useHomeData(null, '1Y');

    expect(useLandingPageDataMock).toHaveBeenCalledWith(null, false, true);
    expect(usePortfolioDashboardMock).toHaveBeenCalledWith(
      undefined,
      getHomeDashboardWindowParams(),
    );
  });

  it('passes a bundle-view subject id through verbatim', () => {
    useHomeData('5fc63d4e-4e07-47d8-840b-ccd3420d553f', '1Y');

    expect(useLandingPageDataMock).toHaveBeenCalledWith(
      '5fc63d4e-4e07-47d8-840b-ccd3420d553f',
      false,
      true,
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
      metrics: ['trend'],
    });
  });

  it('asks the dashboard for the trend alone', () => {
    // Home reads `trends.daily_values` only. Drawdown and rolling windows cost
    // four more backend service calls per request and nothing renders them.
    const params: Record<string, unknown> = getHomeDashboardWindowParams();
    expect(params.drawdown_days).toBeUndefined();
    expect(params.rolling_days).toBeUndefined();
  });

  it('hands react-query one stable window object', () => {
    // A fresh literal per render would rebuild the query key every time.
    expect(getHomeDashboardWindowParams()).toBe(getHomeDashboardWindowParams());
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

  it('no longer shares a dashboard cache entry with Portfolio at 1Y', () => {
    const portfolioDays = portfolioDaysForRange('1Y');
    // What `usePortfolioData` sends for the same user at 1Y.
    const portfolioKey = queryKeys.portfolioDashboard.detail('user-123', {
      trend_days: portfolioDays,
      drawdown_days: portfolioDays,
      rolling_days: portfolioDays,
    });
    const homeKey = queryKeys.portfolioDashboard.detail(
      'user-123',
      getHomeDashboardWindowParams(),
    );

    // Accepted cost of the narrower request: Home -> Portfolio now pays for one
    // extra dashboard fetch instead of reusing the shared entry.
    expect(homeKey).not.toEqual(portfolioKey);
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
    expect(useLandingPageDataMock).toHaveBeenCalledWith(null, false, true);
  });

  it('keeps disconnected users on demo data without surfacing a live error', () => {
    const result = useHomeData(null, '1W');

    expect(result).toMatchObject({ isLoading: false, isError: false });
    expect(result.data.home.totalBalance).toBe(DEMO.home.totalBalance);
    expect(result.data.strategyStatus).toMatchObject({ status: 'no_action' });
    expect(usePortfolioDashboardMock).toHaveBeenCalledWith(undefined, {
      trend_days: 365,
      metrics: ['trend'],
    });
  });

  it('surfaces connected live misses without falling back to demo balances', () => {
    useLandingPageDataMock.mockReturnValue(landingResult());

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
      metrics: ['trend'],
    });
  });

  it('treats a missing snapshot as unavailable instead of a zero balance', () => {
    useLandingPageDataMock.mockReturnValue(
      landingResult({ data: { net_portfolio_value: 0, last_updated: null } }),
    );

    const result = useHomeData('user-123', '1Y');

    expect(result.snapshotAvailability).toBe('unavailable');
    expect(result.data.home.totalBalance).toBeNull();
  });

  it('preserves a legitimate zero balance when a snapshot timestamp exists', () => {
    useLandingPageDataMock.mockReturnValue(
      landingResult({
        data: {
          net_portfolio_value: 0,
          last_updated: '2026-08-02T00:00:00.000Z',
        },
      }),
    );

    const result = useHomeData('user-123', '1Y');

    expect(result.snapshotAvailability).toBe('available');
    expect(result.data.home.totalBalance).toBe(0);
  });

  it('forwards the active ETL state to the landing query', () => {
    useHomeData('user-123', '1Y', { isEtlInProgress: true });

    expect(useLandingPageDataMock).toHaveBeenCalledWith('user-123', true, true);
  });

  it('keeps chart and performance semantics aligned to the selected range', () => {
    useLandingPageDataMock.mockReturnValue(
      landingResult({
        data: {
          net_portfolio_value: 130,
          last_updated: '2026-08-22T00:00:00.000Z',
        },
      }),
    );
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
    useLandingPageDataMock.mockReturnValue(
      landingResult({
        data: {
          net_portfolio_value: 1234,
          last_updated: '2026-08-02T00:00:00.000Z',
        },
        error: new Error('balance failed'),
      }),
    );
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
    // A snapshot already in hand outranks the error it arrived with.
    expect(result.snapshotAvailability).toBe('available');
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

describe('Home section states', () => {
  const snapshot = {
    net_portfolio_value: 130,
    last_updated: '2026-08-22T00:00:00.000Z',
  };

  it('lets the balance land while the chart and the strategy card wait', () => {
    useLandingPageDataMock.mockReturnValue(landingResult({ data: snapshot }));
    usePortfolioDashboardMock.mockReturnValue({
      dashboard: null,
      isLoading: true,
      isError: false,
    });
    useStrategySuggestionMock.mockReturnValue({
      data: null,
      isLoading: true,
      isError: false,
    });

    const result = useHomeData('user-123', '1Y');

    expect(result.balance).toEqual({ isLoading: false, isError: false });
    expect(result.trend).toEqual({ isLoading: true, isError: false });
    expect(result.strategy).toEqual({ isLoading: true, isError: false });
    // The aggregate still reports the slowest section, as it always has.
    expect(result.isLoading).toBe(true);
    expect(result.data.home.totalBalance).toBe(130);
  });

  it('attributes each failure to the section that owns it', () => {
    useLandingPageDataMock.mockReturnValue(
      landingResult({ error: new Error('landing down') }),
    );
    usePortfolioDashboardMock.mockReturnValue({
      dashboard: null,
      isLoading: false,
      isError: true,
    });

    const result = useHomeData('user-123', '1Y');

    expect(result.balance.isError).toBe(true);
    expect(result.trend.isError).toBe(true);
    expect(result.strategy.isError).toBe(false);
    expect(result.isError).toBe(true);
  });

  it('holds every section while the analytics subject resolves', () => {
    const result = useHomeData(null, '1Y', { isResolvingSubject: true });

    expect(result.balance.isLoading).toBe(true);
    expect(result.trend.isLoading).toBe(true);
    expect(result.strategy.isLoading).toBe(true);
  });

  it('reads the balance straight off the landing response', () => {
    useLandingPageDataMock.mockReturnValue(
      landingResult({
        data: { net_portfolio_value: 130, last_updated: snapshot.last_updated },
      }),
    );

    expect(useHomeData('user-123', '1Y').data.home.totalBalance).toBe(130);
  });

  it('falls back to total_net_usd when net_portfolio_value is null', () => {
    // A null there is a missing number: reading it as zero would show a
    // funded portfolio as empty.
    useLandingPageDataMock.mockReturnValue(
      landingResult({
        data: {
          net_portfolio_value: null,
          total_net_usd: 4_200,
          last_updated: snapshot.last_updated,
        },
      }),
    );

    expect(useHomeData('user-123', '1Y').data.home.totalBalance).toBe(4_200);
  });
});

describe('Home snapshot classification', () => {
  it('classifies a landing transport failure as failed, not an empty portfolio', () => {
    useLandingPageDataMock.mockReturnValue(
      landingResult({ error: new Error('Network request failed') }),
    );

    const result = useHomeData('user-123', '1Y');

    // `unavailable` drives the import copy and ETL polling; a network blip is
    // not evidence that the portfolio is missing.
    expect(result.snapshotAvailability).toBe('failed');
    expect(result.data.home.totalBalance).toBeNull();
  });

  it.each([
    ['a 404 status', Object.assign(new Error('missing'), { status: 404 })],
    ['a USER_NOT_FOUND message', new Error('USER_NOT_FOUND')],
  ])(
    'keeps an unknown subject reported by %s on the import path',
    (_, error) => {
      useLandingPageDataMock.mockReturnValue(landingResult({ error }));

      expect(useHomeData('user-123', '1Y').snapshotAvailability).toBe(
        'unavailable',
      );
    },
  );

  it('keeps an in-flight import on the import path despite a landing error', () => {
    useLandingPageDataMock.mockReturnValue(
      landingResult({ error: new Error('Network request failed') }),
    );

    const result = useHomeData('user-123', '1Y', { isEtlInProgress: true });

    expect(result.snapshotAvailability).toBe('unavailable');
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
    useLandingPageDataMock.mockReturnValue(
      landingResult({
        data: {
          net_portfolio_value: 130,
          last_updated: '2026-08-22T00:00:00.000Z',
        },
      }),
    );
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
