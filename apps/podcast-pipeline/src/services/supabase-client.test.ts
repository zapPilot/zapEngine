import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  client: {},
  createClient: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}));

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
  it('creates one shared client with the read-retry transport', () => {
    mocks.createClient.mockReturnValue(mocks.client);

    expect(getPipelineSupabase()).toBe(mocks.client);
    expect(getPipelineSupabase()).toBe(mocks.client);
    expect(mocks.createClient).toHaveBeenCalledOnce();
    expect(mocks.createClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'test-key',
      expect.objectContaining({
        global: { fetch: expect.any(Function) },
      }),
    );
  });
});

describe('createRetryingSupabaseFetch', () => {
  it('retries a transient network failure for a GET request', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const retryingFetch = createRetryingSupabaseFetch(fetcher, sleep);

    const response = await retryingFetch('https://example.test/rest/v1/episodes', {
      method: 'GET',
    });

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

    const response = await retryingFetch('https://example.test/rest/v1/episodes');

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
