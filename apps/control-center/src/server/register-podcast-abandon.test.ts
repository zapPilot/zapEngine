import { describe, expect, it, vi } from 'vitest';

import { createControlCenterApp } from './app.js';
import { readControlCenterConfig } from './config/env.js';

const EPISODE_ID = '826f4b87-6278-4275-bff5-535ba5ef438d';

function appWith(service: { abandonVideo: ReturnType<typeof vi.fn> }) {
  return createControlCenterApp({
    config: readControlCenterConfig({}),
    podcastAbandon: service as never,
  });
}

function abandonRequest(
  app: ReturnType<typeof appWith>,
  episodeId = EPISODE_ID,
) {
  return app.request(`/api/podcast-pipeline/${episodeId}/abandon`, {
    method: 'POST',
  });
}

describe('podcast abandon operator route', () => {
  // The factory ends its chain with an `/api/*` catch-all, so a route the
  // entry points add to the returned app is shadowed into a 404. Assemble the
  // real app here rather than a bare Hono instance.
  it('is reachable on the fully assembled app', async () => {
    const response = await abandonRequest(
      createControlCenterApp({ config: readControlCenterConfig({}) }),
    );

    expect(response.status).not.toBe(404);
    await expect(response.json()).resolves.not.toEqual({ error: 'Not Found' });
  });

  it('marks one episode video pipeline abandoned', async () => {
    const abandonVideo = vi.fn().mockResolvedValue(undefined);
    const app = appWith({ abandonVideo });

    const response = await abandonRequest(app);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(abandonVideo).toHaveBeenCalledWith(EPISODE_ID);
  });

  it('rejects malformed episode ids before touching storage', async () => {
    const abandonVideo = vi.fn();
    const app = appWith({ abandonVideo });

    const response = await abandonRequest(app, 'not-a-uuid');

    expect(response.status).toBe(400);
    expect(abandonVideo).not.toHaveBeenCalled();
  });

  it('maps a missing video visual row to an operator conflict', async () => {
    const abandonVideo = vi.fn().mockRejectedValue({
      code: '22023',
      message: 'Episode has no video visual job to abandon',
    });
    const app = appWith({ abandonVideo });

    const response = await abandonRequest(app);

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

    const response = await abandonRequest(app);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Podcast pipeline abandonment migration has not been applied yet',
    });
  });
});
