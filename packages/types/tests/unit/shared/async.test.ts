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
});
