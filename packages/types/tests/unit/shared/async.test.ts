import { describe, expect, it, vi } from 'vitest';

import { sleep } from '../../../src/shared/async.js';

describe('sleep', () => {
  it('resolves only after the requested delay elapses', async () => {
    vi.useFakeTimers();
    try {
      let resolved = false;
      const pending = sleep(50).then(() => {
        resolved = true;
      });

      await vi.advanceTimersByTimeAsync(49);
      expect(resolved).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      await pending;
      expect(resolved).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('resolves immediately for ms <= 0, without scheduling a timer', async () => {
    await expect(sleep(0)).resolves.toBeUndefined();
    await expect(sleep(-5)).resolves.toBeUndefined();
  });

  it('rejects immediately when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort(new Error('stop'));
    await expect(sleep(50, controller.signal)).rejects.toThrow('stop');
  });

  it('rejects and clears the timer when the signal aborts before ms elapses', async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const pending = sleep(50, controller.signal);
      const assertion = expect(pending).rejects.toThrow('stop');

      await vi.advanceTimersByTimeAsync(10);
      controller.abort(new Error('stop'));

      await assertion;
      // A later abort must not throw or resolve the already-settled promise.
      await vi.advanceTimersByTimeAsync(100);
    } finally {
      vi.useRealTimers();
    }
  });

  it('still resolves ms <= 0 even with an already-aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(sleep(0, controller.signal)).resolves.toBeUndefined();
  });
});
