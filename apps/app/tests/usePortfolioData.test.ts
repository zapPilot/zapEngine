import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  portfolioDaysForRange,
  usePortfolioData,
} from '../src/integration/usePortfolioData';

const useLandingPageDataMock = vi.hoisted(() => vi.fn());
const usePortfolioDashboardMock = vi.hoisted(() => vi.fn());
vi.mock('@zapengine/app-core/hooks/analytics', () => ({
  usePortfolioDashboard: usePortfolioDashboardMock,
}));

vi.mock('@zapengine/app-core/hooks/queries', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@zapengine/app-core/hooks/queries')>();

  return {
    ...actual,
    useLandingPageData: useLandingPageDataMock,
  };
});

function mockSettledSources() {
  useLandingPageDataMock.mockReturnValue({
    data: null,
    isLoading: false,
    isError: false,
  });
  usePortfolioDashboardMock.mockReturnValue({
    dashboard: null,
    isLoading: false,
    isError: false,
  });
}

beforeEach(() => {
  useLandingPageDataMock.mockReset();
  usePortfolioDashboardMock.mockReset();
  mockSettledSources();
});

describe('Portfolio data range mapping', () => {
  it('maps portfolio tabs to dashboard windows', () => {
    expect(portfolioDaysForRange('1W')).toBe(7);
    expect(portfolioDaysForRange('1M')).toBe(30);
    expect(portfolioDaysForRange('3M')).toBe(90);
    expect(portfolioDaysForRange('1Y')).toBe(365);
    expect(portfolioDaysForRange('ALL')).toBe(365);
  });
});

describe('usePortfolioData', () => {
  it('keeps the portfolio empty while the user id is still resolving', () => {
    const result = usePortfolioData(null, '1Y', { isResolvingUser: true });

    expect(result).toEqual({ data: null, isLoading: true, isError: false });
    expect(useLandingPageDataMock).toHaveBeenCalledWith(null, false, true);
    expect(usePortfolioDashboardMock).toHaveBeenCalledWith(undefined, {
      trend_days: 365,
      drawdown_days: 365,
      rolling_days: 365,
    });
  });

  it('settles to unavailable portfolio values when no user id is available', () => {
    const result = usePortfolioData(null, '1Y');

    expect(result).toMatchObject({ isLoading: false, isError: false });
    expect(result.data).toMatchObject({
      positionValue: null,
      valueChangePct: null,
      valueChangeUsd: null,
      latestSnapshotChangePct: null,
      trendPoints: [],
      allocation: [],
      lastRebalancedLabel: 'Auto-managed by Zap Strategy',
    });
    expect(result.data?.metrics.map((metric) => metric.value)).toEqual([
      '—',
      '—',
      '—',
      '—',
      '—',
      '—',
      '—',
    ]);
  });

  it('passes the selected range window only to the dashboard query', () => {
    const result = usePortfolioData('user-123', '1W');

    expect(result).toMatchObject({ isLoading: false, isError: false });
    expect(usePortfolioDashboardMock).toHaveBeenCalledWith('user-123', {
      trend_days: 7,
      drawdown_days: 7,
      rolling_days: 7,
    });
  });

  it('surfaces connected live misses as unavailable values instead of demo-like data', () => {
    const result = usePortfolioData('user-123', '1Y');

    expect(result).toMatchObject({ isLoading: false, isError: false });
    expect(result.data).toMatchObject({
      positionValue: null,
      valueChangePct: null,
      valueChangeUsd: null,
      latestSnapshotChangePct: null,
      trendPoints: [],
      allocation: [],
      lastRebalancedLabel: 'Auto-managed by Zap Strategy',
    });
    expect(result.data?.metrics.map((metric) => metric.value)).toEqual([
      '—',
      '—',
      '—',
      '—',
      '—',
      '—',
      '—',
    ]);
    expect(result.data?.metrics.map((metric) => metric.label)).toEqual([
      'Value change',
      'Current APY',
      '7D value change',
      '30D value change',
      'Max drawdown',
      'Volatility',
      'Sharpe',
    ]);
    expect(usePortfolioDashboardMock).toHaveBeenCalledWith('user-123', {
      trend_days: 365,
      drawdown_days: 365,
      rolling_days: 365,
    });
  });

  it('calculates returns and latest daily change from chronological trend order', () => {
    usePortfolioDashboardMock.mockReturnValue({
      dashboard: {
        trends: {
          daily_values: [
            {
              date: '2026-06-29',
              total_value_usd: 1250,
              change_percentage: 2.5,
            },
            {
              date: '2026-05-30',
              total_value_usd: 1000,
              change_percentage: 1.2,
            },
            {
              date: '2026-06-22',
              total_value_usd: 1100,
              change_percentage: -0.5,
            },
          ],
        },
      },
      isLoading: false,
      isError: false,
    });

    const result = usePortfolioData('user-123', '1Y');

    expect(result.data).toMatchObject({
      valueChangePct: 25,
      valueChangeUsd: 250,
      latestSnapshotChangePct: (150 / 1100) * 100,
      latestSnapshotDate: '2026-06-29',
    });
    expect(result.data?.metrics[0]).toEqual({
      label: 'Value change',
      value: '+25.0%',
      tone: 'positive',
    });
    expect(result.data?.metrics[2]).toEqual({
      label: '7D value change',
      value: '+13.6%',
      tone: 'positive',
    });
  });

  it('maps partial live portfolio analytics and reports upstream errors', () => {
    useLandingPageDataMock.mockReturnValue({
      data: {
        net_portfolio_value: 1500,
        portfolio_roi: { recommended_yearly_roi: 12.34 },
      },
      isLoading: false,
      isError: true,
    });
    usePortfolioDashboardMock.mockReturnValue({
      dashboard: {
        trends: {
          daily_values: [
            {
              date: '2026-05-30',
              total_value_usd: 1000,
              change_percentage: 1.2,
            },
            {
              date: '2026-06-22',
              total_value_usd: 1100,
              change_percentage: -0.5,
            },
            {
              date: '2026-06-29',
              total_value_usd: 1250,
              change_percentage: 2.5,
            },
          ],
        },
        drawdown_analysis: {
          enhanced: { summary: { max_drawdown_pct: -8.25 } },
        },
        rolling_analytics: {
          volatility: {
            rolling_volatility_data: [{ annualized_volatility_pct: 13.456 }],
          },
          sharpe: {
            rolling_sharpe_data: [{ rolling_sharpe_ratio: 1.234 }],
          },
        },
      },
      isLoading: false,
      isError: false,
    });
    const result = usePortfolioData('user-123', '1Y');

    expect(result).toMatchObject({ isLoading: false, isError: true });
    expect(result.data).toMatchObject({
      positionValue: 1500,
      valueChangePct: 25,
      valueChangeUsd: 250,
      latestSnapshotChangePct: (150 / 1100) * 100,
      latestSnapshotDate: '2026-06-29',
    });
    expect(result.data?.metrics).toEqual([
      { label: 'Value change', value: '+25.0%', tone: 'positive' },
      { label: 'Current APY', value: '12.3%', tone: 'accent' },
      { label: '7D value change', value: '+13.6%', tone: 'positive' },
      { label: '30D value change', value: '+25.0%', tone: 'positive' },
      { label: 'Max drawdown', value: '−8.3%', tone: 'negative' },
      { label: 'Volatility', value: '13.5%', tone: 'neutral' },
      { label: 'Sharpe', value: '1.23', tone: 'accent' },
    ]);
    expect(result.data?.metrics.map((metric) => metric.label)).not.toContain(
      'Fees paid',
    );
    expect(result.data?.metrics.map((metric) => metric.label)).not.toContain(
      'Gas saved',
    );
    expect(result.data?.metrics.map((metric) => metric.label)).not.toContain(
      'Realized yield',
    );
  });
});
