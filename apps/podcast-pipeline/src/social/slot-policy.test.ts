import { describe, expect, it } from 'vitest';

import {
  SOCIAL_PUBLISH_WINDOW_JST,
  SOCIAL_RELEASE_CADENCES,
  socialReleaseCadenceForBacklog,
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

function slotsOfDay(dayStart: Date, backlogArticles = 0): Date[] {
  return socialReleaseCadenceForBacklog(backlogArticles).slots.map(
    (slot) =>
      new Date(dayStart.getTime() + (slot.hour * 60 + slot.minute) * 60_000),
  );
}

describe('article release policy shape', () => {
  it.each([
    [0, 4],
    [9, 4],
    [10, 5],
    [20, 5],
    [21, 6],
    [100, 6],
  ])('uses %i queued articles => %i releases/day', (backlog, dailyCap) => {
    expect(socialReleaseCadenceForBacklog(backlog).slots).toHaveLength(
      dailyCap,
    );
  });

  it('lists every cadence in ascending slot order without repeats', () => {
    for (const cadence of SOCIAL_RELEASE_CADENCES) {
      const minutes = cadence.slots.map((slot) => slot.hour * 60 + slot.minute);
      expect(minutes).toEqual([...new Set(minutes)].sort((a, b) => a - b));
    }
  });

  it('keeps every article slot inside the watched publish window', () => {
    for (const cadence of SOCIAL_RELEASE_CADENCES) {
      for (const slot of cadence.slots) {
        expect(slot.hour).toBeGreaterThanOrEqual(
          SOCIAL_PUBLISH_WINDOW_JST.startHour,
        );
        expect(slot.hour).toBeLessThan(SOCIAL_PUBLISH_WINDOW_JST.endHour);
      }
    }
  });
});

describe('nextReleaseSlot', () => {
  it('takes the next free low-backlog time the same day before rolling over', () => {
    const taken = new Date('2026-09-01T00:30:00.000Z');
    const slot = nextReleaseSlot({ after: READY, scheduled: [taken] });
    expect(slot?.toISOString()).toBe('2026-09-01T03:00:00.000Z');
  });

  it('uses the six-slot cadence when backlog is above 20 articles', () => {
    const slot = nextReleaseSlot({
      after: READY,
      scheduled: [],
      backlogArticles: 21,
    });
    expect(slot?.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('uses the five-slot cadence at the 10-article threshold', () => {
    const slot = nextReleaseSlot({
      after: READY,
      scheduled: [],
      backlogArticles: 10,
    });
    expect(slot?.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('moves the next article to the next day once today is full', () => {
    const slot = nextReleaseSlot({
      after: READY,
      scheduled: slotsOfDay(startOfJstDay(READY)),
    });
    expect(slot?.toISOString()).toBe('2026-09-02T00:30:00.000Z');
  });

  it('counts articles parked off-slot against the selected day budget', () => {
    const offSlot = [
      new Date('2026-09-01T05:30:00.000Z'),
      new Date('2026-09-01T06:00:00.000Z'),
      new Date('2026-09-01T08:15:00.000Z'),
      new Date('2026-09-01T08:45:00.000Z'),
    ];
    expect(offSlot).toHaveLength(
      socialReleaseCadenceForBacklog(0).slots.length,
    );

    const slot = nextReleaseSlot({ after: READY, scheduled: offSlot });
    expect(slot?.toISOString()).toBe('2026-09-02T00:30:00.000Z');
  });

  it('never schedules a slot that already passed today', () => {
    const lateEvening = new Date('2026-09-01T12:01:00.000Z');
    const slot = nextReleaseSlot({ after: lateEvening, scheduled: [] });
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
    ['2026-09-01T13:59:00.000Z', true],
    ['2026-09-01T14:00:00.000Z', false],
    ['2026-08-31T23:59:00.000Z', false],
  ])('%s inside working hours: %s', (iso, expected) => {
    expect(withinPublishWindow(new Date(iso), SOCIAL_PUBLISH_WINDOW_JST)).toBe(
      expected,
    );
  });
});
