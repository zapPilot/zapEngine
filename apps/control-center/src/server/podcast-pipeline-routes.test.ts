import { describe, expect, it, vi } from 'vitest';

import { createControlCenterApp } from './app.js';
import { readControlCenterConfig } from './config/env.js';

function createApp(pipeline: {
  getPipeline: ReturnType<typeof vi.fn>;
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

describe('podcast pipeline routes', () => {
  it('serves the current production phase read model', async () => {
    const getPipeline = vi.fn().mockResolvedValue({
      generatedAt: '2026-09-01T00:00:00.000Z',
      status: 'ok',
      message: null,
      episodes: [{ episodeId: 'episode-1', currentPhase: 'video' }],
    });
    const app = createApp({ getPipeline, restartVideo: vi.fn() });

    const response = await app.request('/api/podcast-pipeline');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: 'ok',
      episodes: [{ currentPhase: 'video' }],
    });
    expect(getPipeline).toHaveBeenCalledOnce();
  });

  it('restarts only through the explicit episode video endpoint', async () => {
    const restartVideo = vi.fn().mockResolvedValue(undefined);
    const app = createApp({ getPipeline: vi.fn(), restartVideo });
    const episodeId = '826f4b87-6278-4275-bff5-535ba5ef438d';

    const response = await app.request(
      `/api/podcast-pipeline/${episodeId}/video/retry`,
      { method: 'POST' },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(restartVideo).toHaveBeenCalledWith(episodeId);
  });

  it('returns a conflict instead of resetting a live render lease', async () => {
    const restartVideo = vi
      .fn()
      .mockRejectedValue(new Error('Episode video generation is currently processing'));
    const app = createApp({ getPipeline: vi.fn(), restartVideo });

    const response = await app.request(
      '/api/podcast-pipeline/826f4b87-6278-4275-bff5-535ba5ef438d/video/retry',
      { method: 'POST' },
    );

    expect(response.status).toBe(409);
    expect(restartVideo).toHaveBeenCalledOnce();
  });

  it('rejects malformed episode ids before touching the database', async () => {
    const restartVideo = vi.fn();
    const app = createApp({ getPipeline: vi.fn(), restartVideo });

    const response = await app.request(
      '/api/podcast-pipeline/not-a-uuid/video/retry',
      { method: 'POST' },
    );

    expect(response.status).toBe(400);
    expect(restartVideo).not.toHaveBeenCalled();
  });
});
