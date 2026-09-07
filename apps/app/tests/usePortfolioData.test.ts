// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_PORTFOLIO_RANGE,
  portfolioDaysForRange,
  usePortfolioData,
  type UsePortfolioDataResult,
} from '../src/integration/usePortfolioData';

const useLandingPageDataMock = vi.hoisted(() => vi.fn());
const usePortfolioDashboardMock = vi.hoisted(() => vi.fn());
const useDailyYieldReturnsMock = vi.hoisted(() => vi.fn());
vi.mock('@zapengine/app-core/hooks/analytics', () => ({
  usePortfolioDashboard: usePortfolioDashboardMock,
}));

// These tests call the hook as a plain function, so its React Query observers
// have to be stubbed. Partial, because the rest of the package loads for real.
vi.mock('@zapengine/app-core/hooks/queries', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@zapengine/app-core/hooks/queries')>();

  return {
    ...actual,
    useLandingPageData: useLandingPageDataMock,
    useDailyYieldReturns: useDailyYieldReturnsMock,
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
  useDailyYieldReturnsMock.mockReturnValue({ data: undefined });
}

/**
 * `usePortfolioData` memoizes its trend series, so it has to run inside a real
 * render rather than as a plain function call. One throwaway mount per case
 * keeps them as independent as the direct calls were.
 */
function renderPortfolioData(
  ...args: Parameters<typeof usePortfolioData>
): UsePortfolioDataResult {
  const container = document.createElement('div');
  const root = createRoot(container);
  const results: UsePortfolioDataResult[] = [];
  function Probe() {
    results.push(usePortfolioData(...args));
    return null;
  }

  act(() => {
    root.render(createElement(Probe));
  });
  act(() => {
    root.unmount();
  });

  const result = results.at(-1);
  if (!result) throw new Error('usePortfolioData never rendered');
  return result;
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  useLandingPageDataMock.mockReset();
  usePortfolioDashboardMock.mockReset();
  useDailyYieldReturnsMock.mockReset();
  mockSettledSources();
});

describe('Portfolio data range mapping', () => {
  it('defaults Portfolio to one month and maps tabs to dashboard windows', () => {
    expect(DEFAULT_PORTFOLIO_RANGE).toBe('1M');
    expect(portfolioDaysForRange('1W')).toBe(7);
    expect(portfolioDaysForRange('1M')).toBe(30);
    expect(portfolioDaysForRange('3M')).toBe(90);
    expect(portfolioDaysForRange('1Y')).toBe(365);
    expect(portfolioDaysForRange('ALL')).toBe(365);
  });
});

describe('usePortfolioData', () => {
  it('keeps the portfolio empty while the user id is still resolving', () => {
    const result = renderPortfolioData(null, '1Y', { isResolvingUser: true });

    expect(result).toEqual({ data: null, isLoading: true, isError: false });
    expect(useLandingPageDataMock).toHaveBeenCalledWith(null, false, true);
    expect(usePortfolioDashboardMock).toHaveBeenCalledWith(undefined, {
      trend_days: 365,
      drawdown_days: 365,
      rolling_days: 365,
    });
  });

  it('settles to unavailable portfolio values when no user id is available', () => {
    const result = renderPortfolioData(null, '1Y');

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
    const result = renderPortfolioData('user-123', '1W');

    expect(result).toMatchObject({ isLoading: false, isError: false });
    expect(usePortfolioDashboardMock).toHaveBeenCalledWith('user-123', {
      trend_days: 7,
      drawdown_days: 7,
      rolling_days: 7,
    });
  });

  it('surfaces connected live misses as unavailable values instead of demo-like data', () => {
    const result = renderPortfolioData('user-123', '1Y');

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

    const result = renderPortfolioData('user-123', '1Y');

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
    const result = renderPortfolioData('user-123', '1Y');

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

  it('reads short-range attribution without requesting a full year', () => {
    usePortfolioDashboardMock.mockReturnValue({
      dashboard: {
        trends: {
          daily_values: [
            { date: '2026-06-28', total_value_usd: 1000 },
            { date: '2026-06-29', total_value_usd: 1050 },
          ],
        },
      },
      isLoading: false,
      isError: false,
    });
    useDailyYieldReturnsMock.mockReturnValue({
      data: {
        user_id: 'user-123',
        period: {
          start_date: '2026-06-28',
          end_date: '2026-06-29',
          days: 2,
        },
        daily_returns: [
          {
            date: '2026-06-29',
            protocol_name: 'Aave',
            chain: 'ethereum',
            position_type: 'Lending',
            yield_return_usd: 30,
            tokens: [],
          },
        ],
      },
    });

    const result = renderPortfolioData('user-123', '1W');

    expect(useDailyYieldReturnsMock).toHaveBeenCalledWith('user-123', 30);
    expect(result.data?.trendPoints.at(-1)?.attribution).toEqual([
      { kind: 'protocol', label: 'Aave', valueUsd: 30 },
      { kind: 'residual', valueUsd: 20 },
    ]);
  });

  it('uses the selected 3M window for attribution', () => {
    renderPortfolioData('user-123', '3M');

    expect(useDailyYieldReturnsMock).toHaveBeenCalledWith('user-123', 90);
  });

  it('keeps 1Y and ALL attribution disabled while leaving their charts available', () => {
    renderPortfolioData('user-123', '1Y');
    expect(useDailyYieldReturnsMock).toHaveBeenLastCalledWith(undefined, 30);

    renderPortfolioData('user-123', 'ALL');
    expect(useDailyYieldReturnsMock).toHaveBeenLastCalledWith(undefined, 30);
  });

  it('leaves the trend unattributed while the attribution query has no data', () => {
    usePortfolioDashboardMock.mockReturnValue({
      dashboard: {
        trends: {
          daily_values: [
            { date: '2026-06-28', total_value_usd: 1000 },
            { date: '2026-06-29', total_value_usd: 11_000 },
          ],
        },
      },
      isLoading: false,
      isError: false,
    });

    const result = renderPortfolioData('user-123', '1W');

    expect(
      result.data?.trendPoints.every(
        (point) => point.attribution === undefined,
      ),
    ).toBe(true);
  });
});
