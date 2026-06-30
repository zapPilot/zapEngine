import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEMO } from '../src/data/demo';
import { type HomeRange, useHomeData } from '../src/integration/useHomeData';

const usePortfolioDashboardMock = vi.hoisted(() => vi.fn());
const usePortfolioDataProgressiveMock = vi.hoisted(() => vi.fn());
const useMoralisWalletAssetsMock = vi.hoisted(() => vi.fn());
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

vi.mock('@/integration/moralisWallet', () => ({
  useMoralisWalletAssets: useMoralisWalletAssetsMock,
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
  useMoralisWalletAssetsMock.mockReturnValue({
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
  useMoralisWalletAssetsMock.mockReset();
  useDefaultStrategyBacktestMock.mockReset();
  useStrategySuggestionMock.mockReset();
  mockSettledSources();
});

describe('useHomeData', () => {
  it('keeps disconnected users on demo data without surfacing a live error', () => {
    const result = useHomeData(null, null, '1W');

    expect(result).toMatchObject({ isLoading: true, isError: false });
    expect(result.data?.home.totalBalance).toBe(DEMO.home.totalBalance);
    expect(result.data?.home.assets).toBe(DEMO.home.assets);
    expect(result.data?.strategy.backtest).toBe(DEMO.strategy.backtest);
    expect(usePortfolioDashboardMock).toHaveBeenCalledWith(undefined, {
      trend_days: 7,
      drawdown_days: 7,
      rolling_days: 7,
    });
  });

  it('surfaces connected live misses without falling back to demo balances or assets', () => {
    usePortfolioDataProgressiveMock.mockReturnValue({
      sections: {
        balance: { data: null, isLoading: false, error: null },
        strategy: { data: null, isLoading: false, error: null },
      },
    });
    useMoralisWalletAssetsMock.mockReturnValue({
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
      trend_days: 30,
      drawdown_days: 30,
      rolling_days: 30,
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
    useMoralisWalletAssetsMock.mockReturnValue({
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
