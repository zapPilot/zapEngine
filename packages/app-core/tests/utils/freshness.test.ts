import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  diff: vi.fn(),
  error: vi.fn(),
  fromNow: vi.fn(),
  parseUtcDate: vi.fn(),
}));

vi.mock('@core/utils/logger', () => ({
  logger: { error: mocks.error },
}));

vi.mock('@core/utils/formatting/shared', () => ({
  dayjs: { utc: () => ({ diff: mocks.diff }) },
  parseUtcDate: mocks.parseUtcDate,
}));

import {
  calculateDataFreshness,
  formatRelativeTime,
} from '@core/utils/formatting/freshness';

const timestamp = '2026-09-14T00:00:00.000Z';
const parsedDate = { fromNow: mocks.fromNow };

describe('calculateDataFreshness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fromNow.mockReturnValue('2 hours ago');
    mocks.parseUtcDate.mockReturnValue(parsedDate);
  });

  // Invariant: missing and invalid timestamps are unknown and never current.
  it.each([null, undefined, ''])(
    'returns unknown for missing value %s',
    (value) => {
      expect(calculateDataFreshness(value)).toEqual({
        relativeTime: 'Unknown',
        state: 'unknown',
        hoursSince: Infinity,
        timestamp: '',
        isCurrent: false,
      });
    },
  );

  it('preserves an invalid timestamp in the unknown result', () => {
    mocks.parseUtcDate.mockReturnValue(null);

    expect(calculateDataFreshness('invalid')).toMatchObject({
      state: 'unknown',
      timestamp: 'invalid',
      isCurrent: false,
    });
  });

  // Invariant: the exact 24h and 72h boundaries retain their documented
  // fresh/stale classifications; only values beyond 72h are very stale.
  it.each([
    [24, 'fresh', true],
    [72, 'stale', false],
    [72.01, 'very-stale', false],
  ] as const)('classifies %sh as %s', (hoursSince, state, isCurrent) => {
    mocks.diff.mockReturnValue(hoursSince);

    expect(calculateDataFreshness(timestamp)).toEqual({
      relativeTime: '2 hours ago',
      state,
      hoursSince,
      timestamp,
      isCurrent,
    });
    expect(mocks.diff).toHaveBeenCalledWith(parsedDate, 'hour', true);
  });

  // Invariant: unexpected parser failures are logged and converted to the same
  // fail-closed unknown shape as invalid input.
  it('logs and normalizes unexpected parser failures', () => {
    const failure = new Error('parser failed');
    mocks.parseUtcDate.mockImplementation(() => {
      throw failure;
    });

    expect(calculateDataFreshness(timestamp)).toMatchObject({
      state: 'unknown',
      timestamp,
      isCurrent: false,
    });
    expect(mocks.error).toHaveBeenCalledWith(
      'Error calculating data freshness',
      failure,
      'formatters',
    );
  });
});

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fromNow.mockReturnValue('2 hours ago');
    mocks.parseUtcDate.mockReturnValue(parsedDate);
  });

  it.each([null, undefined, ''])(
    'returns Unknown for missing value %s',
    (value) => {
      expect(formatRelativeTime(value)).toBe('Unknown');
    },
  );

  it('returns Unknown for an invalid timestamp', () => {
    mocks.parseUtcDate.mockReturnValue(null);
    expect(formatRelativeTime('invalid')).toBe('Unknown');
  });

  it('returns the parsed relative time', () => {
    expect(formatRelativeTime(timestamp)).toBe('2 hours ago');
  });

  it('returns Unknown when parsing throws', () => {
    mocks.parseUtcDate.mockImplementation(() => {
      throw new Error('parser failed');
    });
    expect(formatRelativeTime(timestamp)).toBe('Unknown');
  });
});
