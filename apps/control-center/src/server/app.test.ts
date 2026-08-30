import { describe, expect, it, vi } from 'vitest';

import type {
  CustomerEconomicsResponse,
  OperationsResponse,
  OperationsSocialResponse,
  OverviewResponse,
  SocialGrowthResponse,
} from '../shared/types.js';
import { createControlCenterApp } from './app.js';
import { readControlCenterConfig } from './config/env.js';
import type { createOperationsService } from './services/operations/aggregate.js';
import { createOverviewService } from './services/overview.js';
import type { createSocialGrowthService } from './services/social-growth.js';

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

const operations: OperationsResponse = {
  generatedAt: '2026-08-28T12:00:00.000Z',
  status: 'degraded',
  domains: [],
  priorities: [],
  signals: [],
};

const operationsSocial: OperationsSocialResponse = {
  generatedAt: '2026-08-28T12:00:00.000Z',
  daemon: {
    status: 'healthy',
    owner: 'laptop',
    daemonVersion: 'social-daemon-v1',
    firstStartedAt: '2026-08-01T00:00:00.000Z',
    lastTickStartedAt: '2026-08-28T11:59:00.000Z',
    lastTickCompletedAt: '2026-08-28T11:59:30.000Z',
    lastSuccessAt: '2026-08-28T11:59:30.000Z',
    lastError: null,
    staleMinutes: 1,
  },
  jobs: [],
  waitingMediaLanes: 0,
  invalidJobRows: 0,
  message: null,
};

const customers: CustomerEconomicsResponse = {
  generatedAt: '2026-08-28T12:00:00.000Z',
  status: 'ok',
  message: null,
  summary: {
    totalCustomers: 2,
    priorityUsers: 1,
    standardUsers: 1,
    pausedUsers: 0,
    activeLast7d: 1,
    inactiveButPriority: 0,
    aumUsd: 1_000,
    attributedCostUsd30d: 4,
    revenueUsd: null,
  },
  users: [],
};

const socialGrowth: SocialGrowthResponse = {
  generatedAt: '2026-08-30T00:00:00.000Z',
  status: 'ok',
  message: null,
  platforms: [],
  experiments: [],
  attribution: [],
};

function createTestApp(
  overrides: Partial<ReturnType<typeof createOverviewService>> = {},
  operationsOverrides: Partial<ReturnType<typeof createOperationsService>> = {},
  growthOverrides: Partial<ReturnType<typeof createSocialGrowthService>> = {},
) {
  return createControlCenterApp({
    config: readControlCenterConfig({}),
    operations: {
      getOperations:
        operationsOverrides.getOperations ??
        vi.fn().mockResolvedValue(operations),
      getSocial:
        operationsOverrides.getSocial ??
        vi.fn().mockResolvedValue(operationsSocial),
      getCustomers:
        operationsOverrides.getCustomers ??
        vi.fn().mockResolvedValue(customers),
    },
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
    socialGrowth: {
      getSocialGrowth:
        growthOverrides.getSocialGrowth ??
        vi.fn().mockResolvedValue(socialGrowth),
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

  it('serves social growth and forwards the force cache bypass', async () => {
    const getSocialGrowth = vi.fn().mockResolvedValue(socialGrowth);
    const app = createTestApp({}, {}, { getSocialGrowth });
    const response = await app.request('/api/social-growth?force=1');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'ok' });
    expect(getSocialGrowth).toHaveBeenCalledWith(true);
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

  it('serves the operations snapshot and its social detail', async () => {
    const getOperations = vi.fn().mockResolvedValue(operations);
    const getSocial = vi.fn().mockResolvedValue(operationsSocial);
    const app = createTestApp({}, { getOperations, getSocial });

    await expect(
      (await app.request('/api/operations')).json(),
    ).resolves.toMatchObject({ status: 'degraded' });
    await expect(
      (await app.request('/api/operations/social')).json(),
    ).resolves.toMatchObject({ daemon: { owner: 'laptop' } });
    expect(getOperations).toHaveBeenCalledWith(false);
    expect(getSocial).toHaveBeenCalledWith(false);
  });

  it('passes ?force=1 through to the cache bypass', async () => {
    const getCustomers = vi.fn().mockResolvedValue(customers);
    const app = createTestApp({}, { getCustomers });

    const response = await app.request('/api/customers?force=1');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      summary: { totalCustomers: 2 },
    });
    expect(getCustomers).toHaveBeenCalledWith(true);
  });

  it('treats any other force value as a normal cached read', async () => {
    const getCustomers = vi.fn().mockResolvedValue(customers);
    const app = createTestApp({}, { getCustomers });

    await app.request('/api/customers?force=yes');
    expect(getCustomers).toHaveBeenCalledWith(false);
  });
});
