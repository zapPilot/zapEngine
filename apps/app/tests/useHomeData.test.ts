import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEMO } from '../src/data/demo';
import {
  DEFAULT_HOME_RANGE,
  getHomeDashboardWindowParams,
  type HomeRange,
  sliceHomeDailyValuesForRange,
  useHomeData,
} from '../src/integration/useHomeData';

const usePortfolioDashboardMock = vi.hoisted(() => vi.fn());
const usePortfolioDataProgressiveMock = vi.hoisted(() => vi.fn());
const useWalletAssetsMock = vi.hoisted(() => vi.fn());
const useDefaultStrategyBacktestMock = vi.hoisted(() => vi.fn());
const useStrategySuggestionMock = vi.hoisted(() => vi.fn());

vi.mock('@zapengine/app-core/hooks/analytics/usePortfolioDashboard', () => ({
  usePortfolioDashboard: usePortfolioDashboardMock,
}));

vi.mock(
  '@zapengine/app-core/hooks/queries/analytics/usePortfolioDataProgressive',
  () => ({
    usePortfolioDataProgressive: usePortfolioDataProgressiveMock,
  }),
);

vi.mock('@/integration/walletTokens', () => ({
  useWalletAssets: useWalletAssetsMock,
}));

vi.mock('@/integration/useDefaultStrategyBacktest', () => ({
  useDefaultStrategyBacktest: useDefaultStrategyBacktestMock,
}));

vi.mock('@/integration/useStrategySuggestion', () => ({
  toCompositionTargetFromSuggestion: () => null,
  useStrategySuggestion: useStrategySuggestionMock,
}));

function mockSettledSources() {
  usePortfolioDataProgressiveMock.mockReturnValue({ sections: {} });
  usePortfolioDashboardMock.mockReturnValue({
    dashboard: null,
    isLoading: false,
    isError: false,
  });
  useWalletAssetsMock.mockReturnValue({
    assets: [],
    isConnected: false,
    isLoading: false,
    isError: false,
  });
  useDefaultStrategyBacktestMock.mockReturnValue({ data: null });
  useStrategySuggestionMock.mockReturnValue({
    data: null,
    isLoading: false,
    isError: false,
  });
}

beforeEach(() => {
  usePortfolioDashboardMock.mockReset();
  usePortfolioDataProgressiveMock.mockReset();
  useWalletAssetsMock.mockReset();
  useDefaultStrategyBacktestMock.mockReset();
  useStrategySuggestionMock.mockReset();
  mockSettledSources();
});

describe('Home data analytics subject', () => {
  it('never forwards a wallet address to the UUID-typed analytics paths', () => {
    useHomeData(null, '0x1234567890123456789012345678901234567890', '1Y');

    expect(usePortfolioDataProgressiveMock).toHaveBeenCalledWith(null);
    expect(usePortfolioDashboardMock).toHaveBeenCalledWith(
      undefined,
      getHomeDashboardWindowParams(),
    );
  });

  it('passes a bundle-view subject id through verbatim', () => {
    useHomeData('5fc63d4e-4e07-47d8-840b-ccd3420d553f', null, '1Y');

    expect(usePortfolioDataProgressiveMock).toHaveBeenCalledWith(
      '5fc63d4e-4e07-47d8-840b-ccd3420d553f',
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
});

describe('useHomeData', () => {
  it('queries spendable assets for the active signer only', () => {
    useHomeData('user-123', '0xactive', '1Y');

    expect(useWalletAssetsMock).toHaveBeenCalledWith('0xactive');
  });

  it('shows the live loading state while the backend user record resolves', () => {
    const result = useHomeData(null, '0xabc', '1W', {
      isResolvingSubject: true,
    });

    expect(result).toMatchObject({ isLoading: true, isError: false });
    expect(result.data?.home.totalBalance).toBeNull();
    expect(result.data?.home.assets).not.toBe(DEMO.home.assets);
    expect(usePortfolioDataProgressiveMock).toHaveBeenCalledWith(null);
  });

  it('keeps disconnected users on demo data without surfacing a live error', () => {
    const result = useHomeData(null, null, '1W');

    expect(result).toMatchObject({ isLoading: false, isError: false });
    expect(result.data?.home.totalBalance).toBe(DEMO.home.totalBalance);
    expect(result.data?.home.assets).toBe(DEMO.home.assets);
    expect(result.data?.strategy.backtest).toBe(DEMO.strategy.backtest);
    expect(usePortfolioDashboardMock).toHaveBeenCalledWith(undefined, {
      trend_days: 365,
      drawdown_days: 365,
      rolling_days: 365,
    });
  });

  it('surfaces connected live misses without falling back to demo balances or assets', () => {
    usePortfolioDataProgressiveMock.mockReturnValue({
      sections: {
        balance: { data: null, isLoading: false, error: null },
        strategy: { data: null, isLoading: false, error: null },
      },
    });
    useWalletAssetsMock.mockReturnValue({
      assets: [],
      isConnected: true,
      isLoading: false,
      isError: false,
    });

    const result = useHomeData('user-123', '0xabc', '1M');

    expect(result).toMatchObject({ isLoading: false, isError: false });
    expect(result.data?.home).toMatchObject({
      totalBalance: null,
      changePct: null,
      changeUsdToday: null,
      sparkline: [],
      assets: [],
    });
    expect(result.data?.strategy.backtest).toMatchObject({
      returnLabel: '—',
      currentModeLabel: '—',
      allocation: [],
      sentiment: null,
    });
    expect(result.data?.strategy.backtest).not.toBe(DEMO.strategy.backtest);
    expect(usePortfolioDashboardMock).toHaveBeenCalledWith('user-123', {
      trend_days: 365,
      drawdown_days: 365,
      rolling_days: 365,
    });
  });

  it('reports upstream errors while preserving partial live data', () => {
    usePortfolioDataProgressiveMock.mockReturnValue({
      sections: {
        balance: {
          data: { balance: 1234 },
          isLoading: false,
          error: new Error('balance failed'),
        },
        strategy: {
          data: {
            sentimentQuote: 'Stay patient.',
            currentRegime: 'Neutral',
          },
          isLoading: false,
          error: null,
        },
      },
    });
    usePortfolioDashboardMock.mockReturnValue({
      dashboard: {
        trends: {
          daily_values: [
            { total_value_usd: 1000, change_percentage: 1.5, pnl_usd: 15 },
            { total_value_usd: 1234, change_percentage: -0.5, pnl_usd: -6 },
          ],
        },
      },
      isLoading: false,
      isError: true,
    });
    useWalletAssetsMock.mockReturnValue({
      assets: [{ symbol: 'ETH' }],
      isConnected: true,
      isLoading: false,
      isError: true,
    });

    const result = useHomeData('user-123', '0xabc', 'ALL' as HomeRange);

    expect(result).toMatchObject({ isLoading: false, isError: true });
    expect(result.data?.home).toMatchObject({
      totalBalance: 1234,
      changePct: -0.5,
      changeUsdToday: -6,
      sparkline: [1000, 1234],
      assets: [{ symbol: 'ETH' }],
    });
    expect(result.data?.strategy.quote).toBe('Stay patient.');
    expect(usePortfolioDashboardMock).toHaveBeenCalledWith('user-123', {
      trend_days: 365,
      drawdown_days: 365,
      rolling_days: 365,
    });
  });
});
