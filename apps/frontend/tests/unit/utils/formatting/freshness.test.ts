import {
  calculateDataFreshness,
  formatRelativeTime,
} from '@zapengine/app-core/utils/formatting/freshness';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockError } = vi.hoisted(() => ({ mockError: vi.fn() }));

vi.mock('@zapengine/app-core/utils/logger', () => ({
  logger: { error: mockError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@zapengine/app-core/utils/formatting/shared', async () => {
  const actual = await vi.importActual<
    typeof import('@zapengine/app-core/utils/formatting/shared')
  >('@zapengine/app-core/utils/formatting/shared');
  return {
    ...actual,
    parseUtcDate: vi.fn((value: string) => {
      if (value === '__throw__') {
        throw new Error('boom');
      }
      return actual.parseUtcDate(value);
    }),
  };
});

const hoursAgo = (hours: number): string =>
  new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

describe('calculateDataFreshness', () => {
  beforeEach(() => mockError.mockReset());

  it('returns the unknown descriptor for missing input', () => {
    const result = calculateDataFreshness(null);

    expect(result.state).toBe('unknown');
    expect(result.hoursSince).toBe(Infinity);
    expect(result.timestamp).toBe('');
    expect(result.isCurrent).toBe(false);
  });

  it('returns unknown but preserves the timestamp for an unparseable date', () => {
    const result = calculateDataFreshness('not-a-date');

    expect(result.state).toBe('unknown');
    expect(result.timestamp).toBe('not-a-date');
  });

  it.each([
    [1, 'fresh', true],
    [48, 'stale', false],
    [100, 'very-stale', false],
  ])('classifies a %i-hour-old timestamp as %s', (h, state, isCurrent) => {
    const result = calculateDataFreshness(hoursAgo(h as number));

    expect(result.state).toBe(state);
    expect(result.isCurrent).toBe(isCurrent);
    expect(result.relativeTime).not.toBe('Unknown');
  });

  it('logs and returns unknown when parsing throws', () => {
    const result = calculateDataFreshness('__throw__');

    expect(result.state).toBe('unknown');
    expect(result.timestamp).toBe('__throw__');
    expect(mockError).toHaveBeenCalledTimes(1);
  });
});

describe('formatRelativeTime', () => {
  it('returns "Unknown" for missing or unparseable input', () => {
    expect(formatRelativeTime(null)).toBe('Unknown');
    expect(formatRelativeTime('not-a-date')).toBe('Unknown');
  });

  it('formats a valid timestamp as a relative time string', () => {
    expect(formatRelativeTime(hoursAgo(2))).not.toBe('Unknown');
  });

  it('returns "Unknown" when parsing throws', () => {
    expect(formatRelativeTime('__throw__')).toBe('Unknown');
  });
});
