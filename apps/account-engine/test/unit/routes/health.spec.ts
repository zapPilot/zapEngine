import { Hono } from 'hono';

import {
  createHealthRoutes,
  getReleaseMetadata,
} from '../../../src/routes/health';

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

  it('normalizes whitespace-only and empty string values to null', async () => {
    const response = await createApp({
      APP_COMMIT_SHA: '   ',
      APP_BUILD_TIME: '',
    }).request('http://localhost/health');

    await expect(response.json()).resolves.toMatchObject({
      commitSha: null,
      buildTime: null,
    });
  });

  it('uses process.env as default when createHealthRoutes is called without arguments', async () => {
    const { Hono } = await import('hono');
    const app = new Hono();
    app.route('/health', createHealthRoutes());
    const response = await app.request('http://localhost/health');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('status', 'ok');
    expect(body).toHaveProperty('commitSha');
    expect(body).toHaveProperty('buildTime');
  });
});

describe('getReleaseMetadata', () => {
  it('uses process.env as default when called without arguments', () => {
    const result = getReleaseMetadata();
    expect(result).toHaveProperty('commitSha');
    expect(result).toHaveProperty('buildTime');
  });

  it('returns null for a whitespace-only commit SHA', () => {
    const result = getReleaseMetadata({ APP_COMMIT_SHA: '   ' });
    expect(result.commitSha).toBeNull();
  });

  it('returns null for an empty string build time', () => {
    const result = getReleaseMetadata({ APP_BUILD_TIME: '' });
    expect(result.buildTime).toBeNull();
  });

  it('returns values when both fields are set', () => {
    const result = getReleaseMetadata({
      APP_COMMIT_SHA: 'abc123',
      APP_BUILD_TIME: '2026-01-01T00:00:00Z',
    });
    expect(result.commitSha).toBe('abc123');
    expect(result.buildTime).toBe('2026-01-01T00:00:00Z');
  });
});
