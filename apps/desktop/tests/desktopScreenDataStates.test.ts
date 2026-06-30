import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEMO } from '../src/data/demo';

const mocked = vi.hoisted(() => ({
  account: {
    address: '0x1234567890123456789012345678901234567890',
    email: null,
    isConnected: true,
    isConnecting: false,
    userId: 'user-live' as string | null,
    walletAddresses: ['0x1234567890123456789012345678901234567890'],
  },
  calculateAllocation: vi.fn(() => ({
    simplifiedCrypto: [{ color: 'var(--btc)', name: 'BTC', value: 60 }],
    stable: 40,
  })),
  dashboard: {
    dashboard: null as unknown,
    isError: false,
    isLoading: false,
  },
  defaultBacktest: {
    data: null as unknown,
    isError: false,
    isLoading: false,
  },
  landingQuery: {
    data: null as unknown,
    isError: false,
    isLoading: false,
  },
  navigate: vi.fn(),
  progressive: {
    sections: {} as unknown,
  },
  suggestion: {
    data: null as unknown,
    isError: false,
    isLoading: false,
  },
  walletAssets: {
    assets: [] as typeof DEMO.home.assets,
    isConnected: true,
    isError: false,
    isLoading: false,
  },
  yieldQuery: {
    data: null as unknown,
    isError: false,
    isLoading: false,
  },
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mocked.navigate,
  };
});

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQuery: () => mocked.yieldQuery,
  };
});

vi.mock('@zapengine/app-core/adapters', () => ({
  calculateAllocation: mocked.calculateAllocation,
}));

vi.mock('@zapengine/app-core/hooks/analytics', () => ({
  usePortfolioDashboard: () => mocked.dashboard,
}));

vi.mock('@zapengine/app-core/hooks/analytics/usePortfolioDashboard', () => ({
  usePortfolioDashboard: () => mocked.dashboard,
}));

vi.mock('@zapengine/app-core/hooks/queries', () => ({
  useLandingPageData: () => mocked.landingQuery,
}));

vi.mock(
  '@zapengine/app-core/hooks/queries/analytics/usePortfolioDataProgressive',
  () => ({
    usePortfolioDataProgressive: () => mocked.progressive,
  }),
);

vi.mock('@zapengine/app-core/services', () => ({
  getDailyYieldReturns: vi.fn(),
}));

vi.mock('@/integration/useAccount', () => ({
  useAccount: () => mocked.account,
}));

vi.mock('@/integration/useDefaultStrategyBacktest', () => ({
  useDefaultStrategyBacktest: () => mocked.defaultBacktest,
}));

vi.mock('@/integration/useStrategySuggestion', () => ({
  toCompositionTargetFromSuggestion: () => null,
  useStrategySuggestion: () => mocked.suggestion,
}));

vi.mock('@/integration/walletTokens', () => ({
  useWalletAssets: () => mocked.walletAssets,
}));

const { HomeScreen } = await import('../src/routes/HomeScreen');
const { PortfolioScreen } = await import('../src/routes/PortfolioScreen');

function renderScreen(component: typeof HomeScreen | typeof PortfolioScreen) {
  return renderToStaticMarkup(createElement(component));
}

function setLiveHomeData() {
  mocked.progressive = {
    sections: {
      balance: {
        data: { balance: 12_345.67 },
        error: null,
        isLoading: false,
      },
      strategy: {
        data: {
          currentRegime: 'Neutral',
          sentimentQuote: 'Live market quote',
        },
        error: null,
        isLoading: false,
      },
    },
  };
  mocked.dashboard = {
    dashboard: {
      trends: {
        daily_values: [
          {
            change_percentage: 0,
            date: '2026-06-28T00:00:00Z',
            pnl_usd: 0,
            total_value_usd: 12_000,
          },
          {
            change_percentage: 2.3,
            date: '2026-06-29T00:00:00Z',
            pnl_usd: 345.67,
            total_value_usd: 12_345.67,
          },
        ],
      },
    },
    isError: false,
    isLoading: false,
  };
  mocked.walletAssets = {
    assets: [
      {
        amountLabel: '1,234.56',
        chains: ['base'],
        glyph: '$',
        iconBg: '#2775ca',
        name: 'USD Coin',
        symbol: 'USDC',
        usdValue: 1_234.56,
      },
    ],
    isConnected: true,
    isError: false,
    isLoading: false,
  };
}

function setLivePortfolioData() {
  mocked.landingQuery = {
    data: {
      net_portfolio_value: 9_876.54,
      portfolio_allocation: { btc: 60, stablecoins: 40 },
      portfolio_roi: { recommended_yearly_roi: 8.5 },
      total_net_usd: 9_876.54,
    },
    isError: false,
    isLoading: false,
  };
  mocked.dashboard = {
    dashboard: {
      drawdown_analysis: {
        enhanced: { summary: { max_drawdown_pct: -4.2 } },
      },
      rolling_analytics: {
        sharpe: {
          rolling_sharpe_data: [{ rolling_sharpe_ratio: 1.23 }],
        },
        volatility: {
          rolling_volatility_data: [{ annualized_volatility_pct: 12.5 }],
        },
      },
      trends: {
        daily_values: [
          {
            change_percentage: 0,
            date: '2026-06-01T00:00:00Z',
            total_value_usd: 9_000,
          },
          {
            change_percentage: 1.7,
            date: '2026-06-29T00:00:00Z',
            total_value_usd: 9_900,
          },
        ],
      },
    },
    isError: false,
    isLoading: false,
  };
  mocked.yieldQuery = {
    data: { daily_returns: [{ yield_return_usd: 12.34 }] },
    isError: false,
    isLoading: false,
  };
}

beforeEach(() => {
  mocked.account = {
    address: '0x1234567890123456789012345678901234567890',
    email: null,
    isConnected: true,
    isConnecting: false,
    userId: 'user-live',
    walletAddresses: ['0x1234567890123456789012345678901234567890'],
  };
  mocked.calculateAllocation.mockClear();
  mocked.dashboard = { dashboard: null, isError: false, isLoading: false };
  mocked.defaultBacktest = { data: null, isError: false, isLoading: false };
  mocked.landingQuery = { data: null, isError: false, isLoading: false };
  mocked.navigate.mockClear();
  mocked.progressive = { sections: {} };
  mocked.suggestion = { data: null, isError: false, isLoading: false };
  mocked.walletAssets = {
    assets: [],
    isConnected: true,
    isError: false,
    isLoading: false,
  };
  mocked.yieldQuery = { data: null, isError: false, isLoading: false };
});

describe('desktop screen skeleton states', () => {
  it('renders Home balance and wallet-token skeletons while live data loads', () => {
    mocked.progressive = {
      sections: {
        balance: { data: null, error: null, isLoading: true },
        strategy: { data: null, error: null, isLoading: false },
      },
    };
    mocked.dashboard = { dashboard: null, isError: false, isLoading: true };
    mocked.walletAssets = {
      assets: [],
      isConnected: true,
      isError: false,
      isLoading: true,
    };

    const markup = renderScreen(HomeScreen);

    expect(markup).toContain('Total balance');
    expect(markup).toContain('animate-pulse');
    expect(markup).toContain('Loading wallet tokens');
    expect(markup).not.toContain('$12,345');
  });

  it('renders Portfolio skeletons while portfolio data is unresolved', () => {
    mocked.account = { ...mocked.account, userId: null };

    const markup = renderScreen(PortfolioScreen);

    expect(markup).toContain('Strategy position value');
    expect(markup).toContain('Current allocation');
    expect(markup.match(/animate-pulse/g)?.length ?? 0).toBeGreaterThan(4);
  });
});

describe('desktop screen error states', () => {
  it('renders Portfolio unavailable values instead of stale demo data after upstream errors', () => {
    mocked.landingQuery = { data: null, isError: true, isLoading: false };
    mocked.dashboard = { dashboard: null, isError: true, isLoading: false };
    mocked.yieldQuery = { data: null, isError: true, isLoading: false };

    const markup = renderScreen(PortfolioScreen);

    expect(markup).toContain('Strategy position value');
    expect(markup).toContain('Current allocation');
    expect(markup).toContain('all time · today');
    expect(markup).toContain('Auto-managed by Zap Strategy');
    expect(markup).not.toContain('animate-pulse');
    expect(markup).not.toContain('$9,876');
    expect(markup).not.toContain('8.5%');
    expect(mocked.calculateAllocation).not.toHaveBeenCalled();
  });
});

describe('desktop screen live-data states', () => {
  it('renders Home live balance, change, sparkline, and wallet assets without skeletons', () => {
    setLiveHomeData();

    const markup = renderScreen(HomeScreen);

    expect(markup).toContain('$12,345');
    expect(markup).toContain('.67');
    expect(markup).toContain('+2.3%');
    expect(markup).toContain('+$345.67 today');
    expect(markup).toContain('USDC');
    expect(markup).toContain('$1,234.56');
    expect(markup).not.toContain('animate-pulse');
    expect(markup).not.toContain('Loading wallet tokens');
  });

  it('renders Portfolio live position, metrics, chart, and allocation without skeletons', () => {
    setLivePortfolioData();

    const markup = renderScreen(PortfolioScreen);

    expect(markup).toContain('$9,876');
    expect(markup).toContain('.54');
    expect(markup).toContain('+10.0%');
    expect(markup).toContain('8.5%');
    expect(markup).toContain('$12.34');
    expect(markup).toContain('BTC');
    expect(markup).toContain('Stablecoins');
    expect(markup).not.toContain('animate-pulse');
    expect(markup).not.toContain('Loading metrics');
  });

  it('keeps Portfolio live values but hides the chart when only one trend point is available', () => {
    setLivePortfolioData();
    mocked.dashboard = {
      ...mocked.dashboard,
      dashboard: {
        ...mocked.dashboard.dashboard,
        trends: {
          daily_values: [
            {
              change_percentage: 1.7,
              date: '2026-06-29T00:00:00Z',
              total_value_usd: 9_900,
            },
          ],
        },
      },
    };

    const markup = renderScreen(PortfolioScreen);

    expect(markup).toContain('$9,876');
    expect(markup).toContain('8.5%');
    expect(markup).toContain('BTC');
    expect(markup).not.toContain('portfolioValueSpark');
    expect(markup).not.toContain('animate-pulse');
  });
});
