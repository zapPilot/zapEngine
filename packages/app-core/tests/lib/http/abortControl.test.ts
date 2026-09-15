import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createTimeoutController,
  isAbortError,
} from '@core/lib/http/abortControl';

describe('abortControl', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('aborts after the timeout and cleanup cancels the timer', () => {
    vi.useFakeTimers();
    const timed = createTimeoutController(100);
    expect(timed.signal.aborted).toBe(false);
    vi.advanceTimersByTime(100);
    expect(timed.signal.aborted).toBe(true);
    timed.cleanup();

    const cancelled = createTimeoutController(100);
    cancelled.cleanup();
    vi.advanceTimersByTime(100);
    expect(cancelled.signal.aborted).toBe(false);
  });

  it('forwards an external abort reason and removes its listener on cleanup', () => {
    vi.useFakeTimers();
    const external = new AbortController();
    const result = createTimeoutController(1_000, external.signal);

    external.abort('superseded');
    expect(result.signal.aborted).toBe(true);
    expect(result.signal.reason).toBe('superseded');
    result.cleanup();
  });

  it('recognizes Error and DOMException AbortErrors only', () => {
    const error = new Error('aborted');
    error.name = 'AbortError';
    expect(isAbortError(error)).toBe(true);
    expect(isAbortError(new DOMException('aborted', 'AbortError'))).toBe(true);
    expect(isAbortError(new Error('other'))).toBe(false);
    expect(isAbortError('AbortError')).toBe(false);
  });
});
