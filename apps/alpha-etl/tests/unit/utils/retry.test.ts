import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry } from '../../../src/utils/retry.js';

describe('Retry Utilities', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('NODE_ENV', 'development');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe('withRetry', () => {
    it('succeeds on first attempt', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await withRetry(fn, { maxAttempts: 3 });
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries and succeeds on second attempt', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce('success');

      const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 100 });
      await vi.advanceTimersByTimeAsync(100);

      const result = await promise;
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('throws after all retries exhausted', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('persistent failure'));

      const assertion = expect(
        withRetry(fn, { maxAttempts: 2, baseDelayMs: 50 }),
      ).rejects.toThrow('persistent failure');
      await vi.runAllTimersAsync();
      await assertion;

      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('applies exponential backoff', async () => {
      // withRetry skips the delay in NODE_ENV=test, so opt back into the real
      // backoff path and drive it step by step to pin the 100ms/200ms growth.
      vi.stubEnv('NODE_ENV', 'development');
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValueOnce('success');

      const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 100 });
      const settled = promise.then(
        () => 'resolved',
        () => 'rejected',
      );

      await vi.advanceTimersByTimeAsync(0);
      expect(fn).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(99);
      expect(fn).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fn).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(199);
      expect(fn).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(fn).toHaveBeenCalledTimes(3);

      await expect(settled).resolves.toBe('resolved');
    });

    it('respects maxDelayMs cap', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValueOnce('success');

      const promise = withRetry(fn, {
        maxAttempts: 3,
        baseDelayMs: 1000,
        maxDelayMs: 500,
      });
      const settled = promise.then(
        () => 'resolved',
        () => 'rejected',
      );

      await vi.advanceTimersByTimeAsync(0);
      expect(fn).toHaveBeenCalledTimes(1);

      // Capped at 500ms instead of the 1000ms the raw exponential would give.
      await vi.advanceTimersByTimeAsync(499);
      expect(fn).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fn).toHaveBeenCalledTimes(2);

      // Second delay would be 2000ms uncapped; the cap keeps it at 500ms.
      await vi.advanceTimersByTimeAsync(499);
      expect(fn).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(fn).toHaveBeenCalledTimes(3);

      await expect(settled).resolves.toBe('resolved');
    });

    it('handles non-Error failures', async () => {
      const fn = vi.fn().mockRejectedValue('string error');

      await expect(withRetry(fn, { maxAttempts: 1 })).rejects.toThrow(
        'string error',
      );
    });

    it('uses default options when not provided', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await withRetry(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('handles promises that reject with non-Error objects', async () => {
      const fn = vi.fn().mockRejectedValue({ code: 'ENOTFOUND' });

      const assertion = expect(
        withRetry(fn, { maxAttempts: 2, baseDelayMs: 50 }),
      ).rejects.toThrow('[object Object]');
      await vi.advanceTimersByTimeAsync(50);
      await assertion;
    });
  });
});
