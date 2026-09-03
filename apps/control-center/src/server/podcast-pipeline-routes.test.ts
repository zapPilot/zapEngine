import { describe, expect, it, vi } from 'vitest';

import { createControlCenterApp } from './app.js';
import { readControlCenterConfig } from './config/env.js';

const EPISODE_ID = '826f4b87-6278-4275-bff5-535ba5ef438d';

function createApp(pipeline: {
  getPipeline: ReturnType<typeof vi.fn>;
  restartIngest: ReturnType<typeof vi.fn>;
  restartVideo: ReturnType<typeof vi.fn>;
}) {
  return createControlCenterApp({
    config: readControlCenterConfig({}),
    podcastPipeline: pipeline as never,
    service: {
      getOverview: vi.fn(),
      getCostHistory: vi.fn(),
      syncCosts: vi.fn(),
      getSocial: vi.fn(),
    } as never,
    operations: {
      getOperations: vi.fn(),
      getSocial: vi.fn(),
      getCustomers: vi.fn(),
      inspectSignal: vi.fn(),
      resolveSentryIssue: vi.fn(),
      investigate: vi.fn(),
    } as never,
    socialGrowth: { getSocialGrowth: vi.fn() } as never,
    serveClient: false,
  });
}

function retryRequest(
  app: ReturnType<typeof createApp>,
  episodeId = EPISODE_ID,
  stage: 'ingest' | 'video' = 'video',
) {
  return app.request(`/api/podcast-pipeline/${episodeId}/${stage}/retry`, {
    method: 'POST',
  });
}

function retryApp(rejection?: unknown) {
  const restartIngest = vi.fn();
  const restartVideo = vi.fn();
  if (rejection === undefined) {
    restartIngest.mockResolvedValue(undefined);
    restartVideo.mockResolvedValue(undefined);
  } else {
    restartIngest.mockRejectedValue(rejection);
    restartVideo.mockRejectedValue(rejection);
  }
  return {
    app: createApp({ getPipeline: vi.fn(), restartIngest, restartVideo }),
    restartIngest,
    restartVideo,
  };
}

describe('podcast pipeline routes', () => {
  it('serves the current production phase read model', async () => {
    const getPipeline = vi.fn().mockResolvedValue({
      generatedAt: '2026-09-01T00:00:00.000Z',
      status: 'ok',
      message: null,
      episodes: [{ episodeId: 'episode-1', currentPhase: 'video' }],
    });
    const app = createApp({
      getPipeline,
      restartIngest: vi.fn(),
      restartVideo: vi.fn(),
    });

    const response = await app.request('/api/podcast-pipeline');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: 'ok',
      episodes: [{ currentPhase: 'video' }],
    });
    expect(getPipeline).toHaveBeenCalledOnce();
  });

  it('restarts ingest only through the explicit episode ingest endpoint', async () => {
    const { app, restartIngest } = retryApp();

    const response = await retryRequest(app, EPISODE_ID, 'ingest');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(restartIngest).toHaveBeenCalledWith(EPISODE_ID);
  });

  it('restarts video only through the explicit episode video endpoint', async () => {
    const { app, restartVideo } = retryApp();

    const response = await retryRequest(app);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(restartVideo).toHaveBeenCalledWith(EPISODE_ID);
  });

  it.each([
    ['55000', 'worker already owns this lease'],
    ['22023', 'audio prerequisites are incomplete'],
    ['23514', 'completed visual checkpoint is invalid'],
  ])('maps stable postgres code %s to a conflict', async (code, message) => {
    const { app, restartVideo } = retryApp({ code, message });

    const response = await retryRequest(app);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: message });
    expect(restartVideo).toHaveBeenCalledOnce();
  });

  it('maps an active ingest lease to a conflict', async () => {
    const { app, restartIngest } = retryApp({
      code: '55000',
      message: 'Episode ingest is currently processing',
    });

    const response = await retryRequest(app, EPISODE_ID, 'ingest');

    expect(response.status).toBe(409);
    expect(restartIngest).toHaveBeenCalledOnce();
  });

  it('keeps message matching as a compatibility fallback', async () => {
    const { app } = retryApp(
      new Error('Episode video generation is already completed'),
    );

    expect((await retryRequest(app)).status).toBe(409);
  });

  it('returns 503 for an unexpected retry failure', async () => {
    const { app } = retryApp(new Error('database offline'));

    const response = await retryRequest(app);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'database offline',
    });
  });

  it('rejects malformed episode ids before touching the database', async () => {
    const { app, restartVideo } = retryApp();

    const response = await retryRequest(app, 'not-a-uuid');

    expect(response.status).toBe(400);
    expect(restartVideo).not.toHaveBeenCalled();
  });
});
