import { describe, expect, it } from 'vitest';

import { estimateCronIntervalMs, staleAfterMs } from './schedule-interval.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

describe('estimateCronIntervalMs', () => {
  it('reads a daily expression as a day', () => {
    expect(estimateCronIntervalMs('0 0 * * *')).toBe(DAY_MS);
  });

  it('reads an unrestricted hour field as an hour', () => {
    expect(estimateCronIntervalMs('* * * * *')).toBe(HOUR_MS);
    expect(estimateCronIntervalMs('0 * * * *')).toBe(HOUR_MS);
  });

  it('reads a stepped hour field as that many hours', () => {
    expect(estimateCronIntervalMs('0 */6 * * *')).toBe(6 * HOUR_MS);
  });

  it('rounds a list of hours up to the midnight wrap', () => {
    expect(estimateCronIntervalMs('0 0,12 * * *')).toBe(DAY_MS);
  });

  it('lets a restricted day-of-week outrank the hour field', () => {
    expect(estimateCronIntervalMs('0 20 * * 1')).toBe(7 * DAY_MS);
  });

  it('reads a monthly expression as its longest month', () => {
    expect(estimateCronIntervalMs('0 0 1 * *')).toBe(31 * DAY_MS);
  });

  it('declines to model a restricted month', () => {
    expect(estimateCronIntervalMs('0 0 * 1,7 *')).toBeNull();
  });

  it('declines a six-field expression', () => {
    expect(estimateCronIntervalMs('0 0 0 * * *')).toBeNull();
  });

  it('declines anything that is not five fields', () => {
    expect(estimateCronIntervalMs('nonsense')).toBeNull();
    expect(estimateCronIntervalMs('')).toBeNull();
  });
});

describe('staleAfterMs', () => {
  it('keeps a daily cron on the 48h floor', () => {
    expect(staleAfterMs({ scheduleKind: 'cron', schedule: '0 0 * * *' })).toBe(
      48 * HOUR_MS,
    );
  });

  it('widens a weekly cron to two of its own periods', () => {
    expect(staleAfterMs({ scheduleKind: 'cron', schedule: '0 20 * * 1' })).toBe(
      336 * HOUR_MS,
    );
  });

  it('falls back to the floor for a non-cron schedule kind', () => {
    expect(
      staleAfterMs({ scheduleKind: 'interval', schedule: 'every 15 minutes' }),
    ).toBe(48 * HOUR_MS);
  });
});
