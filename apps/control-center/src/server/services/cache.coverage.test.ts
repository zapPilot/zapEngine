import { describe, expect, it, vi } from 'vitest';

import { createAsyncCache } from './cache.js';

describe('async cache pending coverage', () => {
  it('shares one in-flight load across concurrent readers', async () => {
    let resolveLoad!: (value: string) => void;
    const load = vi.fn(
      () => new Promise<string>((resolve) => (resolveLoad = resolve)),
    );
    const cache = createAsyncCache({ load, ttlMs: 1_000 });

    const first = cache.get();
    const second = cache.get();
    expect(load).toHaveBeenCalledTimes(1);

    resolveLoad('shared');
    await expect(first).resolves.toBe('shared');
    await expect(second).resolves.toBe('shared');
    expect(load).toHaveBeenCalledTimes(1);

    // The settled value is cached, so a later read does not reload.
    await expect(cache.get()).resolves.toBe('shared');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('clears the pending slot after a rejection so the next read retries', async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('recovered');
    const cache = createAsyncCache({ load, ttlMs: 1_000 });

    await expect(cache.get()).rejects.toThrow('boom');
    await expect(cache.get()).resolves.toBe('recovered');
    expect(load).toHaveBeenCalledTimes(2);
  });
});
