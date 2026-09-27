// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tokens } from '@zapengine/design-tokens/tokens';

import {
  buildDefaultBacktestRequest,
  useDefaultStrategyBacktest,
  viewFromResponse,
} from '../src/integration/useDefaultStrategyBacktest';
import {
  usePortfolioData,
  type UsePortfolioDataResult,
} from '../src/integration/usePortfolioData';

const useQueryMock = vi.hoisted(() => vi.fn());
const getStrategyConfigsMock = vi.hoisted(() => vi.fn());
const runBacktestMock = vi.hoisted(() => vi.fn());
const useLandingPageDataMock = vi.hoisted(() => vi.fn());
const usePortfolioDashboardMock = vi.hoisted(() => vi.fn());
const useDailyYieldReturnsMock = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return { ...actual, useQuery: useQueryMock };
});
vi.mock(
  '@zapengine/app-core/services/strategyService',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@zapengine/app-core/services/strategyService')
      >();
    return { ...actual, getStrategyConfigs: getStrategyConfigsMock };
  },
);
vi.mock(
  '@zapengine/app-core/services/backtestingService',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@zapengine/app-core/services/backtestingService')
      >();
    return { ...actual, runBacktest: runBacktestMock };
  },
);
vi.mock(
  '@zapengine/app-core/hooks/analytics/usePortfolioDashboard',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@zapengine/app-core/hooks/analytics/usePortfolioDashboard')
      >();
    return { ...actual, usePortfolioDashboard: usePortfolioDashboardMock };
  },
);
vi.mock(
  '@zapengine/app-core/hooks/queries/analytics/usePortfolioQuery',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@zapengine/app-core/hooks/queries/analytics/usePortfolioQuery')
      >();
    return { ...actual, useLandingPageData: useLandingPageDataMock };
  },
);
vi.mock(
  '@zapengine/app-core/hooks/queries/analytics/useDailyYieldReturns',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@zapengine/app-core/hooks/queries/analytics/useDailyYieldReturns')
      >();
    return { ...actual, useDailyYieldReturns: useDailyYieldReturnsMock };
  },
);

type BacktestConfigsInput = Parameters<typeof buildDefaultBacktestRequest>[0];
type BacktestResponseInput = Parameters<typeof viewFromResponse>[0];

function backtestConfigs(value: unknown): BacktestConfigsInput {
  return value as BacktestConfigsInput;
}

function backtestResponse(value: unknown): BacktestResponseInput {
  return value as BacktestResponseInput;
}

function settledLanding() {
  return { data: null, isLoading: false, isError: false };
}

function settledDashboard() {
  return { dashboard: null, isLoading: false, isError: false };
}

function lastBacktestQueryOptions(): {
  queryKey: unknown;
  queryFn: () => Promise<unknown>;
  staleTime: number;
} {
  const options = useQueryMock.mock.calls.at(-1)?.[0] as
    | {
        queryKey: unknown;
        queryFn: () => Promise<unknown>;
        staleTime: number;
      }
    | undefined;
  if (!options || typeof options.queryFn !== 'function') {
    throw new Error('Expected backtest hook to call useQuery with a queryFn');
  }
  return options;
}

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

function allocationCategory(
  total_value: number,
  percentage_of_portfolio: number,
) {
  return {
    total_value,
    percentage_of_portfolio,
    wallet_tokens_value: total_value,
    other_sources_value: 0,
  };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  useQueryMock.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
  });
  getStrategyConfigsMock.mockResolvedValue({
    backtest_defaults: { days: 500, total_capital: 10000 },
    presets: [],
    strategies: [],
  });
  runBacktestMock.mockResolvedValue({ strategies: {}, timeline: [] });
  useLandingPageDataMock.mockReturnValue(settledLanding());
  usePortfolioDashboardMock.mockReturnValue(settledDashboard());
  useDailyYieldReturnsMock.mockReturnValue({ data: undefined });
});

describe('backtest preset fallbacks', () => {
  it('uses a non-default preset when no default is marked', () => {
    const request = buildDefaultBacktestRequest(
      backtestConfigs({
        backtest_defaults: { days: 365, total_capital: 5000 },
        presets: [
          {
            config_id: 'only-non-default',
            display_name: 'Only',
            description: null,
            strategy_id: 'dma_fgi_portfolio_rules',
            params: {},
            is_default: false,
            is_benchmark: false,
          },
        ],
        strategies: [],
      }),
    );

    expect(request.configs[1]).toEqual({
      config_id: 'only-non-default',
      saved_config_id: 'only-non-default',
    });
  });

  it('ignores presets for other strategies when selecting the fallback', () => {
    const request = buildDefaultBacktestRequest(
      backtestConfigs({
        backtest_defaults: { days: 365, total_capital: 5000 },
        presets: [
          {
            config_id: 'unrelated-default',
            display_name: 'Unrelated',
            description: null,
            strategy_id: 'other_strategy',
            params: {},
            is_default: true,
            is_benchmark: false,
          },
        ],
        strategies: [],
      }),
    );

    expect(request.configs[1]).toEqual({
      config_id: 'dma_fgi_portfolio_rules_default',
      strategy_id: 'dma_fgi_portfolio_rules',
      params: {},
    });
  });

  it('falls back to empty adhoc params when configs omit presets and strategies', () => {
    const request = buildDefaultBacktestRequest(
      backtestConfigs({
        backtest_defaults: undefined,
        presets: undefined,
        strategies: undefined,
      }),
    );

    expect(request).toEqual({
      days: 500,
      total_capital: 10000,
      configs: [
        {
          config_id: 'dca_classic',
          strategy_id: 'dca_classic',
          params: {},
        },
        {
          config_id: 'dma_fgi_portfolio_rules_default',
          strategy_id: 'dma_fgi_portfolio_rules',
          params: {},
        },
      ],
    });
  });
});

describe('backtest response mapping gaps', () => {
  it('marks a negative ROI as negative instead of neutral', () => {
    const view = viewFromResponse(
      backtestResponse({
        strategies: {
          dca_classic: {},
          dma_fgi_portfolio_rules_default: {
            display_name: 'Zap Strategy',
            roi_percent: -5.5,
            max_drawdown_percent: -3.2,
            sharpe_ratio: 0.5,
            calmar_ratio: 0.25,
            volatility: 12,
            win_rate_percent: 40,
            trade_count: 7,
            final_value: 9000,
          },
        },
        timeline: [],
      }),
    );

    expect(view?.returnLabel).toBe('−5.5%');
    expect(view?.metrics[0]).toEqual({
      label: 'ROI',
      value: '−5.5%',
      tone: 'negative',
    });
  });

  it('returns null when the response carries no strategies map', () => {
    expect(viewFromResponse(backtestResponse({}))).toBeNull();
    expect(
      viewFromResponse(backtestResponse({ strategies: undefined })),
    ).toBeNull();
    expect(viewFromResponse(backtestResponse({ strategies: {} }))).toBeNull();
  });

  it('keeps only finite timeline values in chart data', () => {
    const view = viewFromResponse(
      backtestResponse({
        strategies: {
          dca_classic: {},
          dma_fgi_portfolio_rules_default: {
            display_name: 'Zap Strategy',
            roi_percent: 4,
            max_drawdown_percent: -2,
            sharpe_ratio: 1,
            calmar_ratio: 1,
            volatility: 10,
            win_rate_percent: 50,
            trade_count: 3,
            final_value: 10400,
          },
        },
        timeline: [
          {
            strategies: {
              dma_fgi_portfolio_rules_default: {
                portfolio: { total_value: 10000 },
              },
            },
          },
          {
            strategies: {
              dma_fgi_portfolio_rules_default: {
                portfolio: { total_value: undefined },
              },
            },
          },
          { strategies: {} },
          {
            strategies: {
              dma_fgi_portfolio_rules_default: {
                portfolio: { total_value: 'bad' },
              },
            },
          },
          {
            strategies: {
              dma_fgi_portfolio_rules_default: {
                portfolio: { total_value: 10400 },
              },
            },
          },
        ],
      }),
    );

    expect(view?.chartData).toEqual([10000, 10400]);
  });

  it('returns empty chart data when the timeline is missing', () => {
    const view = viewFromResponse(
      backtestResponse({
        strategies: {
          dca_classic: {},
          dma_fgi_portfolio_rules_default: {
            display_name: 'Zap Strategy',
            roi_percent: 4,
            max_drawdown_percent: -2,
            sharpe_ratio: 1,
            calmar_ratio: 1,
            volatility: 10,
            win_rate_percent: 50,
            trade_count: 3,
            final_value: 10400,
          },
        },
      }),
    );

    expect(view?.chartData).toEqual([]);
  });

  it('guards chart data when the strategies map is inconsistent between lookups', () => {
    const summary = {
      display_name: 'Zap Strategy',
      roi_percent: 5,
      max_drawdown_percent: -1,
      sharpe_ratio: 1,
      calmar_ratio: 1,
      volatility: 10,
      win_rate_percent: 50,
      trade_count: 1,
      final_value: 10500,
    };
    let reads = 0;
    const response = {
      timeline: [
        {
          strategies: {
            extra: { portfolio: { total_value: 10000 } },
          },
        },
      ],
    } as unknown as Record<string, unknown>;
    Object.defineProperty(response, 'strategies', {
      enumerable: true,
      get() {
        reads += 1;
        return reads === 1
          ? { dca_classic: {} }
          : { dca_classic: {}, extra: summary };
      },
    });

    const view = viewFromResponse(response as BacktestResponseInput);

    expect(view?.chartData).toEqual([]);
  });
});

describe('useDefaultStrategyBacktest hook', () => {
  it('defaults the query key and maps an empty query to null data', () => {
    const result = useDefaultStrategyBacktest();

    expect(result).toEqual({ data: null, isLoading: false, isError: false });
    const options = lastBacktestQueryOptions();
    expect(options.queryKey).toEqual([
      'desktop',
      'strategy',
      'default-backtest',
      'default',
    ]);
    expect(options.staleTime).toBe(10 * 60 * 1000);
  });

  it('surfaces query data, loading, and error state as-is', () => {
    const view = { displayName: 'Live' };
    useQueryMock.mockReturnValue({
      data: view,
      isLoading: true,
      isError: true,
    });

    expect(useDefaultStrategyBacktest(30)).toEqual({
      data: view,
      isLoading: true,
      isError: true,
    });
    expect(lastBacktestQueryOptions().queryKey).toEqual([
      'desktop',
      'strategy',
      'default-backtest',
      30,
    ]);
  });

  it('runs the full backtest through the explicit-days request path', async () => {
    getStrategyConfigsMock.mockResolvedValue(
      backtestConfigs({
        backtest_defaults: { days: 365, total_capital: 5000 },
        presets: [],
        strategies: [],
      }),
    );
    runBacktestMock.mockResolvedValue(
      backtestResponse({
        strategies: {
          dca_classic: {},
          dma_fgi_portfolio_rules_default: {
            display_name: 'Zap Strategy',
            roi_percent: 6,
            max_drawdown_percent: -2,
            sharpe_ratio: 1,
            calmar_ratio: 1,
            volatility: 9,
            win_rate_percent: 55,
            trade_count: 5,
            final_value: 10600,
          },
        },
        timeline: [],
      }),
    );

    useDefaultStrategyBacktest(90);
    const { queryFn } = lastBacktestQueryOptions();
    const view = (await queryFn()) as { displayName: string };

    expect(getStrategyConfigsMock).toHaveBeenCalledTimes(1);
    expect(runBacktestMock).toHaveBeenCalledTimes(1);
    const request = runBacktestMock.mock.calls[0]?.[0] as { days: number };
    expect(request.days).toBe(90);
    expect(view.displayName).toBe('Zap Strategy');
  });

  it('runs the full backtest through the default-days request path', async () => {
    getStrategyConfigsMock.mockResolvedValue(
      backtestConfigs({
        backtest_defaults: { days: 365, total_capital: 5000 },
        presets: [],
        strategies: [],
      }),
    );
    runBacktestMock.mockResolvedValue(
      backtestResponse({
        strategies: {
          dca_classic: {},
          dma_fgi_portfolio_rules_default: {
            display_name: 'Zap Strategy',
            roi_percent: 6,
            max_drawdown_percent: -2,
            sharpe_ratio: 1,
            calmar_ratio: 1,
            volatility: 9,
            win_rate_percent: 55,
            trade_count: 5,
            final_value: 10600,
          },
        },
        timeline: [],
      }),
    );

    useDefaultStrategyBacktest();
    const view = (await lastBacktestQueryOptions().queryFn()) as {
      displayName: string;
    };

    const request = runBacktestMock.mock.calls[0]?.[0] as { days: number };
    expect(request.days).toBe(365);
    expect(view.displayName).toBe('Zap Strategy');
  });
});

describe('portfolio tone gaps', () => {
  it('marks a falling window as negative', () => {
    usePortfolioDashboardMock.mockReturnValue({
      dashboard: {
        trends: {
          daily_values: [
            { date: '2026-06-28', total_value_usd: 1000 },
            { date: '2026-06-29', total_value_usd: 900 },
          ],
        },
      },
      isLoading: false,
      isError: false,
    });

    const result = renderPortfolioData('user-123', '1W');

    expect(result.data?.valueChangePct).toBeCloseTo(-10, 10);
    expect(result.data?.metrics[0]).toEqual({
      label: 'Value change',
      value: '−10.0%',
      tone: 'negative',
    });
  });

  it('marks a flat window as neutral rather than positive or negative', () => {
    usePortfolioDashboardMock.mockReturnValue({
      dashboard: {
        trends: {
          daily_values: [
            { date: '2026-06-28', total_value_usd: 1000 },
            { date: '2026-06-29', total_value_usd: 1000 },
          ],
        },
      },
      isLoading: false,
      isError: false,
    });

    const result = renderPortfolioData('user-123', '1W');

    expect(result.data?.valueChangePct).toBe(0);
    expect(result.data?.metrics[0]).toEqual({
      label: 'Value change',
      value: '0.0%',
      tone: 'neutral',
    });
  });
});

describe('portfolio loading and attribution gaps', () => {
  it('stays loading while the dashboard has not resolved', () => {
    usePortfolioDashboardMock.mockReturnValue({
      dashboard: null,
      isLoading: true,
      isError: false,
    });

    expect(renderPortfolioData('user-123', '1M')).toEqual({
      data: null,
      isLoading: true,
      isError: false,
    });
  });

  it('does not stay in the initial loading state once a dashboard exists', () => {
    usePortfolioDashboardMock.mockReturnValue({
      dashboard: {
        trends: {
          daily_values: [
            { date: '2026-06-28', total_value_usd: 1000 },
            { date: '2026-06-29', total_value_usd: 1100 },
          ],
        },
      },
      isLoading: true,
      isError: false,
    });

    const result = renderPortfolioData('user-123', '1M');

    expect(result.data).not.toBeNull();
    expect(result.isLoading).toBe(true);
  });

  it('requests short-range attribution with an unresolved user id', () => {
    const result = renderPortfolioData(null, '1W');

    expect(useDailyYieldReturnsMock).toHaveBeenCalledWith(undefined, 30);
    expect(result).toMatchObject({ isLoading: false, isError: false });
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
});

describe('portfolio allocation gaps', () => {
  it('maps crypto and stable rows while dropping zero-percent buckets', () => {
    useLandingPageDataMock.mockReturnValue({
      data: {
        net_portfolio_value: 1005,
        total_net_usd: 1005,
        portfolio_roi: { recommended_yearly_roi: 5 },
        portfolio_allocation: {
          btc: allocationCategory(600, 60),
          eth: allocationCategory(300, 30),
          spy: allocationCategory(0, 0),
          stablecoins: allocationCategory(100, 10),
          others: allocationCategory(5, 0.4),
        },
      },
      isLoading: false,
      isError: false,
    });

    const result = renderPortfolioData('user-123', '1M');

    expect(result.data?.allocation).toEqual([
      { label: 'Bitcoin', pct: 60, color: expect.any(String) },
      { label: 'Ethereum', pct: 30, color: expect.any(String) },
      {
        label: 'Stablecoins',
        pct: 10,
        color: tokens.color.pillar.usd,
      },
    ]);
    expect(
      result.data?.allocation.some((row) => row.label === 'Altcoins'),
    ).toBe(false);
  });
});
