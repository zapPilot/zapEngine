import { describe, expect, it } from 'vitest';
import {
  freshWindowHours,
  isInactivePriorityOnFastCadence,
  staleWindowHours,
} from './service-cadence.js';

describe('owner-approved refresh cadence', () => {
  it('allows daily start drift and a weekly job without treating six-day data as stale', () => {
    expect(freshWindowHours(24)).toBe(30);
    expect(staleWindowHours(24)).toBe(48);
    expect(freshWindowHours(168)).toBe(174);
    expect(staleWindowHours(168)).toBe(192);
  });
  it.each([
    ['priority', 24, 30, true],
    ['priority', 24, null, true],
    ['priority', 24, 29, false],
    ['priority', 168, 90, false],
    ['priority', null, 90, false],
    ['standard', 168, 90, false],
    ['paused', null, 90, false],
  ] as const)(
    'flags %s cadence %s after %s inactive days only when the approved weekly policy is missing',
    (effectiveTier, refreshIntervalHours, inactiveDays, expected) => {
      expect(
        isInactivePriorityOnFastCadence({
          effectiveTier,
          refreshIntervalHours,
          inactiveDays,
        }),
      ).toBe(expected);
    },
  );
});
