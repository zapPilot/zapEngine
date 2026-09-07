import { describe, expect, it, vi } from 'vitest';

import { createPollingSweeper } from './polling-sweeper.js';

describe('createPollingSweeper', () => {
  it('runs immediately on start and again on each interval tick', async () => {
    vi.useFakeTimers();
    try {
      const run = vi.fn().mockResolvedValue(undefined);
      const sweeper = createPollingSweeper({ intervalMs: 10, run });

      sweeper.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(run).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(20);
      expect(run).toHaveBeenCalledTimes(3);

      sweeper.stop();
      await vi.advanceTimersByTimeAsync(50);
      expect(run).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores a second start and refuses to restart after stop', async () => {
    vi.useFakeTimers();
    try {
      const run = vi.fn().mockResolvedValue(undefined);
      const sweeper = createPollingSweeper({ intervalMs: 10, run });

      sweeper.start();
      sweeper.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(run).toHaveBeenCalledTimes(1);

      sweeper.stop();
      sweeper.start();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(run).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('can stop cleanly before it has ever started', () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const sweeper = createPollingSweeper({ intervalMs: 10, run });

    sweeper.stop();
    sweeper.start();

    expect(run).not.toHaveBeenCalled();
  });

  it('is single-flight: a call while one run is in flight returns the same promise', async () => {
    let resolveWork!: () => void;
    const run = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveWork = resolve;
        }),
    );
    const sweeper = createPollingSweeper({ intervalMs: 10_000, run });

    const first = sweeper.run();
    const second = sweeper.run();
    expect(run).toHaveBeenCalledTimes(1);

    resolveWork();
    await Promise.all([first, second]);

    const third = sweeper.run();
    resolveWork();
    await third;
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('calls onError and completes normally when run rejects', async () => {
    const failure = new Error('boom');
    const run = vi.fn().mockRejectedValue(failure);
    const onError = vi.fn();
    const sweeper = createPollingSweeper({ intervalMs: 10_000, run, onError });

    await expect(sweeper.run()).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledWith(failure);
  });

  it('propagates a rejection from run when no onError is given', async () => {
    const failure = new Error('boom');
    const run = vi.fn().mockRejectedValue(failure);
    const sweeper = createPollingSweeper({ intervalMs: 10_000, run });

    await expect(sweeper.run()).rejects.toThrow('boom');
  });
});
