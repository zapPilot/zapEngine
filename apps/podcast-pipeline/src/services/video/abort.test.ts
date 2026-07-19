import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  abortError,
  combineAbortSignalWithTimeout,
  throwIfAborted,
} from './abort.js';

describe('abortError', () => {
  it('returns the signal reason when it is an Error', () => {
    const cause = new Error('connection lost');
    const controller = new AbortController();
    controller.abort(cause);
    const result = abortError(controller.signal);
    expect(result).toBe(cause);
  });

  it('creates a new Error from a string reason', () => {
    const controller = new AbortController();
    controller.abort('user cancelled');
    const result = abortError(controller.signal);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('user cancelled');
    expect(result.name).toBe('AbortError');
  });

  it('returns the DOMException reason when abort() is called without arguments', () => {
    const controller = new AbortController();
    controller.abort();
    const result = abortError(controller.signal);
    expect(result).toBeInstanceOf(Error);
    expect(result.name).toBe('AbortError');
  });

  it('uses fallback message for empty string reason', () => {
    const controller = new AbortController();
    controller.abort('');
    const result = abortError(controller.signal);
    expect(result.message).toBe('Operation aborted');
  });

  it('uses fallback when signal is undefined', () => {
    const result = abortError(undefined, 'no signal');
    expect(result.message).toBe('no signal');
  });
});

describe('throwIfAborted', () => {
  it('throws when signal is aborted', () => {
    const controller = new AbortController();
    controller.abort(new Error('stopped'));
    expect(() => throwIfAborted(controller.signal)).toThrow('stopped');
  });

  it('does not throw when signal is not aborted', () => {
    const controller = new AbortController();
    expect(() => throwIfAborted(controller.signal)).not.toThrow();
  });

  it('does not throw when signal is undefined', () => {
    expect(() => throwIfAborted(undefined)).not.toThrow();
  });
});

describe('combineAbortSignalWithTimeout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('aborts with TimeoutError after the specified duration', async () => {
    vi.useFakeTimers();
    const combined = combineAbortSignalWithTimeout(
      undefined,
      5_000,
      'render timed out',
    );

    expect(combined.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(combined.signal.aborted).toBe(true);
    expect(combined.signal.reason).toBeInstanceOf(Error);
    expect((combined.signal.reason as Error).message).toBe('render timed out');
    expect((combined.signal.reason as Error).name).toBe('TimeoutError');

    combined.dispose();
  });

  it('aborts immediately when parent signal is already aborted', () => {
    const parent = new AbortController();
    parent.abort(new Error('parent failed'));
    const combined = combineAbortSignalWithTimeout(
      parent.signal,
      10_000,
      'timeout',
    );

    expect(combined.signal.aborted).toBe(true);
    expect((combined.signal.reason as Error).message).toBe('parent failed');
    combined.dispose();
  });

  it('aborts when parent signal aborts before timeout', () => {
    const parent = new AbortController();
    const combined = combineAbortSignalWithTimeout(
      parent.signal,
      10_000,
      'timeout',
    );

    parent.abort(new Error('lease lost'));
    expect(combined.signal.aborted).toBe(true);
    expect((combined.signal.reason as Error).message).toBe('lease lost');

    combined.dispose();
  });

  it('dispose clears the timeout and detaches from parent', () => {
    vi.useFakeTimers();
    const parent = new AbortController();
    const combined = combineAbortSignalWithTimeout(
      parent.signal,
      10_000,
      'timeout',
    );

    combined.dispose();
    parent.abort(new Error('after dispose'));
    expect(combined.signal.aborted).toBe(false);

    vi.advanceTimersByTime(10_000);
    expect(combined.signal.aborted).toBe(false);
  });
});
