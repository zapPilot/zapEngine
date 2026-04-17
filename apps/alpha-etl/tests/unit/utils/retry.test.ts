import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry } from '../../../src/utils/retry.js';

describe('Retry Utilities', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('withRetry', () => {
    it('succeeds on first attempt', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await withRetry(fn, { maxAttempts: 3 });
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries and succeeds on second attempt', async () => {
      const fn = vi.fn()
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

      await expect(
        withRetry(fn, { maxAttempts: 2, baseDelayMs: 50 })
      ).rejects.toThrow('persistent failure');

      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('applies exponential backoff', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValueOnce('success');

      const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 100 });

      // First attempt fails immediately
      await vi.advanceTimersByTimeAsync(0);

      // Second attempt after 100ms delay (2^0 * 100)
      await vi.advanceTimersByTimeAsync(100);

      // Third attempt after 200ms delay (2^1 * 100)
      await vi.advanceTimersByTimeAsync(200);

      const result = await promise;
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('respects maxDelayMs cap', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce('success');

      const promise = withRetry(fn, {
        maxAttempts: 2,
        baseDelayMs: 1000,
        maxDelayMs: 500
      });

      await vi.advanceTimersByTimeAsync(500);
      const result = await promise;

      expect(result).toBe('success');
    });

    it('handles non-Error failures', async () => {
      const fn = vi.fn().mockRejectedValue('string error');

      await expect(
        withRetry(fn, { maxAttempts: 1 })
      ).rejects.toThrow('string error');
    });

    it('uses default options when not provided', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await withRetry(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('handles promises that reject with non-Error objects', async () => {
      const fn = vi.fn().mockRejectedValue({ code: 'ENOTFOUND' });

      const promise = withRetry(fn, { maxAttempts: 2, baseDelayMs: 50 });
      await vi.advanceTimersByTimeAsync(50);

      await expect(promise).rejects.toThrow();
    });
  });

});
