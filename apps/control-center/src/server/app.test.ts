import { unavailableWaitlist } from '../shared/waitlist-growth.js';
import { describe, expect, it, vi } from 'vitest';

import type {
  CustomerEconomicsResponse,
  OperationsResponse,
  OperationsSocialResponse,
  OverviewResponse,
  PodcastCostResponse,
  SocialGrowthResponse,
} from '../shared/types.js';
import { createControlCenterApp } from './app.js';
import { readControlCenterConfig } from './config/env.js';
import type { createOperationsService } from './services/operations/aggregate.js';
import { createOverviewService } from './services/overview.js';
import { createPodcastPipelineService } from './services/podcast-pipeline.js';
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
    activePortfolios7d: 6,
  },
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
  waitingMedia: {
    lanes: 0,
    rowsRead: 0,
    oldestWaitingSince: null,
    oldestEpisodeId: null,
    oldestLanguageCode: null,
    blockedLanes: 0,
    invalidRows: 0,
    message: null,
  },
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
  waitlist: unavailableWaitlist('Not collected'),
  attribution: [],
};

const podcastCosts: PodcastCostResponse = {
  generatedAt: '2026-08-16T12:00:00.000Z',
  status: 'ok',
  message: null,
  episodes: [
    {
      episodeId: 'episode-1',
      title: 'An episode',
      lastRunAt: '2026-08-16T11:00:00.000Z',
      totalCostUsd: 1,
      podcastCostUsd: 0.6,
      videoCostUsd: 0.4,
      failedAttemptCostUsd: 0.2,
      interruptedAttemptCostUsd: null,
      confirmedDeploymentInterruptionCostUsd: 0,
      shutdownInterruptionCostUsd: 0,
      confirmedRetryWasteUsd: null,
      confirmedRetryWasteIsLowerBound: true,
      unknownLineageStages: 1,
      unknownFailureReasonStages: 1,
      runCount: 2,
      failedRuns: 1,
      unpricedStages: 0,
      breakdown: [],
    },
  ],
};

function createTestApp(
  overrides: Partial<ReturnType<typeof createOverviewService>> = {},
  operationsOverrides: Partial<ReturnType<typeof createOperationsService>> = {},
  growthOverrides: Partial<ReturnType<typeof createSocialGrowthService>> = {},
  options: {
    auth?: Parameters<typeof createControlCenterApp>[0]['auth'];
    podcastCosts?: Parameters<typeof createControlCenterApp>[0]['podcastCosts'];
    podcastPipeline?: Parameters<
      typeof createControlCenterApp
    >[0]['podcastPipeline'];
  } = {},
) {
  return createControlCenterApp({
    config: readControlCenterConfig({}),
    operations: {
      getCommunity:
        operationsOverrides.getCommunity ??
        vi.fn().mockResolvedValue({ status: 'unavailable' }),
      getGrowth: operationsOverrides.getGrowth ?? vi.fn(),
      getOperations:
        operationsOverrides.getOperations ??
        vi.fn().mockResolvedValue(operations),
      getSocial:
        operationsOverrides.getSocial ??
        vi.fn().mockResolvedValue(operationsSocial),
      getCustomers:
        operationsOverrides.getCustomers ??
        vi.fn().mockResolvedValue(customers),
      inspectSignal:
        operationsOverrides.inspectSignal ??
        vi.fn().mockResolvedValue({
          fingerprint: 'test',
          source: null,
          status: 'unsupported',
          inspectedAt: new Date().toISOString(),
          summary: 'unsupported',
          entities: [],
          evidence: {},
          gaps: [],
        }),
      resolveSentryIssue: operationsOverrides.resolveSentryIssue ?? vi.fn(),
      reconcileSentryIssue: operationsOverrides.reconcileSentryIssue ?? vi.fn(),
      investigate: operationsOverrides.investigate ?? vi.fn(),
    },
    service: {
      getOverview: overrides.getOverview ?? vi.fn(async () => overview),
      getCostHistory:
        overrides.getCostHistory ??
        vi.fn().mockResolvedValue({
          currentMonthDaily: [],
          monthlyTotals: [],
          cashSpendUsd: null,
          previousMonthByProvider: [],
        }),
      getSocial:
        overrides.getSocial ?? vi.fn().mockResolvedValue(overview.social),
    },
    socialGrowth: {
      getSocialGrowth:
        growthOverrides.getSocialGrowth ??
        vi.fn().mockResolvedValue(socialGrowth),
    },
    podcastCosts: options.podcastCosts ?? {
      getPodcastCosts: vi.fn().mockResolvedValue(podcastCosts),
    },
    podcastPipeline: options.podcastPipeline,
    auth: options.auth,
  });
}

describe('control center API', () => {
  it.each(['costs', 'pipeline'] as const)(
    'shares overlapping podcast %s reads between direct routes and statements',
    async (kind) => {
      const pipeline = {
        generatedAt: overview.generatedAt,
        status: 'ok' as const,
        message: null,
        episodes: [],
      };
      let finish!: () => void;
      const waiting = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const getPodcastCosts = vi.fn(async () => {
        await waiting;
        return podcastCosts;
      });
      const getPipeline = vi.fn(async () => {
        await waiting;
        return pipeline;
      });
      const app = createTestApp(
        {},
        {},
        {},
        {
          podcastCosts: { getPodcastCosts },
          podcastPipeline: {
            ...createPodcastPipelineService({
              config: readControlCenterConfig({}),
            }),
            getPipeline,
          },
        },
      );
      const url =
        kind === 'costs' ? '/api/costs/podcast' : '/api/podcast-pipeline';
      const direct = app.request(url);
      const statements = app.request('/api/statements');
      const load = kind === 'costs' ? getPodcastCosts : getPipeline;
      // Statements must reach both source reads before their gate is released.
      await vi.waitFor(() => {
        expect(getPodcastCosts).toHaveBeenCalled();
        expect(getPipeline).toHaveBeenCalled();
      });
      expect(load).toHaveBeenCalledTimes(1);
      finish();
      expect((await direct).status).toBe(200);
      expect((await statements).status).toBe(200);
      expect((await app.request(url)).status).toBe(200);
      expect(load).toHaveBeenCalledTimes(2);
    },
  );
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

  it('rejects non-loopback hosts on the local API', async () => {
    const getOverview = vi.fn();
    const app = createTestApp({ getOverview });
    const response = await app.request('http://evil.example/api/overview');
    expect(response.status).toBe(403);
    expect(getOverview).not.toHaveBeenCalled();
  });

  it('rejects text/plain JSON before video retry and accepts the JSON client contract', async () => {
    const restartVideo = vi.fn();
    const app = createTestApp(
      {},
      {},
      {},
      {
        podcastPipeline: {
          ...createPodcastPipelineService({
            config: readControlCenterConfig({}),
          }),
          restartVideo,
        },
      },
    );
    const path =
      '/api/podcast-pipeline/826f4b87-6278-4275-bff5-535ba5ef438d/video/retry';
    const body = JSON.stringify({ forceReplan: true });
    const rejected = await app.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body,
    });
    expect(rejected.status).toBe(415);
    expect(restartVideo).not.toHaveBeenCalled();
    const accepted = await app.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body,
    });
    expect(accepted.status).toBe(200);
    expect(restartVideo).toHaveBeenCalledWith(
      '826f4b87-6278-4275-bff5-535ba5ef438d',
      { forceReplan: true },
    );
  });

  it('blocks cross-origin ingest mutations before invoking the service', async () => {
    const restartIngest = vi.fn();
    const app = createTestApp(
      {},
      {},
      {},
      {
        podcastPipeline: {
          ...createPodcastPipelineService({
            config: readControlCenterConfig({}),
          }),
          restartIngest,
        },
      },
    );
    const response = await app.request(
      '/api/podcast-pipeline/826f4b87-6278-4275-bff5-535ba5ef438d/ingest/retry',
      {
        method: 'POST',
        headers: {
          Origin: 'https://evil.example',
          'Sec-Fetch-Site': 'cross-site',
        },
      },
    );
    expect(response.status).toBe(403);
    expect(restartIngest).not.toHaveBeenCalled();
    const allowed = await app.request(
      '/api/podcast-pipeline/826f4b87-6278-4275-bff5-535ba5ef438d/ingest/retry',
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
    );
    expect(allowed.status).toBe(200);
    expect(restartIngest).toHaveBeenCalledOnce();
  });

  it.each([false, true])(
    'does not expose cost collection as a dashboard mutation (authenticated: %s)',
    async (authenticated) => {
      const app = createTestApp(
        {},
        {},
        {},
        {
          auth: authenticated
            ? { username: 'operator', password: 'test-password' }
            : undefined,
        },
      );
      const response = await app.request('/api/costs/sync', {
        method: 'POST',
        headers: authenticated
          ? {
              Authorization: `Basic ${btoa('operator:test-password')}`,
              'Content-Type': 'application/json',
            }
          : { 'Content-Type': 'application/json' },
      });
      expect(response.status).toBe(404);
    },
  );

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

  it('serves the founder statements built from the same services every other route reads', async () => {
    const getOperations = vi.fn().mockResolvedValue(operations);
    const app = createTestApp({}, { getOperations });

    const response = await app.request('/api/statements');
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      statements: Array<{ domain: string }>;
      headers: Array<{ domain: string }>;
    };
    expect(body.statements).toHaveLength(5);
    expect(new Set(body.statements.map((s) => s.domain))).toEqual(
      new Set(['reliability', 'product', 'pipeline', 'spend', 'growth']),
    );
    expect(body.headers).toHaveLength(5);
    expect(getOperations).toHaveBeenCalledWith(false);
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

describe('API surface boundary', () => {
  it('answers an unmatched API path with JSON rather than an HTML shell', async () => {
    const response = await createTestApp().request('/api/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('application/json');
    await expect(response.json()).resolves.toEqual({ error: 'Not Found' });
  });

  it('answers an unmatched API path the same way for a mutation', async () => {
    const response = await createTestApp().request('/api/does-not-exist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('application/json');
  });

  // The catch-all above is registered after every real route. Hono composes
  // matching handlers into a chain, so this asserts the registered routes still
  // win it.
  it('keeps registered routes ahead of the catch-all', async () => {
    const response = await createTestApp().request('/api/overview');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
  });

  // A cacheable answer on an API path is what lets a single bad response
  // outlive its own fix: the browser gives it heuristic freshness and stops
  // asking the server for hours.
  it('forbids caching a matched API response', async () => {
    const response = await createTestApp().request('/api/overview');

    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('forbids caching the catch-all 404', async () => {
    const response = await createTestApp().request('/api/does-not-exist');

    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  // The alias used to travel on this payload naming failed-parent spend
  // "retry waste". A consumer reading it would republish that claim.
  it('serves podcast costs without the retryWaste alias', async () => {
    const response = await createTestApp().request('/api/costs/podcast');
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).not.toContain('retryWasteUsd');
    expect(JSON.parse(body).episodes[0]).toMatchObject({
      failedAttemptCostUsd: 0.2,
      confirmedRetryWasteUsd: null,
    });
  });
  it('serves unified growth with forced refresh and removes the obsolete route', async () => {
    const getGrowth = vi
      .fn()
      .mockResolvedValue({ status: 'unknown', lanes: [] });
    const app = createTestApp({}, { getGrowth });
    const response = await app.request('/api/growth?force=1');
    expect(response.status).toBe(200);
    expect(getGrowth).toHaveBeenCalledWith(true);
    expect((await app.request('/api/growth-journey')).status).toBe(404);
  });
});
