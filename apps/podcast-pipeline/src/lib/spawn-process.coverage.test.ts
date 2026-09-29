import { describe, expect, it, vi } from 'vitest';

import { killOnAbort, settleOnce } from './spawn-process.js';

describe('settleOnce', () => {
  it('resolves once and ignores a later reject', () => {
    const resolve = vi.fn();
    const reject = vi.fn();
    const cleanup = vi.fn();
    const settler = settleOnce<string>(resolve, reject, cleanup);

    settler.settleResolve('ok');
    settler.settleReject(new Error('late'));

    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith('ok');
    expect(reject).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('rejects once and ignores a later resolve', () => {
    const resolve = vi.fn();
    const reject = vi.fn();
    const cleanup = vi.fn();
    const settler = settleOnce<string>(resolve, reject, cleanup);
    const failure = new Error('boom');

    settler.settleReject(failure);
    settler.settleResolve('late');

    expect(reject).toHaveBeenCalledTimes(1);
    expect(reject).toHaveBeenCalledWith(failure);
    expect(resolve).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});

describe('killOnAbort', () => {
  it('sends SIGTERM then escalates to SIGKILL after the grace period', async () => {
    vi.useFakeTimers();
    try {
      const child = { kill: vi.fn() };
      const controller = new AbortController();
      const cleanup = killOnAbort(child, controller.signal, 2_000);

      controller.abort();
      expect(child.kill).toHaveBeenCalledTimes(1);
      expect(child.kill).toHaveBeenCalledWith('SIGTERM');

      await vi.advanceTimersByTimeAsync(2_000);
      expect(child.kill).toHaveBeenCalledTimes(2);
      expect(child.kill).toHaveBeenLastCalledWith('SIGKILL');

      cleanup();
    } finally {
      vi.useRealTimers();
    }
  });

  it('fires immediately when the signal is already aborted', () => {
    const child = { kill: vi.fn() };
    const controller = new AbortController();
    controller.abort();

    const cleanup = killOnAbort(child, controller.signal);
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    cleanup();
    expect(child.kill).toHaveBeenCalledTimes(1);
  });

  it('removes the listener and cancels escalation once the process settles', async () => {
    vi.useFakeTimers();
    try {
      const child = { kill: vi.fn() };
      const controller = new AbortController();
      const cleanup = killOnAbort(child, controller.signal, 2_000);

      cleanup();
      controller.abort();
      await vi.advanceTimersByTimeAsync(5_000);
      expect(child.kill).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('tolerates an absent signal', () => {
    const child = { kill: vi.fn() };
    const cleanup = killOnAbort(child, undefined);
    expect(child.kill).not.toHaveBeenCalled();
    expect(() => cleanup()).not.toThrow();
  });
});
