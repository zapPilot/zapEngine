import { describe, expect, it, vi } from 'vitest';

import type { OverviewResponse } from '../shared/types.js';
import { createControlCenterApp } from './app.js';
import { readControlCenterConfig } from './config/env.js';

const overview: OverviewResponse = {
  generatedAt: '2026-08-16T12:00:00.000Z',
  accruedCostUsd: 12.83,
  projectedCostUsd: 24.2,
  cashInvoiceSpendUsd: null,
  aumUsd: null,
  activeAccounts: null,
  socialReach: 42,
  providers: [],
  social: {
    status: 'ok',
    message: null,
    window: 'latest',
    generatedAt: '2026-08-16T12:00:00.000Z',
    accounts: [],
    episodes: [],
  },
};

function createTestApp(
  overrides: {
    getOverview?: unknown;
    getCostHistory?: unknown;
    syncCosts?: unknown;
    getSocial?: unknown;
  } = {},
) {
  return createControlCenterApp({
    config: readControlCenterConfig({}),
    service: {
      getOverview: (overrides.getOverview as never) ?? vi.fn(),
      getCostHistory:
        (overrides.getCostHistory as never) ??
        vi.fn().mockResolvedValue({
          currentMonthDaily: [],
          monthlyTotals: [],
          cashSpendUsd: null,
        }),
      syncCosts: (overrides.syncCosts as never) ?? vi.fn(),
      getSocial:
        (overrides.getSocial as never) ??
        vi.fn().mockResolvedValue(overview.social),
    } as never,
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
