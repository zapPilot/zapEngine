import { afterEach, describe, expect, it, vi } from 'vitest';

import { createBoundedSupabaseFetch } from './supabase-fetch.js';
import { createServiceRoleClient } from './supabase.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const stalledBody = () => new Response(new ReadableStream({ start() {} }));

describe('bounded Supabase transport', () => {
  it.each(['headers', 'body'] as const)(
    'bounds stalled %s even if cancellation is ignored',
    async (stage) => {
      vi.useFakeTimers();
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockImplementation(() =>
          stage === 'headers'
            ? new Promise(() => {})
            : Promise.resolve(stalledBody()),
        );
      const result = createBoundedSupabaseFetch(fetchImpl)(
        'https://db.example/rest/v1/rows',
      );
      const rejection = expect(result).rejects.toThrow(
        'Supabase request exceeded 10 seconds',
      );
      await vi.advanceTimersByTimeAsync(9_999);
      expect(fetchImpl.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await rejection;
      expect(fetchImpl.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('preserves caller cancellation while reading the body', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(stalledBody());
    const result = createBoundedSupabaseFetch(fetchImpl)('https://db.example', {
      signal: controller.signal,
    });
    const reason = new Error('operator stopped waiting');
    const rejection = expect(result).rejects.toBe(reason);
    await Promise.resolve();
    controller.abort(reason);
    await rejection;
    expect(fetchImpl.mock.calls[0]?.[1]?.signal?.reason).toBe(reason);
  });

  it('does not begin transport for an already-aborted Request', async () => {
    const controller = new AbortController();
    const reason = new Error('cancelled before transport');
    controller.abort(reason);
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(
      createBoundedSupabaseFetch(fetchImpl)(
        new Request('https://db.example', { signal: controller.signal }),
      ),
    ).rejects.toBe(reason);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('derives the method from a Request when init omits it', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('ignored', { status: 200 }));
    const response = await createBoundedSupabaseFetch(fetchImpl)(
      new Request('https://db.example', { method: 'HEAD' }),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });

  it.each([204, 205, 304])('preserves bodyless status %s', async (status) => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status }));
    const response =
      await createBoundedSupabaseFetch(fetchImpl)('https://db.example');
    expect(response.status).toBe(status);
    expect(await response.text()).toBe('');
  });

  it('preserves successful JSON, status, headers and cleans up the timer', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json([{ id: 1 }], {
        status: 201,
        headers: { 'content-range': '0-0/1' },
      }),
    );
    const response =
      await createBoundedSupabaseFetch(fetchImpl)('https://db.example');
    expect(response.status).toBe(201);
    expect(response.headers.get('content-range')).toBe('0-0/1');
    expect(await response.json()).toEqual([{ id: 1 }]);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('real SDK deadline and retry policy', () => {
  it.each([false, true])(
    'does not wait for Retry-After or replay HTTP 520 (schema client: %s)',
    async (switchSchema) => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json(
            { message: 'database unavailable' },
            { status: 520, headers: { 'retry-after': '60' } },
          ),
        );
      vi.stubGlobal('fetch', fetchImpl);
      const base = createServiceRoleClient(
        'https://db.example',
        'service-key',
        'ops',
      );
      const client = switchSchema ? base.schema('public') : base;
      const result = await client.from('rows').select('*');
      expect(result.status).toBe(520);
      expect(result.error?.message).toBe('database unavailable');
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['headers', 'body'] as const)(
    'settles an SDK query with stalled %s at the transport deadline',
    async (stage) => {
      vi.useFakeTimers();
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockImplementation(() =>
          stage === 'headers'
            ? new Promise(() => {})
            : Promise.resolve(stalledBody()),
        );
      vi.stubGlobal('fetch', fetchImpl);
      const client = createServiceRoleClient(
        'https://db.example',
        'service-key',
      );
      const result = Promise.resolve(client.from('rows').select('*'));
      await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledOnce());
      await vi.advanceTimersByTimeAsync(10_000);
      expect((await result).error?.message).toContain(
        'Supabase request exceeded 10 seconds',
      );
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    },
  );

  it('preserves HEAD counts through the SDK', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(null, { headers: { 'content-range': '*/42' } }),
      );
    vi.stubGlobal('fetch', fetchImpl);
    const result = await createServiceRoleClient(
      'https://db.example',
      'service-key',
    )
      .from('rows')
      .select('id', { head: true, count: 'exact' });
    expect(result.error).toBeNull();
    expect(result.count).toBe(42);
    expect(result.data).toBeNull();
  });

  it('does not replay a failed mutation', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ message: 'write unavailable' }, { status: 503 }),
      );
    vi.stubGlobal('fetch', fetchImpl);
    const result = await createServiceRoleClient(
      'https://db.example',
      'service-key',
    ).rpc('test_mutation');
    expect(result.status).toBe(503);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[1]?.method).toBe('POST');
  });
});
