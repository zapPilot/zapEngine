import { HTTPException } from 'hono/http-exception';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createControlCenterApp } from './app.js';
import { readControlCenterConfig } from './config/env.js';
import { captureServerException } from './observability/sentry.js';

const operatorState = vi.hoisted(() => ({
  historyImpl: null as null | (() => Promise<unknown>),
  historyCalls: 0,
}));

const cleanupState = vi.hoisted(() => ({
  closeImpl: null as null | ((episodeId: string) => Promise<unknown>),
  closeCalls: [] as string[],
}));

vi.mock('./observability/sentry.js', () => ({
  captureServerException: vi.fn(),
}));

vi.mock('./services/operations/operator/store.js', () => ({
  createOperatorStore: () => ({
    history: () => {
      operatorState.historyCalls += 1;
      return operatorState.historyImpl!();
    },
  }),
}));

vi.mock('./services/social-release-cleanup.js', () => ({
  createSocialReleaseCleanupService: () => ({
    getEvidence: async () => ({
      generatedAt: '2026-09-28T00:00:00.000Z',
      posts: [],
      message: null,
    }),
    closeRelease: (episodeId: string) => {
      cleanupState.closeCalls.push(episodeId);
      return cleanupState.closeImpl!(episodeId);
    },
  }),
}));

const EPISODE_ID = '826f4b87-6278-4275-bff5-535ba5ef438d';

function buildApp(input: {
  service?: Record<string, ReturnType<typeof vi.fn>>;
  operations?: Record<string, ReturnType<typeof vi.fn>>;
  visual?: Record<string, ReturnType<typeof vi.fn>>;
  allowCostSync?: boolean;
}) {
  return createControlCenterApp({
    config: readControlCenterConfig({}),
    service: {
      getOverview: vi.fn().mockResolvedValue({ ok: true }),
      getCostHistory: vi.fn().mockResolvedValue({
        currentMonthDaily: [],
        monthlyTotals: [],
      }),
      syncCosts: vi.fn().mockResolvedValue({
        syncedAt: '2026-09-28T00:00:00.000Z',
        persisted: 0,
        providers: [],
      }),
      getSocial: vi.fn().mockResolvedValue({ status: 'ok' }),
      ...input.service,
    } as never,
    operations: {
      getCommunity: vi.fn().mockResolvedValue({ status: 'unavailable' }),
      getGrowth: vi.fn().mockResolvedValue({ status: 'unknown' }),
      getOperations: vi.fn().mockResolvedValue({ status: 'ok' }),
      getSocial: vi.fn().mockResolvedValue({ status: 'ok' }),
      getCustomers: vi.fn().mockResolvedValue({ status: 'ok' }),
      inspectSignal: vi.fn(),
      resolveSentryIssue: vi.fn(),
      investigate: vi.fn(),
      ...input.operations,
    } as never,
    socialGrowth: {
      getSocialGrowth: vi.fn().mockResolvedValue({ status: 'ok' }),
    } as never,
    podcastPipeline: {
      getPipeline: vi.fn(),
      restartIngest: vi.fn(),
      restartVideo: vi.fn(),
      restartRender: vi.fn(),
    } as never,
    podcastVisual: {
      getVisualDebug: vi.fn(),
      upsertReview: vi.fn(),
      resolveReview: vi.fn(),
      ...input.visual,
    } as never,
    allowCostSync: input.allowCostSync,
  });
}

function jsonRequest(
  app: ReturnType<typeof buildApp>,
  path: string,
  method: 'PUT' | 'POST',
  body: unknown,
) {
  return app.request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  operatorState.historyImpl = null;
  operatorState.historyCalls = 0;
  cleanupState.closeImpl = null;
  cleanupState.closeCalls = [];
  vi.mocked(captureServerException).mockClear();
});

describe('control center coverage gaps', () => {
  it('serves the persisted cost history read model', async () => {
    const getCostHistory = vi.fn().mockResolvedValue({
      currentMonthDaily: [{ date: '2026-09-28', totalUsd: 1.5 }],
      monthlyTotals: [],
    });
    const app = buildApp({ service: { getCostHistory } });

    const response = await app.request('/api/costs/history');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      currentMonthDaily: [{ date: '2026-09-28', totalUsd: 1.5 }],
    });
    expect(getCostHistory).toHaveBeenCalledOnce();
  });

  it('maps a cost sync failure to 503 with the provider message', async () => {
    const failure = { message: 'Cost snapshot write failed', code: 'XX000' };
    const syncCosts = vi.fn().mockRejectedValue(failure);
    const app = buildApp({ service: { syncCosts } });

    const response = await app.request('/api/costs/sync', { method: 'POST' });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Cost snapshot write failed',
    });
    expect(captureServerException).toHaveBeenCalledWith(failure, {
      method: 'POST',
      route: '/api/costs/sync',
    });
  });

  it('serves operator history rows', async () => {
    operatorState.historyImpl = async () => [{ fingerprint: 'op-1' }];
    const app = buildApp({});

    const response = await app.request('/api/operations/operator-history');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([{ fingerprint: 'op-1' }]);
    expect(operatorState.historyCalls).toBe(1);
  });

  it('maps an operator store failure to 503', async () => {
    operatorState.historyImpl = async () => {
      throw new Error('store down');
    };
    const app = buildApp({});

    const response = await app.request('/api/operations/operator-history');

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Operator history is unavailable.',
    });
  });

  it('rejects a malformed release id before touching the service', async () => {
    cleanupState.closeImpl = async () => ({ ok: true });
    const app = buildApp({});

    const response = await app.request(
      '/api/operations/social/not-a-uuid/complete',
      { method: 'POST' },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid episode id',
    });
    expect(cleanupState.closeCalls).toEqual([]);
  });

  it('maps a missing release RPC to the migration message', async () => {
    cleanupState.closeImpl = async () => {
      throw Object.assign(new Error('function not found'), {
        code: 'PGRST202',
      });
    };
    const app = buildApp({});

    const response = await app.request(
      `/api/operations/social/${EPISODE_ID}/complete`,
      { method: 'POST' },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Social release cleanup migration has not been applied yet',
    });
    expect(cleanupState.closeCalls).toEqual([EPISODE_ID]);
  });

  it('maps an unexpected release failure to 503', async () => {
    const failure = new Error('database offline');
    cleanupState.closeImpl = async () => {
      throw failure;
    };
    const app = buildApp({});

    const response = await app.request(
      `/api/operations/social/${EPISODE_ID}/complete`,
      { method: 'POST' },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'database offline',
    });
    expect(captureServerException).toHaveBeenCalledWith(failure, {
      method: 'POST',
      route: '/api/operations/social/:episodeId/complete',
    });
  });

  it('serves the pipeline queue read model', async () => {
    const app = buildApp({});

    const response = await app.request('/api/pipeline/queues');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: 'unconfigured',
    });
  });

  it('forwards a supported social window instead of falling back', async () => {
    const getSocial = vi.fn().mockResolvedValue({ status: 'ok' });
    const app = buildApp({ service: { getSocial } });

    const response = await app.request('/api/social-performance?window=24h');

    expect(response.status).toBe(200);
    expect(getSocial).toHaveBeenCalledWith('24h');
  });

  it('answers a client error from the global handler without capturing', async () => {
    const getOverview = vi
      .fn()
      .mockRejectedValue(new HTTPException(400, { message: 'bad input' }));
    const app = buildApp({ service: { getOverview } });

    const response = await app.request('/api/overview');

    expect(response.status).toBe(400);
    expect(captureServerException).not.toHaveBeenCalled();
  });

  it('captures a server HTTP exception from the global handler', async () => {
    const failure = new HTTPException(500, { message: 'boom' });
    const getOverview = vi.fn().mockRejectedValue(failure);
    const app = buildApp({ service: { getOverview } });

    const response = await app.request('/api/overview');

    expect(response.status).toBe(500);
    expect(captureServerException).toHaveBeenCalledWith(failure, {
      method: 'GET',
      route: '/api/overview',
    });
  });

  it('maps an unexpected handler throw to plain-text 500', async () => {
    const failure = new Error('kaput');
    const getOverview = vi.fn().mockRejectedValue(failure);
    const app = buildApp({ service: { getOverview } });

    const response = await app.request('/api/overview');

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.toBe('Internal Server Error');
    expect(captureServerException).toHaveBeenCalledWith(failure, {
      method: 'GET',
      route: '/api/overview',
    });
  });

  it('rethows an unexpected review failure to the global handler', async () => {
    const failure = new Error('review store offline');
    const upsertReview = vi.fn().mockRejectedValue(failure);
    const app = buildApp({ visual: { upsertReview } });

    const response = await jsonRequest(
      app,
      `/api/podcast-pipeline/${EPISODE_ID}/reviews`,
      'PUT',
      { verdict: 'good', issueCategories: [] },
    );

    expect(response.status).toBe(500);
    expect(captureServerException).toHaveBeenCalledWith(failure, {
      method: 'PUT',
      route: '/api/podcast-pipeline/:episodeId/reviews',
    });
  });

  it('trims a whitespace-only review note to null', async () => {
    const upsertReview = vi.fn().mockResolvedValue({ ok: true });
    const app = buildApp({ visual: { upsertReview } });

    const response = await jsonRequest(
      app,
      `/api/podcast-pipeline/${EPISODE_ID}/reviews`,
      'PUT',
      { verdict: 'good', issueCategories: [], note: '   ' },
    );

    expect(response.status).toBe(200);
    expect(upsertReview).toHaveBeenCalledWith(
      EPISODE_ID,
      expect.objectContaining({ note: null }),
    );
  });

  it('coerces a non-string review note to null', async () => {
    const upsertReview = vi.fn().mockResolvedValue({ ok: true });
    const app = buildApp({ visual: { upsertReview } });

    const response = await jsonRequest(
      app,
      `/api/podcast-pipeline/${EPISODE_ID}/reviews`,
      'PUT',
      { verdict: 'good', issueCategories: [], note: 123 },
    );

    expect(response.status).toBe(200);
    expect(upsertReview).toHaveBeenCalledWith(
      EPISODE_ID,
      expect.objectContaining({ note: null }),
    );
  });
});
