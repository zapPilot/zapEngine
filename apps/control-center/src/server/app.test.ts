import { describe, expect, it, vi } from 'vitest';

import type { OverviewResponse } from '../shared/types.js';
import { createControlCenterApp } from './app.js';
import { readControlCenterConfig } from './config/env.js';
import { createOverviewService } from './services/overview.js';

const overview: OverviewResponse = {
  generatedAt: '2026-08-16T12:00:00.000Z',
  accruedCostUsd: 12.83,
  projectedCostUsd: 24.2,
  cashInvoiceSpendUsd: null,
  aumUsd: null,
  activeAccounts: null,
  socialReach: 42,
  product: {
    registeredUsers: 100,
    verifiedWallets: 90,
    portfolioUsers: 20,
    wau: 8,
    mau: 11,
    observedPortfolioUsd: 50_000,
    portfolioFresh24h: 3,
    portfolioFresh7d: 5,
    top1PortfolioShare: 0.5,
    top3PortfolioShare: 0.8,
  },
  providers: [],
  social: {
    status: 'ok',
    message: null,
    window: 'latest',
    generatedAt: '2026-08-16T12:00:00.000Z',
    accounts: [],
    decisions: [],
    episodes: [],
  },
};

function createTestApp(
  overrides: Partial<ReturnType<typeof createOverviewService>> = {},
) {
  return createControlCenterApp({
    config: readControlCenterConfig({}),
    service: {
      getOverview: overrides.getOverview ?? vi.fn(async () => overview),
      getCostHistory:
        overrides.getCostHistory ??
        vi.fn().mockResolvedValue({
          currentMonthDaily: [],
          monthlyTotals: [],
          cashSpendUsd: null,
        }),
      syncCosts:
        overrides.syncCosts ??
        vi.fn(async () => ({
          syncedAt: '2026-08-22T00:00:00.000Z',
          persisted: 0,
          providers: [],
        })),
      getSocial:
        overrides.getSocial ?? vi.fn().mockResolvedValue(overview.social),
    },
    serveClient: false,
  });
}

describe('control center API', () => {
  it('returns persisted overview without triggering a provider refresh', async () => {
    const getOverview = vi.fn().mockResolvedValue(overview);
    const app = createTestApp({
      getOverview,
      getCostHistory: vi.fn().mockResolvedValue({
        currentMonthDaily: [],
        monthlyTotals: [],
        cashSpendUsd: null,
      }),
      getSocial: vi.fn().mockResolvedValue(overview.social),
    });

    const response = await app.request('/api/overview');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      accruedCostUsd: 12.83,
      socialReach: 42,
    });
    expect(getOverview).toHaveBeenCalledWith();
  });

  it('normalizes unknown social windows to latest', async () => {
    const getSocial = vi.fn().mockResolvedValue(overview.social);
    const app = createTestApp({ getSocial });

    expect(
      (await app.request('/api/social-performance?window=nope')).status,
    ).toBe(200);
    expect(getSocial).toHaveBeenCalledWith('latest');
  });

  it('syncs costs only through the POST endpoint', async () => {
    const syncCosts = vi.fn().mockResolvedValue({
      syncedAt: '2026-08-22T00:00:00.000Z',
      persisted: 3,
      providers: [],
    });
    const app = createTestApp({ syncCosts });

    const response = await app.request('/api/costs/sync', { method: 'POST' });
    expect(response.status).toBe(200);
    expect(syncCosts).toHaveBeenCalledOnce();
  });
});
