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

describe('podcast abandon route coverage', () => {
  it('maps a generic failure to 503 with the PostgREST message', async () => {
    const abandonVideo = vi.fn().mockRejectedValue(new Error('db down'));
    const app = appWith({ abandonVideo });
    const response = await app.request(
      `/api/podcast-pipeline/${EPISODE_ID}/abandon`,
      { method: 'POST' },
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'db down' });
  });

  it('falls back to the generic message for a non-Error rejection', async () => {
    const abandonVideo = vi.fn().mockRejectedValue('boom');
    const app = appWith({ abandonVideo });
    const response = await app.request(
      `/api/podcast-pipeline/${EPISODE_ID}/abandon`,
      { method: 'POST' },
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Podcast abandon failed',
    });
  });
});
