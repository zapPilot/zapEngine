import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { registerOpsMcpHttp } from './http.js';
import type { OpsMcpOperations } from './types.js';

function fakeOperations(): OpsMcpOperations {
  return {
    getOperations: vi.fn(),
    getSocial: vi.fn(),
    getCustomers: vi.fn(),
  };
}

describe('Ops MCP HTTP auth', () => {
  it('fails closed when remote MCP has no token configured', async () => {
    const app = new Hono();
    registerOpsMcpHttp(app, { operations: fakeOperations() });

    const response = await app.request('/api/mcp', { method: 'POST' });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Ops MCP remote access is not configured.',
    });
  });

  it('rejects requests without the configured bearer token', async () => {
    const app = new Hono();
    registerOpsMcpHttp(app, {
      operations: fakeOperations(),
      token: 'secret-token',
    });

    const response = await app.request('/api/mcp', { method: 'POST' });

    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toBe('Bearer');
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('rejects the wrong bearer token', async () => {
    const app = new Hono();
    registerOpsMcpHttp(app, {
      operations: fakeOperations(),
      token: 'secret-token',
    });

    const response = await app.request('/api/mcp', {
      method: 'POST',
      headers: { Authorization: 'Bearer wrong-token' },
    });

    expect(response.status).toBe(401);
  });
});
