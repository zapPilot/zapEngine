import { afterEach, describe, expect, it, vi } from 'vitest';

import { runWithDeadline } from './deadline.js';

describe('runWithDeadline', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects a stalled operation at the deadline', async () => {
    vi.useFakeTimers();
    const result = runWithDeadline(
      () => new Promise<never>(() => undefined),
      undefined,
      5_000,
      'Image search',
    );
    const rejection = expect(result).rejects.toMatchObject({
      name: 'TimeoutError',
      message: 'Image search timed out after 5000ms',
    });

    await vi.advanceTimersByTimeAsync(5_000);
    await rejection;
  });

  it('relays a parent abort reason', async () => {
    const controller = new AbortController();
    const reason = new Error('lease lost');
    const result = runWithDeadline(
      () => new Promise<never>(() => undefined),
      controller.signal,
      5_000,
      'Image search',
    );

    controller.abort(reason);

    await expect(result).rejects.toBe(reason);
  });

  it('normalizes an already-aborted parent signal', async () => {
    const controller = new AbortController();
    const operation = vi.fn();
    controller.abort('cancelled');

    await expect(
      runWithDeadline(operation, controller.signal, 5_000, 'Image search'),
    ).rejects.toMatchObject({ name: 'AbortError', message: 'cancelled' });
    expect(operation).not.toHaveBeenCalled();
  });

  it('rejects invalid timeout values before running the operation', async () => {
    const operation = vi.fn();

    await expect(
      runWithDeadline(operation, undefined, 0, 'Image search'),
    ).rejects.toThrow('Image search timeout must be a positive number');
    expect(operation).not.toHaveBeenCalled();
  });
});
