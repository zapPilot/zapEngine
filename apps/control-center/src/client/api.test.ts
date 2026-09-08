import { afterEach, describe, expect, it, vi } from 'vitest';

import { getJson, sendJson } from './api.js';

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function stubFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getJson', () => {
  it('returns the parsed body', async () => {
    stubFetch(json({ status: 'ok' }));

    await expect(getJson('/api/overview')).resolves.toEqual({ status: 'ok' });
  });

  // A stale SPA shell cached against an API path replays 200 text/html, which
  // `response.ok` accepts and `JSON.parse` then rejects as "Unexpected token
  // '<'". Naming the content type is what makes that diagnosable.
  it('names an HTML body instead of letting JSON.parse throw on it', async () => {
    stubFetch(
      new Response('<!doctype html><html></html>', {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    );

    await expect(getJson('/api/pipeline/queues')).rejects.toThrow(
      /Expected JSON from \/api\/pipeline\/queues, got text\/html/,
    );
  });

  it('names a body with no content-type at all', async () => {
    stubFetch(new Response('nope'));

    await expect(getJson('/api/overview')).rejects.toThrow(/Expected JSON/);
  });

  // Browsers raise their native credential prompt for navigations, not
  // reliably for fetch, so a 401 has to tell the operator how to sign in.
  it('tells the operator how to sign in on a 401', async () => {
    stubFetch(new Response('Unauthorized', { status: 401 }));

    await expect(getJson('/api/overview')).rejects.toThrow(/Not signed in/);
  });

  it('still reports a plain server error', async () => {
    stubFetch(json({ error: 'boom' }, 500));

    await expect(getJson('/api/overview')).rejects.toThrow('HTTP 500');
  });
});

describe('sendJson', () => {
  it('omits a body and its content-type when none is given', async () => {
    const fetchMock = stubFetch(json({ ok: true }));

    await sendJson('/api/costs/sync', 'POST');

    expect(fetchMock).toHaveBeenCalledWith('/api/costs/sync', {
      method: 'POST',
    });
  });

  it('sends a JSON body when one is given', async () => {
    const fetchMock = stubFetch(json({ ok: true }));

    await sendJson('/api/podcast-pipeline/x/video/retry', 'POST', {
      forceReplan: true,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/podcast-pipeline/x/video/retry',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"forceReplan":true}',
      },
    );
  });

  it('surfaces the rejection message the API supplies', async () => {
    stubFetch(json({ error: 'Invalid episode id' }, 400));

    await expect(
      sendJson('/api/podcast-pipeline/x/ingest/retry', 'POST'),
    ).rejects.toThrow('Invalid episode id');
  });

  it('tells the operator how to sign in on a 401', async () => {
    stubFetch(new Response('Unauthorized', { status: 401 }));

    await expect(
      sendJson('/api/podcast-pipeline/x/ingest/retry', 'POST'),
    ).rejects.toThrow(/Not signed in/);
  });
});
