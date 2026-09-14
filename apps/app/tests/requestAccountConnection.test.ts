import { describe, expect, it, vi } from 'vitest';

import { requestAccountConnection } from '@/integration/requestAccountConnection';

describe('requestAccountConnection', () => {
  // Neither jsdom nor vitest surfaces an unhandled rejection here, so assert
  // the invariant directly: a rejection handler must be attached to the
  // promise the caller throws away.
  it('attaches a rejection handler and returns nothing', async () => {
    const pending = Promise.reject(new Error('network failed'));
    const catchSpy = vi.spyOn(pending, 'catch');
    const connect = vi.fn(() => pending);

    expect(requestAccountConnection({ connect })).toBeUndefined();

    expect(connect).toHaveBeenCalledTimes(1);
    expect(catchSpy).toHaveBeenCalledTimes(1);
    await expect(pending).rejects.toThrow('network failed');
  });
});
