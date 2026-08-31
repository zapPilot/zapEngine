import { describe, expect, it } from 'vitest';

import {
  SOCIAL_PUBLISH_WINDOW_JST,
  SOCIAL_RELEASE_DAILY_CAP,
  SOCIAL_RELEASE_SLOTS,
} from './policy.js';
import {
  nextReleaseSlot,
  occupiesReleaseBudget,
  SCHEDULING_HORIZON_DAYS,
  startOfJstDay,
  withinPublishWindow,
} from './slot-policy.js';

const READY = new Date('2026-09-01T00:00:00.000Z');

describe('article release policy shape', () => {
  it('has one article budget instead of per-platform budgets', () => {
    expect(SOCIAL_RELEASE_DAILY_CAP).toBe(1);
    expect(SOCIAL_RELEASE_SLOTS).toEqual([{ hour: 12, minute: 0 }]);
  });

  it('keeps every article slot inside the watched publish window', () => {
    for (const slot of SOCIAL_RELEASE_SLOTS) {
      expect(slot.hour).toBeGreaterThanOrEqual(
        SOCIAL_PUBLISH_WINDOW_JST.startHour,
      );
      expect(slot.hour).toBeLessThan(SOCIAL_PUBLISH_WINDOW_JST.endHour);
    }
  });
});

describe('nextReleaseSlot', () => {
  it('moves the next article to the next day once today is occupied', () => {
    const taken = new Date('2026-09-01T03:00:00.000Z');
    const slot = nextReleaseSlot({ after: READY, scheduled: [taken] });
    expect(slot?.toISOString()).toBe('2026-09-02T03:00:00.000Z');
  });

  it('never schedules a slot that already passed today', () => {
    const afternoon = new Date('2026-09-01T08:00:00.000Z');
    const slot = nextReleaseSlot({ after: afternoon, scheduled: [] });
    expect(slot?.toISOString()).toBe('2026-09-02T03:00:00.000Z');
  });

  it('returns nothing rather than compressing backlog past the horizon', () => {
    const day = startOfJstDay(READY);
    const full = Array.from(
      { length: SCHEDULING_HORIZON_DAYS },
      (_, index) =>
        new Date(day.getTime() + index * 24 * 60 * 60_000 + 12 * 60 * 60_000),
    );
    expect(nextReleaseSlot({ after: READY, scheduled: full })).toBeNull();
  });
});

describe('occupiesReleaseBudget', () => {
  it('keeps a queued article on the books', () => {
    expect(
      occupiesReleaseBudget({
        status: 'queued',
        scheduled_at: '2026-09-01T03:00:00.000Z',
        completed_at: null,
      }),
    ).toBe(true);
  });

  it('ignores a completed ghost row bound to a slot it never used', () => {
    expect(
      occupiesReleaseBudget({
        status: 'completed',
        scheduled_at: '2026-09-01T03:00:00.000Z',
        completed_at: '2026-08-19T03:00:00.000Z',
      }),
    ).toBe(false);
  });

  it('counts an article completed on its scheduled JST day', () => {
    expect(
      occupiesReleaseBudget({
        status: 'completed',
        scheduled_at: '2026-09-01T03:00:00.000Z',
        completed_at: '2026-09-01T03:03:00.000Z',
      }),
    ).toBe(true);
  });
});

describe('withinPublishWindow', () => {
  it.each([
    ['2026-09-01T00:30:00.000Z', true],
    ['2026-09-01T08:59:00.000Z', true],
    ['2026-09-01T09:01:00.000Z', false],
    ['2026-08-31T23:59:00.000Z', false],
  ])('%s inside working hours: %s', (iso, expected) => {
    expect(withinPublishWindow(new Date(iso), SOCIAL_PUBLISH_WINDOW_JST)).toBe(
      expected,
    );
  });
});
