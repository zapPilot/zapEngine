import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  validateLandingPageResponse: vi.fn((value: unknown) => ({
    kind: 'landing',
    value,
  })),
  validateUnifiedDashboardResponse: vi.fn((value: unknown) => ({
    kind: 'dashboard',
    value,
  })),
  validateDailyYieldReturnsResponse: vi.fn((value: unknown) => ({
    kind: 'daily',
    value,
  })),
  validateYieldReturnsSummaryResponse: vi.fn((value: unknown) => ({
    kind: 'summary',
    value,
  })),
  validateBorrowingPositionsResponse: vi.fn((value: unknown) => ({
    kind: 'borrowing',
    value,
  })),
  validateMarketDashboardResponse: vi.fn((value: unknown) => ({
    kind: 'market',
    value,
  })),
}));

vi.mock('@core/lib/http', () => ({
  httpUtils: {
    analyticsEngine: {
      get: mocks.get,
    },
  },
}));

vi.mock('@core/schemas/api/analyticsSchemas', () => ({
  validateLandingPageResponse: mocks.validateLandingPageResponse,
  validateUnifiedDashboardResponse: mocks.validateUnifiedDashboardResponse,
  validateDailyYieldReturnsResponse: mocks.validateDailyYieldReturnsResponse,
  validateYieldReturnsSummaryResponse:
    mocks.validateYieldReturnsSummaryResponse,
  validateBorrowingPositionsResponse: mocks.validateBorrowingPositionsResponse,
  validateMarketDashboardResponse: mocks.validateMarketDashboardResponse,
}));

import {
  getBorrowingPositions,
  getDailyYieldReturns,
  getLandingPagePortfolioData,
  getMarketDashboardData,
  getPortfolioDashboard,
  getYieldSummary,
} from '@core/services/analyticsService';

const USER_CONFIG = { timeout: 60_000 };

describe('analyticsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue({ payload: true });
  });

  it('fetches and validates landing-page data with the long analytics timeout', async () => {
    await expect(getLandingPagePortfolioData('user-1')).resolves.toEqual({
      kind: 'landing',
      value: { payload: true },
    });
    expect(mocks.get).toHaveBeenCalledWith(
      '/api/v2/portfolio/user-1/landing',
      USER_CONFIG,
    );
    expect(mocks.validateLandingPageResponse).toHaveBeenCalledWith({
      payload: true,
    });
  });

  it('builds dashboard query params and supports the empty default window', async () => {
    await getPortfolioDashboard('user-1', {
      trend_days: 30,
      drawdown_days: 60,
      rolling_days: 90,
      metrics: ['sharpe', 'volatility'],
      risk_days: 15,
      allocation_days: 45,
      wallet_address: '0xabc',
    });
    expect(mocks.get).toHaveBeenLastCalledWith(
      '/api/v2/analytics/user-1/dashboard?trend_days=30&risk_days=15&drawdown_days=60&allocation_days=45&rolling_days=90&metrics=sharpe%2Cvolatility&wallet_address=0xabc',
      USER_CONFIG,
    );

    await getPortfolioDashboard('user-2');
    expect(mocks.get).toHaveBeenLastCalledWith(
      '/api/v2/analytics/user-2/dashboard',
      USER_CONFIG,
    );
    expect(mocks.validateUnifiedDashboardResponse).toHaveBeenCalledTimes(2);
  });

  it('fetches daily yield with defaults and optional wallet filtering', async () => {
    await getDailyYieldReturns('user-1');
    expect(mocks.get).toHaveBeenLastCalledWith(
      '/api/v2/analytics/user-1/yield/daily?days=30',
      USER_CONFIG,
    );

    await getDailyYieldReturns('user-1', 7, '0xwallet');
    expect(mocks.get).toHaveBeenLastCalledWith(
      '/api/v2/analytics/user-1/yield/daily?days=7&walletAddress=0xwallet',
      USER_CONFIG,
    );
    expect(mocks.validateDailyYieldReturnsResponse).toHaveBeenCalledTimes(2);
  });

  it('builds yield summaries with no query, windows, wallet, and both filters', async () => {
    await getYieldSummary('user-1');
    expect(mocks.get).toHaveBeenLastCalledWith(
      '/api/v2/analytics/user-1/yield/summary',
      USER_CONFIG,
    );

    await getYieldSummary('user-1', { windows: ['7d', '30d'] });
    expect(mocks.get).toHaveBeenLastCalledWith(
      '/api/v2/analytics/user-1/yield/summary?windows=7d%2C30d',
      USER_CONFIG,
    );

    await getYieldSummary('user-1', { walletAddress: '0xwallet' });
    expect(mocks.get).toHaveBeenLastCalledWith(
      '/api/v2/analytics/user-1/yield/summary?walletAddress=0xwallet',
      USER_CONFIG,
    );

    await getYieldSummary('user-1', {
      windows: [],
      walletAddress: '',
    });
    expect(mocks.get).toHaveBeenLastCalledWith(
      '/api/v2/analytics/user-1/yield/summary',
      USER_CONFIG,
    );
    expect(mocks.validateYieldReturnsSummaryResponse).toHaveBeenCalledTimes(4);
  });

  it('fetches borrowing positions and validates the response', async () => {
    await expect(getBorrowingPositions('user-1')).resolves.toEqual({
      kind: 'borrowing',
      value: { payload: true },
    });
    expect(mocks.get).toHaveBeenCalledWith(
      '/api/v2/analytics/user-1/borrowing/positions',
      USER_CONFIG,
    );
  });

  it('fetches market dashboard data with default and explicit day windows', async () => {
    await getMarketDashboardData();
    expect(mocks.get).toHaveBeenLastCalledWith(
      '/api/v2/market/dashboard?days=365',
    );

    await getMarketDashboardData(14);
    expect(mocks.get).toHaveBeenLastCalledWith(
      '/api/v2/market/dashboard?days=14',
    );
    expect(mocks.validateMarketDashboardResponse).toHaveBeenCalledTimes(2);
  });
});
