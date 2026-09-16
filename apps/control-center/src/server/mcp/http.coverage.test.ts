import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { captureServerException } from '../observability/sentry.js';
import { registerOpsMcpHttp } from './http.js';
import type { OpsMcpOperations } from './types.js';

vi.mock('../observability/sentry.js', () => ({
  captureServerException: vi.fn(),
}));

vi.mock('@modelcontextprotocol/server', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@modelcontextprotocol/server')>();
  return {
    ...actual,
    createMcpHandler: vi.fn(actual.createMcpHandler),
  };
});

import { createMcpHandler } from '@modelcontextprotocol/server';

const TOKEN = 'secret-token';

function fakeOperations(): OpsMcpOperations {
  return {
    getOperations: vi.fn(),
    getSocial: vi.fn(),
    getCustomers: vi.fn(),
    getBacklog: vi.fn(),
    createBacklogItem: vi.fn(),
    claimBacklog: vi.fn(),
    releaseBacklog: vi.fn(),
    inspectSignal: vi.fn(),
    investigate: vi.fn(),
    resolveSentryIssue: vi.fn(),
  };
}

beforeEach(() => {
  vi.mocked(captureServerException).mockClear();
  vi.mocked(createMcpHandler).mockClear();
});

describe('Ops MCP HTTP failure boundary', () => {
  it('maps a transport failure to a 500 without leaking details', async () => {
    const failure = new Error('transport exploded');
    vi.mocked(createMcpHandler).mockReturnValueOnce({
      fetch: () => Promise.reject(failure),
    } as unknown as ReturnType<typeof createMcpHandler>);

    const app = new Hono();
    registerOpsMcpHttp(app, { operations: fakeOperations(), token: TOKEN });

    const response = await app.request('/api/mcp', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Internal Server Error',
    });
    expect(captureServerException).toHaveBeenCalledWith(failure, {
      method: 'POST',
      route: '/api/mcp',
    });
  });

  it('rejects a same-length bearer token in constant time', async () => {
    const app = new Hono();
    registerOpsMcpHttp(app, { operations: fakeOperations(), token: TOKEN });

    const response = await app.request('/api/mcp', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer wrong-token!',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'ping' }),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toBe('Bearer');
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(createMcpHandler).toHaveBeenCalledTimes(1);
  });
});
