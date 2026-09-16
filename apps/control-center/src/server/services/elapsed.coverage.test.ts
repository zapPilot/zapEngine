import { describe, expect, it } from 'vitest';

import { elapsedMs } from './elapsed.js';

const NOW = new Date('2026-08-28T12:00:00.000Z');

describe('elapsedMs coverage', () => {
  it('returns null for a missing value', () => {
    expect(elapsedMs(null, NOW)).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(elapsedMs('', NOW)).toBeNull();
  });

  it('returns null for an unparseable timestamp', () => {
    expect(elapsedMs('not-a-date', NOW)).toBeNull();
    expect(elapsedMs('2026-13-99T99:99:99Z', NOW)).toBeNull();
  });

  it('clamps future timestamps to zero instead of reporting negative age', () => {
    expect(elapsedMs('2026-08-28T12:00:01.000Z', NOW)).toBe(0);
  });

  it('measures age for a past timestamp', () => {
    expect(elapsedMs('2026-08-28T11:00:00.000Z', NOW)).toBe(3_600_000);
  });
});
