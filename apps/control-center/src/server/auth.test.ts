import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { createControlCenterApp } from './app.js';
import { requireControlCenterAuth } from './config/auth.js';
import { readControlCenterConfig } from './config/env.js';
import { registerOpsMcpHttp } from './mcp/http.js';

const AUTH = { username: 'operator', password: 'a-long-random-password' };
const HEADER = `Basic ${Buffer.from(`${AUTH.username}:${AUTH.password}`).toString('base64')}`;

function createGuardedApp() {
  return createControlCenterApp({
    config: readControlCenterConfig({}),
    auth: AUTH,
    service: {
      getOverview: vi.fn().mockResolvedValue({}),
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
    } as never,
  });
}

describe('remote dashboard authentication', () => {
  it('refuses an anonymous read', async () => {
    const response = await createGuardedApp().request('/api/overview');

    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain('Basic');
  });

  // The anonymous production surface accepted these before the guard existed:
  // the handler answered 400 "Invalid episode id", proving the request reached
  // application code. Only a 401 here means the mutation is actually closed.
  it('refuses an anonymous mutation before it reaches the handler', async () => {
    const response = await createGuardedApp().request(
      '/api/podcast-pipeline/not-a-valid-uuid/ingest/retry',
      { method: 'POST' },
    );

    expect(response.status).toBe(401);
  });

  it('refuses the wrong password', async () => {
    const response = await createGuardedApp().request('/api/overview', {
      headers: {
        Authorization: `Basic ${Buffer.from(`${AUTH.username}:wrong`).toString('base64')}`,
      },
    });

    expect(response.status).toBe(401);
  });

  it('accepts the configured credentials', async () => {
    const response = await createGuardedApp().request('/api/overview', {
      headers: { Authorization: HEADER },
    });

    expect(response.status).toBe(200);
  });

  it('leaves an unguarded app open for local development', async () => {
    const response = await createControlCenterApp({
      config: readControlCenterConfig({}),
      service: {
        getOverview: vi.fn().mockResolvedValue({}),
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
    }).request('/api/overview');

    expect(response.status).toBe(200);
  });
});

// One Authorization header cannot carry Basic and Bearer at once, so the MCP
// endpoint has to stay outside the Basic guard or its bearer clients would be
// permanently locked out.
describe('remote MCP stays on its own bearer boundary', () => {
  it('is not intercepted by the Basic guard', async () => {
    const response = await createGuardedApp().request('/api/mcp', {
      method: 'POST',
    });

    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toBe('Bearer');
  });

  it('accepts its own bearer token while the dashboard is guarded', async () => {
    const app = new Hono();
    registerOpsMcpHttp(app, {
      operations: { getOperations: vi.fn() } as never,
      token: 'mcp-token',
    });

    const response = await app.request('/api/mcp', {
      method: 'POST',
      headers: { Authorization: 'Bearer mcp-token' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    });

    expect(response.status).not.toBe(401);
  });
});

describe('requireControlCenterAuth', () => {
  it('refuses to boot without a username', () => {
    expect(() =>
      requireControlCenterAuth(
        readControlCenterConfig({ OPS_AUTH_PASSWORD: 'secret' }),
      ),
    ).toThrow('Missing required environment variable: OPS_AUTH_USERNAME');
  });

  it('refuses to boot without a password', () => {
    expect(() =>
      requireControlCenterAuth(
        readControlCenterConfig({ OPS_AUTH_USERNAME: 'operator' }),
      ),
    ).toThrow('Missing required environment variable: OPS_AUTH_PASSWORD');
  });

  it('refuses to boot on a blank password', () => {
    expect(() =>
      requireControlCenterAuth(
        readControlCenterConfig({
          OPS_AUTH_USERNAME: 'operator',
          OPS_AUTH_PASSWORD: '   ',
        }),
      ),
    ).toThrow('Missing required environment variable: OPS_AUTH_PASSWORD');
  });

  it('returns both credentials when configured', () => {
    expect(
      requireControlCenterAuth(
        readControlCenterConfig({
          OPS_AUTH_USERNAME: 'operator',
          OPS_AUTH_PASSWORD: 'secret',
        }),
      ),
    ).toEqual({ username: 'operator', password: 'secret' });
  });
});
