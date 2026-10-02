import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { requestOriginGuard } from './request-origin-guard.js';

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
    'allows authenticated same-origin and non-browser clients: %o',
    async (headers) => {
      const { app, mutate } = guardedApp();
      const response = await app.request(
        'https://dashboard.example/api/retry',
        {
          method: 'POST',
          headers,
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
