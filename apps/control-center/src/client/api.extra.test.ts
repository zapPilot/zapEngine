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

describe('sendJson coverage', () => {
  it('resolves null for a 204 with no body', async () => {
    stubFetch(new Response(null, { status: 204 }));

    await expect(sendJson('/api/reviews/resolve', 'POST')).resolves.toBeNull();
  });

  it('resolves null when a successful response has no JSON body', async () => {
    stubFetch(
      new Response('<!doctype html><html></html>', {
        headers: { 'content-type': 'text/html' },
      }),
    );

    await expect(sendJson('/api/costs/sync', 'POST')).resolves.toBeNull();
  });

  it('names a rejected body with no usable message', async () => {
    // The rejection body parses but names nothing, so the helper falls back
    // to reading the response itself before reporting the status.
    const response = json({ unexpected: true }, 500);
    vi.spyOn(response, 'json')
      .mockResolvedValueOnce({ unexpected: true })
      .mockResolvedValueOnce({ unexpected: true });
    stubFetch(response);

    await expect(sendJson('/api/costs/sync', 'POST')).rejects.toThrow('HTTP 500');
  });

  it('names a rejected HTML body instead of its parse failure', async () => {
    stubFetch(
      new Response('<!doctype html><html></html>', {
        status: 500,
        headers: { 'content-type': 'text/html' },
      }),
    );

    await expect(sendJson('/api/costs/sync', 'POST')).rejects.toThrow(
      /Expected JSON from \/api\/costs\/sync, got text\/html/,
    );
  });

  it('reports a non-JSON rejection on a GET as well', async () => {
    stubFetch(new Response('Bad Gateway', { status: 502 }));

    await expect(getJson('/api/overview')).rejects.toThrow(/Expected JSON/);
  });
});
