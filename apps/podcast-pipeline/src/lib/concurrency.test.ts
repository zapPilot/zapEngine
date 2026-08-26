import { describe, expect, it, vi } from 'vitest';

import { mapWithConcurrency } from './concurrency.js';

function blocker(): { promise: Promise<void>; release: () => void } {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = () => resolve();
  });
  return { promise, release };
}

describe('mapWithConcurrency', () => {
  it('rejects a non-positive limit', async () => {
    await expect(mapWithConcurrency([1], 0, async (n) => n)).rejects.toThrow(
      'limit must be a positive integer',
    );
  });

  it('returns results in input order regardless of completion order', async () => {
    const results = await mapWithConcurrency([30, 10, 20], 3, async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return ms;
    });

    expect(results).toEqual([30, 10, 20]);
  });

  it('never exceeds the limit', async () => {
    let active = 0;
    let peak = 0;

    await mapWithConcurrency(Array.from({ length: 10 }), 4, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
    });

    expect(peak).toBe(4);
  });

  it('waits for in-flight work before rethrowing, and stops starting new work', async () => {
    const slow = blocker();
    const fn = vi.fn(async (item: string) => {
      if (item === 'boom') throw new Error('boom');
      if (item === 'slow') await slow.promise;
    });

    const pending = mapWithConcurrency(['boom', 'slow', 'third'], 2, fn);
    // 'boom' has already rejected here, but 'slow' is still running, so the
    // call must not settle yet — rejecting early would leave 'slow' unobserved.
    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(2);

    slow.release();
    await expect(pending).rejects.toThrow('boom');
    // 'third' is never started once a failure is known.
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('reports the first failure when several fail', async () => {
    await expect(
      mapWithConcurrency(['a', 'b'], 2, async (item) => {
        throw new Error(item);
      }),
    ).rejects.toThrow('a');
  });
});
