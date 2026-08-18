import { describe, expect, it } from 'vitest';

import { publishRetryDelayMs } from './daemon-store.js';

describe('social publish retry policy', () => {
  it('doubles retry delay per attempt until the six-hour cap', () => {
    const minute = 60_000;

    expect(
      [1, 2, 3, 4, 5, 6, 7, 8, 9].map((attemptCount) =>
        publishRetryDelayMs(attemptCount),
      ),
    ).toEqual([
      5 * minute,
      10 * minute,
      20 * minute,
      40 * minute,
      80 * minute,
      160 * minute,
      320 * minute,
      360 * minute,
      360 * minute,
    ]);
  });

  it('treats non-positive attempt counts as a first attempt', () => {
    expect(publishRetryDelayMs(0)).toBe(5 * 60_000);
    expect(publishRetryDelayMs(-5)).toBe(5 * 60_000);
  });
});
