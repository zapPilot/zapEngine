import { createServer, type Server } from 'node:http';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { proxyAnalyticsRequest } from '../src/main/analyticsProxy';

describe('desktop analytics transport', () => {
  let server: Server;
  let origin: string;
  const upstreamFetch = vi.fn<typeof fetch>();

  beforeEach(async () => {
    upstreamFetch.mockReset();
    upstreamFetch.mockResolvedValue(
      new Response(JSON.stringify({ total_value: 123, earned: 4 }), {
        headers: {
          'content-type': 'application/json',
          'cache-control': 'private, max-age=60',
          'set-cookie': 'upstream-secret=value',
        },
      }),
    );
    server = createServer((req, res) => {
      void proxyAnalyticsRequest(
        req,
        res,
        'https://analytics.example',
        upstreamFetch,
      );
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('No server port');
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    if (!server.listening) return;
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it('delivers portfolio JSON and cache hints without upstream CORS permission', async () => {
    const response = await fetch(
      `${origin}/__zap/analytics/api/v2/portfolio/user/landing?days=30`,
      {
        headers: {
          Origin: origin,
          Authorization: 'Bearer test-token',
          Cookie: 'local=value',
        },
      },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ total_value: 123, earned: 4 });
    expect(response.headers.get('cache-control')).toBe('private, max-age=60');
    expect(response.headers.get('set-cookie')).toBeNull();
    const [url, init] = upstreamFetch.mock.calls[0]!;
    expect(String(url)).toBe(
      'https://analytics.example/api/v2/portfolio/user/landing?days=30',
    );
    expect(init?.headers).toBeInstanceOf(Headers);
    const headers = init?.headers as Headers;
    expect(headers.get('authorization')).toBe('Bearer test-token');
    expect(headers.get('origin')).toBeNull();
    expect(headers.get('cookie')).toBeNull();
  });

  it('preserves analytics errors instead of turning them into missing data', async () => {
    upstreamFetch.mockResolvedValue(
      new Response('{"detail":"not found"}', { status: 404 }),
    );
    const response = await fetch(`${origin}/__zap/analytics/api/v2/missing`);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ detail: 'not found' });
  });

  it('forwards POST payloads for backtests', async () => {
    const payload = JSON.stringify({ days: 30 });
    await fetch(`${origin}/__zap/analytics/api/v3/backtest`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: payload,
    });
    const init = upstreamFetch.mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    expect(Buffer.from(init?.body as Uint8Array).toString()).toBe(payload);
  });

  it.each([
    ['Origin', 'https://unrelated.example'],
    ['Sec-Fetch-Site', 'cross-site'],
  ])(
    'rejects requests from another browser origin: %s',
    async (name, value) => {
      const response = await fetch(
        `${origin}/__zap/analytics/api/v2/portfolio`,
        {
          headers: { [name]: value },
        },
      );
      expect(response.status).toBe(403);
      expect(upstreamFetch).not.toHaveBeenCalled();
    },
  );

  it('rejects requests addressed to another host', async () => {
    // Host is a forbidden fetch header and cannot be spoofed directly,
    // so reach the same server through a different loopback name.
    const response = await fetch(
      `${origin.replace('127.0.0.1', 'localhost')}/__zap/analytics/api/v2/portfolio`,
    );
    expect(response.status).toBe(403);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it('does not accept arbitrary destination hosts', async () => {
    await fetch(`${origin}/__zap/analytics//unrelated.example/data`);
    expect(String(upstreamFetch.mock.calls[0]?.[0])).toBe(
      'https://analytics.example//unrelated.example/data',
    );
  });

  it('does not follow upstream redirects', async () => {
    upstreamFetch.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: 'https://unrelated.example' },
      }),
    );
    const response = await fetch(`${origin}/__zap/analytics/api/v2/portfolio`);
    expect(response.status).toBe(502);
    expect(upstreamFetch.mock.calls[0]?.[1]?.redirect).toBe('manual');
    expect(response.headers.get('location')).toBeNull();
  });

  it('rejects oversized bodies', async () => {
    const response = await fetch(`${origin}/__zap/analytics/api/v3/backtest`, {
      method: 'POST',
      body: 'x'.repeat(1024 * 1024 + 1),
    });
    expect(response.status).toBe(413);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it('rejects unsupported methods', async () => {
    const response = await fetch(`${origin}/__zap/analytics/api/v2/portfolio`, {
      method: 'DELETE',
    });
    expect(response.status).toBe(405);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it('reports upstream network failure', async () => {
    upstreamFetch.mockRejectedValue(new Error('offline'));
    const response = await fetch(`${origin}/__zap/analytics/api/v2/portfolio`);
    expect(response.status).toBe(502);
  });
});
