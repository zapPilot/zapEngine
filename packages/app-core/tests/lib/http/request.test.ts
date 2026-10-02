import { APIError, NetworkError, TimeoutError } from '@core/lib/http';
import { httpRequest } from '@core/lib/http/request';
import { queryClient } from '@core/lib/state/queryClient';
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
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('serializes mutation bodies and accepts Cache-Control hints', async () => {
    const defaults = queryClient.getDefaultOptions();
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

    expect(queryClient.getDefaultOptions().queries).toMatchObject({
      staleTime: 60_000,
      gcTime: 180_000,
    });
    queryClient.setDefaultOptions(defaults);
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

  it('retries transient server failures with exponential delays', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({}, { status: 503 }))
      .mockRejectedValueOnce(new TypeError('connection reset'))
      .mockResolvedValueOnce(response({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const promise = httpRequest('https://example.test/items', {
      retries: 2,
      retryDelay: 100,
    });
    const assertion = expect(promise).resolves.toEqual({ ok: true });
    await vi.advanceTimersByTimeAsync(99);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(199);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves the final server error after exhausting retries', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(response({ message: 'unavailable' }, { status: 503 })),
      );
    vi.stubGlobal('fetch', fetchMock);
    const assertion = expect(
      httpRequest('https://example.test/items', {
        retries: 1,
        retryDelay: 100,
      }),
    ).rejects.toMatchObject({ status: 503, message: 'unavailable' });
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('retries a timed-out fetch with a fresh signal', async () => {
    vi.useFakeTimers();
    let firstSignal: AbortSignal | undefined;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce((_url: string, init: RequestInit) => {
        firstSignal = init.signal ?? undefined;
        return new Promise((_resolve, reject) =>
          firstSignal!.addEventListener(
            'abort',
            () => reject(new DOMException('aborted', 'AbortError')),
            { once: true },
          ),
        );
      })
      .mockImplementationOnce((_url: string, init: RequestInit) => {
        expect(init.signal).not.toBe(firstSignal);
        expect(init.signal?.aborted).toBe(false);
        return Promise.resolve(response({ ok: true }));
      });
    vi.stubGlobal('fetch', fetchMock);
    const assertion = expect(
      httpRequest('https://example.test/items', {
        timeout: 100,
        retries: 1,
        retryDelay: 50,
      }),
    ).resolves.toEqual({ ok: true });
    await vi.advanceTimersByTimeAsync(149);
    expect(firstSignal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not fetch when the caller signal is already aborted', async () => {
    const external = new AbortController();
    external.abort();
    const fetchMock = vi.fn().mockResolvedValue(response({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      httpRequest('https://example.test/items', { signal: external.signal }),
    ).rejects.toBeInstanceOf(TimeoutError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not retry after caller cancellation', async () => {
    vi.useFakeTimers();
    const external = new AbortController();
    const fetchMock = vi.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          const abort = () => reject(new DOMException('aborted', 'AbortError'));
          if (init.signal?.aborted) abort();
          else init.signal?.addEventListener('abort', abort, { once: true });
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const assertion = expect(
      httpRequest('https://example.test/items', {
        signal: external.signal,
        timeout: 100,
        retries: 2,
        retryDelay: 50,
      }),
    ).rejects.toBeInstanceOf(TimeoutError);
    external.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
    await assertion;
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('does not retry a client error even with a retry budget', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response({ message: 'bad input' }, { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      httpRequest('https://example.test/items', { retries: 2 }),
    ).rejects.toMatchObject({ status: 400, message: 'bad input' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('aborts a pending fetch at its deadline and cleans up timers', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => {
        signal = init.signal ?? undefined;
        return new Promise((_resolve, reject) =>
          signal!.addEventListener(
            'abort',
            () => reject(new DOMException('aborted', 'AbortError')),
            { once: true },
          ),
        );
      }),
    );
    const assertion = expect(
      httpRequest('https://example.test/slow', { timeout: 100, retries: 0 }),
    ).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(99);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
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

  it('falls back to the HTTP status when an error response has no message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response({}, { status: 500 })),
    );

    await expect(
      httpRequest('https://example.test/items', { retries: 0 }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof APIError && error.message === 'HTTP 500',
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
