import { createHealthRoutes } from '@routes/health';
import { Hono } from 'hono';

function createApp(
  rawEnv: { APP_BUILD_TIME?: string; APP_COMMIT_SHA?: string } = {},
) {
  const app = new Hono();
  app.route('/health', createHealthRoutes(rawEnv));
  return app;
}

describe('GET /health', () => {
  it('returns 200', async () => {
    const response = await createApp().request('http://localhost/health');
    expect(response.status).toBe(200);
  });

  it('body has status "ok" and service "account-engine"', async () => {
    const response = await createApp().request('http://localhost/health');
    await expect(response.json()).resolves.toMatchObject({
      status: 'ok',
      service: 'account-engine',
      commitSha: null,
      buildTime: null,
    });
  });

  it('body has a timestamp in ISO 8601 format', async () => {
    const response = await createApp().request('http://localhost/health');
    const body = await response.json();
    expect(body.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('includes release metadata when present', async () => {
    const response = await createApp({
      APP_COMMIT_SHA: 'ac3c1eeb7778c002007b311fe557a35870249eaa',
      APP_BUILD_TIME: '2026-04-19T11:00:00Z',
    }).request('http://localhost/health');

    await expect(response.json()).resolves.toMatchObject({
      commitSha: 'ac3c1eeb7778c002007b311fe557a35870249eaa',
      buildTime: '2026-04-19T11:00:00Z',
    });
  });
});
