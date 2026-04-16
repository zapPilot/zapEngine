import { createHealthRoutes } from '@routes/health';
import { Hono } from 'hono';

function createApp() {
  const app = new Hono();
  app.route('/health', createHealthRoutes());
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
    });
  });

  it('body has a timestamp in ISO 8601 format', async () => {
    const response = await createApp().request('http://localhost/health');
    const body = await response.json();
    expect(body.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
