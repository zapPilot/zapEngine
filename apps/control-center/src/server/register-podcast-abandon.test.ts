import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from './config/env.js';
import { registerPodcastAbandonRoute } from './register-podcast-abandon.js';

const EPISODE_ID = '826f4b87-6278-4275-bff5-535ba5ef438d';

function appWith(service: { abandonVideo: ReturnType<typeof vi.fn> }) {
  const app = new Hono();
  registerPodcastAbandonRoute(app, {
    config: readControlCenterConfig({}),
    service: service as never,
  });
  return app;
}

describe('podcast abandon operator route', () => {
  it('marks one episode video pipeline abandoned', async () => {
    const abandonVideo = vi.fn().mockResolvedValue(undefined);
    const app = appWith({ abandonVideo });

    const response = await app.request(
      `/api/podcast-pipeline/${EPISODE_ID}/abandon`,
      { method: 'POST' },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(abandonVideo).toHaveBeenCalledWith(EPISODE_ID);
  });

  it('rejects malformed episode ids before touching storage', async () => {
    const abandonVideo = vi.fn();
    const app = appWith({ abandonVideo });

    const response = await app.request(
      '/api/podcast-pipeline/not-a-uuid/abandon',
      { method: 'POST' },
    );

    expect(response.status).toBe(400);
    expect(abandonVideo).not.toHaveBeenCalled();
  });

  it('maps a missing video visual row to an operator conflict', async () => {
    const abandonVideo = vi.fn().mockRejectedValue({
      code: '22023',
      message: 'Episode has no video visual job to abandon',
    });
    const app = appWith({ abandonVideo });

    const response = await app.request(
      `/api/podcast-pipeline/${EPISODE_ID}/abandon`,
      { method: 'POST' },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'Episode has no video visual job to abandon',
    });
  });

  it('surfaces a missing abandon column as a deploy-order failure', async () => {
    const abandonVideo = vi.fn().mockRejectedValue({
      code: '42703',
      message: 'column abandoned_at does not exist',
    });
    const app = appWith({ abandonVideo });

    const response = await app.request(
      `/api/podcast-pipeline/${EPISODE_ID}/abandon`,
      { method: 'POST' },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Podcast pipeline abandonment migration has not been applied yet',
    });
  });
});
