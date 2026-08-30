import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ assign: vi.fn() }));

// The real bucketing stays in play: the 80/20 split is the variant array
// itself, so a test that stubbed the hash would only be asserting its own
// arithmetic.
vi.mock('./experiments.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./experiments.js')>();
  return {
    ...actual,
    getOrCreateExperimentAssignment: mocks.assign.mockImplementation(
      async (input: {
        experimentKey: string;
        episodeId: string;
        variants?: readonly [string, ...string[]];
      }) => ({
        experiment_key: input.experimentKey,
        episode_id: input.episodeId,
        variant: actual.deterministicVariant(
          input.experimentKey,
          input.episodeId,
          input.variants,
        ),
        assigned_at: '2026-08-29T00:00:00.000Z',
      }),
    ),
  };
});

import {
  PLATFORM_PUBLISH_POLICY,
  SOCIAL_PUBLISH_WINDOW_JST,
} from './policy.js';
import {
  nextBudgetSlot,
  occupiesPublishBudget,
  resolveLaneSlotPlan,
  SCHEDULING_HORIZON_DAYS,
  startOfJstDay,
  withinPublishWindow,
} from './slot-policy.js';

const READY = new Date('2026-09-01T00:00:00.000Z');

function episodeIds(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `episode-${index}`);
}

async function slotFor(
  platform: 'rednote' | 'threads' | 'x' | 'youtube',
  episodeId: string,
  language: 'zh-Hant' | 'ja' | 'en',
  day = READY,
): Promise<string> {
  const plan = await resolveLaneSlotPlan({ platform, episodeId, language });
  const slot = plan.slotOnDay(startOfJstDay(day));
  return slot ? `${slot.hour}:${String(slot.minute).padStart(2, '0')}` : 'none';
}

describe('publish policy shape', () => {
  it('keeps every slot inside the hours someone is around to watch', () => {
    for (const { slots } of Object.values(PLATFORM_PUBLISH_POLICY)) {
      for (const slot of slots) {
        expect(slot.hour).toBeGreaterThanOrEqual(
          SOCIAL_PUBLISH_WINDOW_JST.startHour,
        );
        expect(slot.hour).toBeLessThan(SOCIAL_PUBLISH_WINDOW_JST.endHour);
      }
    }
  });

  it('spends five posts a day across every platform', () => {
    const total = Object.values(PLATFORM_PUBLISH_POLICY).reduce(
      (sum, policy) => sum + policy.dailyCap,
      0,
    );
    expect(total).toBe(5);
  });
});

describe('resolveLaneSlotPlan', () => {
  it('splits Rednote four-to-one toward the incumbent slot', async () => {
    const slots = await Promise.all(
      episodeIds(200).map((id) => slotFor('rednote', id, 'zh-Hant')),
    );
    const exploit = slots.filter((slot) => slot === '14:30').length;
    expect(exploit / slots.length).toBeGreaterThan(0.7);
    expect(exploit / slots.length).toBeLessThan(0.9);
    expect(new Set(slots)).toEqual(new Set(['14:30', '12:00']));
    expect(mocks.assign).toHaveBeenCalledWith(
      expect.objectContaining({ experimentKey: 'rednote-slot-v1' }),
    );
  });

  it('splits Threads evenly between two unmeasured times', async () => {
    const slots = await Promise.all(
      episodeIds(200).map((id) => slotFor('threads', id, 'ja')),
    );
    const early = slots.filter((slot) => slot === '9:30').length;
    expect(early / slots.length).toBeGreaterThan(0.35);
    expect(early / slots.length).toBeLessThan(0.65);
    expect(mocks.assign).toHaveBeenCalledWith(
      expect.objectContaining({ experimentKey: 'threads-timing-v1' }),
    );
  });

  it('gives one episode the same slot on every call', async () => {
    const first = await slotFor('rednote', 'episode-stable', 'zh-Hant');
    const second = await slotFor('rednote', 'episode-stable', 'zh-Hant');
    expect(second).toBe(first);
  });

  it('swaps the X languages between the two times each day', async () => {
    const day = new Date('2026-09-01T03:00:00.000Z');
    const nextDay = new Date('2026-09-02T03:00:00.000Z');
    const japaneseToday = await slotFor('x', 'episode-1', 'ja', day);
    const englishToday = await slotFor('x', 'episode-2', 'en', day);
    expect(new Set([japaneseToday, englishToday])).toEqual(
      new Set(['12:15', '17:00']),
    );
    // The crossover is the whole point: a language held to one time forever is
    // indistinguishable from that time performing differently.
    expect(await slotFor('x', 'episode-1', 'ja', nextDay)).toBe(englishToday);
    expect(await slotFor('x', 'episode-2', 'en', nextDay)).toBe(japaneseToday);
  });

  it('does not create an assignment row for a platform with one slot', async () => {
    mocks.assign.mockClear();
    expect(await slotFor('youtube', 'episode-1', 'en')).toBe('17:15');
    expect(mocks.assign).not.toHaveBeenCalled();
  });
});

describe('nextBudgetSlot', () => {
  const fixedPlan = { slotOnDay: () => ({ hour: 14, minute: 30 }) };

  it('moves to the next day once the cap for one is spent', () => {
    const taken = new Date('2026-09-01T05:30:00.000Z');
    const slot = nextBudgetSlot({
      platform: 'rednote',
      plan: fixedPlan,
      after: READY,
      scheduled: [taken],
    });
    expect(slot?.toISOString()).toBe('2026-09-02T05:30:00.000Z');
  });

  it('counts both X languages against the same daily cap', () => {
    const day = startOfJstDay(new Date('2026-09-01T03:00:00.000Z'));
    const morning = new Date(day.getTime() + (12 * 60 + 15) * 60_000);
    const afternoon = new Date(day.getTime() + 17 * 60 * 60_000);
    // Two lanes already placed, in two different languages: the cap of 2 is
    // spent, so a third episode cannot slip through by being the other one.
    const slot = nextBudgetSlot({
      platform: 'x',
      plan: { slotOnDay: () => ({ hour: 12, minute: 15 }) },
      after: new Date('2026-09-01T00:00:00.000Z'),
      scheduled: [morning, afternoon],
    });
    expect(slot?.getTime()).toBeGreaterThanOrEqual(
      day.getTime() + 24 * 60 * 60_000,
    );
  });

  it('never reuses a slot another episode already holds', () => {
    const day = startOfJstDay(READY);
    const taken = new Date(day.getTime() + (12 * 60 + 15) * 60_000);
    const slot = nextBudgetSlot({
      platform: 'x',
      plan: { slotOnDay: () => ({ hour: 12, minute: 15 }) },
      after: READY,
      scheduled: [taken],
    });
    expect(slot?.toISOString()).not.toBe(taken.toISOString());
  });

  it('never schedules a slot that has already passed today', () => {
    const afternoon = new Date('2026-09-01T08:00:00.000Z');
    const slot = nextBudgetSlot({
      platform: 'rednote',
      plan: fixedPlan,
      after: afternoon,
      scheduled: [],
    });
    expect(slot?.toISOString()).toBe('2026-09-02T05:30:00.000Z');
  });

  it('returns nothing rather than compressing a backlog past the horizon', () => {
    const day = startOfJstDay(READY);
    const full = Array.from(
      { length: SCHEDULING_HORIZON_DAYS },
      (_, index) =>
        new Date(day.getTime() + index * 24 * 60 * 60_000 + 5.5 * 60 * 60_000),
    );
    expect(
      nextBudgetSlot({
        platform: 'rednote',
        plan: fixedPlan,
        after: READY,
        scheduled: full,
      }),
    ).toBeNull();
  });
});

describe('occupiesPublishBudget', () => {
  it('keeps a queued lane on the books', () => {
    expect(
      occupiesPublishBudget({
        status: 'queued',
        scheduled_at: '2026-09-01T05:30:00.000Z',
        completed_at: null,
      }),
    ).toBe(true);
  });

  it('ignores a completed row bound to a slot it never used', () => {
    // Reconciliation binds an already-live post to a job without moving its
    // scheduled_at, which is how rows dated 9/1-9/4 carry an 08-19 completion.
    expect(
      occupiesPublishBudget({
        status: 'completed',
        scheduled_at: '2026-09-01T05:30:00.000Z',
        completed_at: '2026-08-19T05:30:00.000Z',
      }),
    ).toBe(false);
  });

  it('still counts a row completed on the day it was scheduled', () => {
    expect(
      occupiesPublishBudget({
        status: 'completed',
        scheduled_at: '2026-09-01T05:30:00.000Z',
        completed_at: '2026-09-01T05:33:00.000Z',
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
