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
const DAY_MS = 24 * 60 * 60_000;

/** Every configured article time on one JST day, derived from the policy. */
function slotsOfDay(dayStart: Date): Date[] {
  return SOCIAL_RELEASE_SLOTS.map(
    (slot) =>
      new Date(dayStart.getTime() + (slot.hour * 60 + slot.minute) * 60_000),
  );
}

describe('article release policy shape', () => {
  it('offers at least one candidate time per article the day may release', () => {
    // Raising the cap without adding slots silently leaves the extra articles
    // unschedulable: nextReleaseSlot can only place one article per slot.
    expect(SOCIAL_RELEASE_SLOTS.length).toBeGreaterThanOrEqual(
      SOCIAL_RELEASE_DAILY_CAP,
    );
  });

  it('lists article slots in ascending order without repeats', () => {
    // nextReleaseSlot returns the first slot at or after `after`, so an
    // out-of-order list would hand back a later time than the day still has.
    const minutes = SOCIAL_RELEASE_SLOTS.map(
      (slot) => slot.hour * 60 + slot.minute,
    );
    expect(minutes).toEqual([...new Set(minutes)].sort((a, b) => a - b));
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
  it('takes the next free time the same day before rolling over', () => {
    const taken = new Date('2026-09-01T00:30:00.000Z');
    const slot = nextReleaseSlot({ after: READY, scheduled: [taken] });
    expect(slot?.toISOString()).toBe('2026-09-01T03:00:00.000Z');
  });

  it('moves the next article to the next day once today is full', () => {
    const slot = nextReleaseSlot({
      after: READY,
      scheduled: slotsOfDay(startOfJstDay(READY)),
    });
    expect(slot?.toISOString()).toBe('2026-09-02T00:30:00.000Z');
  });

  it('counts articles parked off-slot against the day budget', () => {
    // Legacy rows sit at times that are not article slots. They are still
    // articles released that day, so they consume the day's budget instead of
    // leaving its slots open for a fourth one.
    const offSlot = [
      new Date('2026-09-01T05:30:00.000Z'),
      new Date('2026-09-01T06:00:00.000Z'),
      new Date('2026-09-01T08:15:00.000Z'),
    ];
    expect(offSlot).toHaveLength(SOCIAL_RELEASE_DAILY_CAP);

    const slot = nextReleaseSlot({ after: READY, scheduled: offSlot });
    expect(slot?.toISOString()).toBe('2026-09-02T00:30:00.000Z');
  });

  it('never schedules a slot that already passed today', () => {
    const afternoon = new Date('2026-09-01T08:00:00.000Z');
    const slot = nextReleaseSlot({ after: afternoon, scheduled: [] });
    expect(slot?.toISOString()).toBe('2026-09-02T00:30:00.000Z');
  });

  it('returns nothing rather than compressing backlog past the horizon', () => {
    const day = startOfJstDay(READY);
    const full = Array.from({ length: SCHEDULING_HORIZON_DAYS }).flatMap(
      (_, index) => slotsOfDay(new Date(day.getTime() + index * DAY_MS)),
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
