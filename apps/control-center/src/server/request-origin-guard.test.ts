import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { localHostGuard, requestOriginGuard } from './request-origin-guard.js';

function guardedApp() {
  const mutate = vi.fn();
  const app = new Hono();
  app.use('/api/*', requestOriginGuard);
  app.all('/api/*', (context) => {
    mutate();
    return context.json({ ok: true });
  });
  return { app, mutate };
}

describe('requestOriginGuard', () => {
  it.each([
    undefined,
    'text/plain',
    'application/x-www-form-urlencoded',
    'multipart/form-data',
    'application/jsonp',
  ])(
    'rejects non-JSON mutation content type %s before the handler',
    async (contentType) => {
      const { app, mutate } = guardedApp();
      const response = await app.request(
        'https://dashboard.example/api/retry',
        {
          method: 'POST',
          headers: contentType ? { 'Content-Type': contentType } : {},
        },
      );
      expect(response.status).toBe(415);
      expect(mutate).not.toHaveBeenCalled();
    },
  );

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'allows JSON media types with charset for %s',
    async (method) => {
      const { app, mutate } = guardedApp();
      const response = await app.request(
        'https://dashboard.example/api/retry',
        {
          method,
          headers: { 'Content-Type': 'Application/JSON; charset=utf-8' },
        },
      );
      expect(response.status).toBe(200);
      expect(mutate).toHaveBeenCalledOnce();
    },
  );
  it.each<Record<string, string>>([
    { 'Sec-Fetch-Site': 'cross-site' },
    { 'Sec-Fetch-Site': 'same-site' },
    { Origin: 'https://evil.example' },
    { Origin: 'null' },
    { Origin: 'https://dashboard.example:444' },
    { Origin: 'https://evil.example', 'Sec-Fetch-Site': 'same-origin' },
  ])('rejects explicit cross-origin mutations: %o', async (headers) => {
    const { app, mutate } = guardedApp();
    const response = await app.request('https://dashboard.example/api/retry', {
      method: 'POST',
      headers,
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Cross-origin mutation denied',
    });
    expect(mutate).not.toHaveBeenCalled();
  });

  it.each<Record<string, string>>([
    {},
    { 'Sec-Fetch-Site': 'none' },
    { 'Sec-Fetch-Site': 'same-origin' },
    { Origin: 'https://dashboard.example' },
    { Origin: 'https://dashboard.example', 'Sec-Fetch-Site': 'same-origin' },
  ])(
    'allows same-origin metadata and CLI clients without browser headers: %o',
    async (headers) => {
      const { app, mutate } = guardedApp();
      const response = await app.request(
        'https://dashboard.example/api/retry',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
        },
      );
      expect(response.status).toBe(200);
      expect(mutate).toHaveBeenCalledOnce();
    },
  );

  it.each([
    ['GET', '/api/overview'],
    ['HEAD', '/api/overview'],
    ['POST', '/api/mcp'],
  ])('leaves %s %s to its existing access checks', async (method, path) => {
    const { app, mutate } = guardedApp();
    const response = await app.request(`https://dashboard.example${path}`, {
      method,
      headers: {
        Origin: 'https://other.example',
        'Sec-Fetch-Site': 'cross-site',
      },
    });
    expect(response.status).toBe(200);
    expect(mutate).toHaveBeenCalledOnce();
  });
});

describe('localHostGuard', () => {
  it.each(['localhost:4174', '127.0.0.1:4175', '[::1]:4175'])(
    'allows the loopback host %s',
    async (host) => {
      const app = new Hono();
      app.use('/api/*', localHostGuard);
      app.get('/api/overview', (context) => context.json({ ok: true }));
      const response = await app.request(`http://${host}/api/overview`);
      expect(response.status).toBe(200);
    },
  );

  it('blocks rebinding hosts before either reads or mutations', async () => {
    const access = vi.fn();
    const app = new Hono();
    app.use('/api/*', localHostGuard);
    app.all('/api/*', (context) => {
      access();
      return context.json({ ok: true });
    });
    for (const method of ['GET', 'POST']) {
      const response = await app.request('http://evil.example/api/overview', {
        method,
      });
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: 'Unexpected local API host',
      });
    }
    expect(access).not.toHaveBeenCalled();
  });
});
