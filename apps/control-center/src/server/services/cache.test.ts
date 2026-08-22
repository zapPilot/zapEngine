import { describe, expect, it, vi } from 'vitest';

import { createAsyncCache } from './cache.js';

describe('async cache', () => {
  it('deduplicates loads, expires values, and supports forced refresh', async () => {
    let time = 100;
    const load = vi
      .fn()
      .mockResolvedValueOnce('first')
      .mockResolvedValue('second');
    const cache = createAsyncCache({ load, ttlMs: 10, now: () => time });

    await expect(cache.get()).resolves.toBe('first');
    await expect(cache.get()).resolves.toBe('first');
    expect(load).toHaveBeenCalledTimes(1);

    await expect(cache.get(true)).resolves.toBe('second');
    time = 121;
    await expect(cache.get()).resolves.toBe('second');
    expect(load).toHaveBeenCalledTimes(3);
  });
});
