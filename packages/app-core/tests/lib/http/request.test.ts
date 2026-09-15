import { APIError, NetworkError, TimeoutError } from '@core/lib/http';
import { httpRequest } from '@core/lib/http/request';
import { afterEach, describe, expect, it, vi } from 'vitest';

function response(
  body: unknown,
  options: { status?: number; headers?: HeadersInit } = {},
) {
  const status = options.status ?? 200;
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}

describe('httpRequest', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('serializes mutation bodies and accepts Cache-Control hints', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response(
        { ok: true },
        {
          headers: {
            'Cache-Control': 'public, max-age=60, stale-while-revalidate=120',
          },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      httpRequest<{ ok: boolean }>('https://example.test/items', {
        method: 'POST',
        body: { amount: 3 },
        headers: { Authorization: 'Bearer token' },
        retries: 0,
      }),
    ).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/items',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ amount: 3 }),
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer token',
        }),
      }),
    );
  });

  it('keeps GET bodies off the request even when one is supplied', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await httpRequest('https://example.test/items', {
      method: 'GET',
      body: { ignored: true },
      retries: 0,
    });

    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty('body');
  });

  it('normalizes an aborted fetch as TimeoutError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError')),
    );

    await expect(
      httpRequest('https://example.test/slow', { retries: 0 }),
    ).rejects.toBeInstanceOf(TimeoutError);
  });

  it('preserves APIError responses instead of wrapping them as network errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          response(
            { message: 'bad request', code: 'BAD_INPUT' },
            { status: 400 },
          ),
        ),
    );

    await expect(
      httpRequest('https://example.test/items', { retries: 0 }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof APIError &&
        error.status === 400 &&
        error.message === 'bad request',
    );
  });

  it('stops retrying and wraps an exhausted transport failure as NetworkError', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('network down'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      httpRequest('https://example.test/items', { retries: 0 }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof NetworkError && error.message.includes('network down'),
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('uses the defensive default message when an invalid negative retry count skips execution', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      httpRequest('https://example.test/items', { retries: -1 }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof NetworkError &&
        error.message.includes('Network request failed'),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
