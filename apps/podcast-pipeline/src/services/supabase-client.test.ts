import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/env.js', () => ({
  getRequiredEnv: vi.fn((key: string) => {
    if (key === 'SUPABASE_URL') return 'https://example.supabase.co';
    if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'test-key';
    throw new Error(`Unknown env: ${key}`);
  }),
}));

import {
  createRetryingSupabaseFetch,
  getPipelineSupabase,
  throwSupabaseError,
} from './supabase-client.js';

describe('getPipelineSupabase', () => {
  it('bounds actual SDK reads to three transport attempts and mutations to one', async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new TypeError('fetch failed'));
    try {
      const client = getPipelineSupabase();
      expect(getPipelineSupabase()).toBe(client);
      const result = Promise.resolve(client.from('episodes').select('id'));
      await vi.runAllTimersAsync();
      expect((await result).error).not.toBeNull();
      expect(fetcher).toHaveBeenCalledTimes(3);
      expect(
        new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('accept-profile'),
      ).toBe('from_fed_to_chain');
      fetcher
        .mockClear()
        .mockImplementation(async () => new Response('{}', { status: 503 }));
      const unavailable = Promise.resolve(
        client.schema('from_fed_to_chain').from('episodes').select('id'),
      );
      await vi.runAllTimersAsync();
      expect((await unavailable).status).toBe(503);
      expect(fetcher).toHaveBeenCalledTimes(3);
      fetcher.mockClear();
      await client.from('episodes').insert({ id: 'test' });
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      fetcher.mockRestore();
      vi.useRealTimers();
    }
  });
});

describe('createRetryingSupabaseFetch', () => {
  it('does not retry request construction errors', async () => {
    const failure = new TypeError('Invalid URL');
    const fetcher = vi.fn().mockRejectedValue(failure);
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(
      createRetryingSupabaseFetch(fetcher, sleep)('invalid'),
    ).rejects.toBe(failure);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('honors a Request cancellation reason without replaying it', async () => {
    const controller = new AbortController();
    const reason = new Error('operator cancelled');
    const request = new Request('https://example.test', {
      signal: controller.signal,
    });
    const fetcher = vi.fn().mockImplementation(() => {
      controller.abort(reason);
      throw reason;
    });
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(
      createRetryingSupabaseFetch(fetcher, sleep)(request),
    ).rejects.toBe(reason);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('stops before another attempt when cancelled during backoff', async () => {
    const controller = new AbortController();
    const reason = new Error('operator cancelled');
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 503 }));
    const sleep = vi
      .fn()
      .mockImplementation(async () => controller.abort(reason));
    await expect(
      createRetryingSupabaseFetch(fetcher, sleep)('https://example.test', {
        signal: controller.signal,
      }),
    ).rejects.toBe(reason);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('retries a transient network failure for a GET request', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const retryingFetch = createRetryingSupabaseFetch(fetcher, sleep);

    const response = await retryingFetch(
      'https://example.test/rest/v1/episodes',
      {
        method: 'GET',
      },
    );

    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(250);
  });

  it('retries retryable HTTP responses with exponential backoff', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(new Response('{}', { status: 429 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const retryingFetch = createRetryingSupabaseFetch(fetcher, sleep);

    const response = await retryingFetch(
      'https://example.test/rest/v1/episodes',
    );

    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[250], [500]]);
  });

  it('never retries mutations after a transport failure', async () => {
    const failure = new TypeError('fetch failed');
    const fetcher = vi.fn().mockRejectedValue(failure);
    const sleep = vi.fn().mockResolvedValue(undefined);
    const retryingFetch = createRetryingSupabaseFetch(fetcher, sleep);

    await expect(
      retryingFetch('https://example.test/rest/v1/episodes', {
        method: 'POST',
        body: '{}',
      }),
    ).rejects.toBe(failure);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('does not replay an aborted read', async () => {
    const controller = new AbortController();
    controller.abort();
    const failure = new DOMException('aborted', 'AbortError');
    const fetcher = vi.fn().mockRejectedValue(failure);
    const sleep = vi.fn().mockResolvedValue(undefined);
    const retryingFetch = createRetryingSupabaseFetch(fetcher, sleep);

    await expect(
      retryingFetch('https://example.test/rest/v1/episodes', {
        signal: controller.signal,
      }),
    ).rejects.toBe(failure);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});

describe('throwSupabaseError', () => {
  it('preserves Error instances', () => {
    const error = new Error('query failed');

    expect(() => throwSupabaseError(error)).toThrow(error);
  });

  it('formats Supabase error metadata', () => {
    expect.assertions(1);
    const error = {
      code: 'PGRST204',
      message: 'Column not found',
      details: 'Missing classroom_hls_url',
      hint: 'Refresh the schema cache',
    };

    try {
      throwSupabaseError(error);
    } catch (caught) {
      expect(caught).toMatchObject({
        message:
          '[PGRST204] Column not found Details: Missing classroom_hls_url Hint: Refresh the schema cache',
        cause: error,
        supabaseError: error,
      });
    }
  });

  it('uses a stable fallback for unstructured objects', () => {
    expect(() => throwSupabaseError({})).toThrow('Supabase request failed');
  });
});
