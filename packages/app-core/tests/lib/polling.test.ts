import { pollUntil, PollTimeoutError } from '@core/lib/polling';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('pollUntil', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves immediately when the first value satisfies shouldStop', async () => {
    const fn = vi.fn().mockResolvedValue('DONE');

    await expect(
      pollUntil({ fn, shouldStop: (value) => value === 'DONE' }),
    ).resolves.toBe('DONE');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('keeps polling at the base interval until shouldStop accepts', async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce('PENDING')
      .mockResolvedValueOnce('PENDING')
      .mockResolvedValueOnce('DONE');

    const promise = pollUntil({
      fn,
      shouldStop: (value) => value === 'DONE',
      intervalMs: 1_000,
    });

    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(promise).resolves.toBe('DONE');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('retries transient errors with backoff and recovers', async () => {
    const attempts: Array<{ value: unknown; error: unknown }> = [];
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('rate limited'))
      .mockRejectedValueOnce(new Error('rate limited'))
      .mockResolvedValueOnce('DONE');

    const promise = pollUntil({
      fn,
      shouldStop: (value) => value === 'DONE',
      intervalMs: 1_000,
      backoffFactor: 2,
      onAttempt: (value, error) => attempts.push({ value, error }),
    });

    // First failure backs off to 2s, second to 4s.
    await vi.advanceTimersByTimeAsync(2_000);
    expect(fn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3_999);
    expect(fn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);

    await expect(promise).resolves.toBe('DONE');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(attempts).toHaveLength(3);
    expect(attempts[0]?.error).toBeInstanceOf(Error);
    expect(attempts[2]?.value).toBe('DONE');
  });

  it('caps the backoff delay at maxIntervalMs', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('DONE');

    const promise = pollUntil({
      fn,
      shouldStop: (value) => value === 'DONE',
      intervalMs: 10_000,
      backoffFactor: 10,
      maxIntervalMs: 15_000,
    });

    await vi.advanceTimersByTimeAsync(15_000);

    await expect(promise).resolves.toBe('DONE');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws PollTimeoutError carrying the last value once timeoutMs elapses', async () => {
    const fn = vi.fn().mockResolvedValue('PENDING');

    const promise = pollUntil({
      fn,
      shouldStop: (value) => value === 'DONE',
      intervalMs: 1_000,
      timeoutMs: 2_500,
    });
    const assertion = expect(promise).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof PollTimeoutError && error.lastValue === 'PENDING',
    );

    await vi.advanceTimersByTimeAsync(3_000);
    await assertion;
  });

  it('rejects with an AbortError when the signal fires mid-sleep', async () => {
    const controller = new AbortController();
    const fn = vi.fn().mockResolvedValue('PENDING');

    const promise = pollUntil({
      fn,
      shouldStop: (value) => value === 'DONE',
      intervalMs: 60_000,
      signal: controller.signal,
    });
    const assertion = expect(promise).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof DOMException && error.name === 'AbortError',
    );

    await vi.advanceTimersByTimeAsync(1_000);
    controller.abort();
    await assertion;
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('rejects immediately when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const fn = vi.fn();

    await expect(
      pollUntil({
        fn,
        shouldStop: () => true,
        signal: controller.signal,
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof DOMException && error.name === 'AbortError',
    );
    expect(fn).not.toHaveBeenCalled();
  });
});
