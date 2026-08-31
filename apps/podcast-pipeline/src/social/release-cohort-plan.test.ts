import { describe, expect, it } from 'vitest';

import { SOCIAL_RELEASE_SLOTS } from './policy.js';
import {
  planPendingSocialReleaseCohorts,
  type ReleaseScheduleRow,
} from './release-cohort-plan.js';

const GRACE_MS = 90 * 60_000;
const ARTICLE_A = '123e4567-e89b-42d3-a456-426614174000';
const ARTICLE_B = '123e4567-e89b-42d3-a456-426614174111';
const ARTICLE_C = '123e4567-e89b-42d3-a456-426614174222';

// Article slots are 09:30 / 12:00 / 16:00 JST, three articles per JST day.
const SEP_01_1200 = '2026-09-01T03:00:00.000Z';
const SEP_01_1600 = '2026-09-01T07:00:00.000Z';
const SEP_02_0930 = '2026-09-02T00:30:00.000Z';
const SEP_02_1200 = '2026-09-02T03:00:00.000Z';
const SEP_02_1600 = '2026-09-02T07:00:00.000Z';
const SLOT_AUG_31 = '2026-08-31T03:00:00.000Z';
const LEGACY_REDNOTE_SLOT = '2026-09-01T05:30:00.000Z'; // 14:30 JST, not a slot

function row(
  episodeId: string,
  id: string,
  overrides: Partial<ReleaseScheduleRow> = {},
): ReleaseScheduleRow {
  return {
    id,
    episode_id: episodeId,
    status: 'queued',
    scheduled_at: SEP_01_1200,
    next_attempt_at: SEP_01_1200,
    completed_at: null,
    ...overrides,
  };
}

function at(time: string) {
  return { scheduled_at: time, next_attempt_at: time };
}

describe('planPendingSocialReleaseCohorts · on-time cohorts', () => {
  it('leaves an aligned cohort on its own slot inside the grace period', () => {
    const rows = [
      row(ARTICLE_A, 'rednote'),
      row(ARTICLE_A, 'threads'),
      row(ARTICLE_A, 'youtube'),
    ];

    // 13:00 JST, one hour past a 12:00 JST slot: still inside the 90m grace.
    const plan = planPendingSocialReleaseCohorts(
      rows,
      new Date('2026-09-01T04:00:00.000Z'),
      GRACE_MS,
    );

    expect(plan.updates).toEqual([]);
    expect(plan.recoveryEpisodes).toEqual([]);
  });

  it('moves a cohort parked on a time that is not a configured article slot', () => {
    // Legacy per-platform rows: internally aligned, but 14:30 JST is not an
    // article slot, so the cohort cannot stay there.
    const rows = [
      row(ARTICLE_B, 'rednote', at(LEGACY_REDNOTE_SLOT)),
      row(ARTICLE_B, 'threads', at(LEGACY_REDNOTE_SLOT)),
    ];

    const plan = planPendingSocialReleaseCohorts(
      rows,
      new Date('2026-09-01T04:00:00.000Z'),
      GRACE_MS,
    );

    expect(plan.updates.map((update) => update.scheduledAt)).toEqual([
      SEP_01_1600,
      SEP_01_1600,
    ]);
    expect(plan.updates.every((update) => update.reason === 'reschedule')).toBe(
      true,
    );
  });

  it('serializes cohorts oldest-first so an on-time article keeps its slot', () => {
    // Declared newest-first to prove the planner sorts by earliest schedule
    // rather than trusting row order.
    const rows = [
      row(ARTICLE_B, 'b-rednote', at(LEGACY_REDNOTE_SLOT)),
      row(ARTICLE_B, 'b-threads', at(LEGACY_REDNOTE_SLOT)),
      row(ARTICLE_A, 'a-rednote'),
      row(ARTICLE_A, 'a-threads'),
    ];

    const plan = planPendingSocialReleaseCohorts(
      rows,
      new Date('2026-09-01T04:00:00.000Z'),
      GRACE_MS,
    );

    // A keeps 12:00; B takes the next free article slot rather than
    // double-booking that one.
    expect(plan.updates.map((update) => update.episodeId)).toEqual([
      ARTICLE_B,
      ARTICLE_B,
    ]);
    expect(new Set(plan.updates.map((update) => update.scheduledAt))).toEqual(
      new Set([SEP_01_1600]),
    );
  });

  it('realigns a cohort whose lanes disagree even inside the grace period', () => {
    // The grace period protects an on-time article, not a staggered one: a
    // split cohort is the drift this whole model exists to remove.
    const rows = [
      row(ARTICLE_A, 'rednote'),
      row(ARTICLE_A, 'threads', at(LEGACY_REDNOTE_SLOT)),
    ];

    const plan = planPendingSocialReleaseCohorts(
      rows,
      new Date('2026-09-01T04:00:00.000Z'),
      GRACE_MS,
    );

    expect(plan.updates.map((update) => update.id)).toEqual([
      'rednote',
      'threads',
    ]);
    expect(new Set(plan.updates.map((update) => update.scheduledAt))).toEqual(
      new Set([SEP_01_1600]),
    );
  });

  it('moves an aligned cohort off a slot another article already occupies', () => {
    const rows = [
      // A live lease owns the 12:00 slot.
      row(ARTICLE_C, 'c-leased', { status: 'processing' }),
      row(ARTICLE_C, 'c-queued'),
      row(ARTICLE_A, 'a-rednote'),
      row(ARTICLE_A, 'a-threads'),
    ];

    const plan = planPendingSocialReleaseCohorts(
      rows,
      new Date('2026-09-01T04:00:00.000Z'),
      GRACE_MS,
    );

    // The leased article is never rewritten, including its queued sibling.
    expect(plan.updates.map((update) => update.id)).toEqual([
      'a-rednote',
      'a-threads',
    ]);
    expect(new Set(plan.updates.map((update) => update.scheduledAt))).toEqual(
      new Set([SEP_01_1600]),
    );
  });
});

describe('planPendingSocialReleaseCohorts · missed cohorts', () => {
  it('moves a whole cohort to the next slot once the grace period has passed', () => {
    const rows = [row(ARTICLE_A, 'rednote'), row(ARTICLE_A, 'threads')];

    // 14:00 JST, two hours past the slot: beyond the 90m grace.
    const plan = planPendingSocialReleaseCohorts(
      rows,
      new Date('2026-09-01T05:00:00.000Z'),
      GRACE_MS,
    );

    expect(plan.updates).toEqual([
      {
        id: 'rednote',
        episodeId: ARTICLE_A,
        status: 'queued',
        scheduledAt: SEP_01_1600,
        nextAttemptAt: SEP_01_1600,
        reason: 'reschedule',
      },
      {
        id: 'threads',
        episodeId: ARTICLE_A,
        status: 'queued',
        scheduledAt: SEP_01_1600,
        nextAttemptAt: SEP_01_1600,
        reason: 'reschedule',
      },
    ]);
  });

  it('leaves the last slot of a day free when a ghost row never used it', () => {
    const rows = [
      // 09-02 already holds a lease and a genuinely same-day publish...
      row('leased-episode', 'leased', {
        status: 'processing',
        ...at(SEP_02_0930),
      }),
      row('published-episode', 'published', {
        status: 'completed',
        ...at(SEP_02_1200),
        completed_at: '2026-09-02T03:01:00.000Z',
      }),
      // ...plus a ghost: reconciliation bound an already-live post to a future
      // queue slot it never actually consumed, so 16:00 is still free.
      row(ARTICLE_C, 'c-ghost', {
        status: 'completed',
        ...at(SEP_02_1600),
        completed_at: '2026-08-20T04:00:00.000Z',
      }),
      // 17:15 JST is not an article slot, and every 09-01 slot has passed.
      row(ARTICLE_A, 'a-rednote', at('2026-09-01T08:15:00.000Z')),
    ];

    const plan = planPendingSocialReleaseCohorts(
      rows,
      new Date('2026-09-01T09:00:00.000Z'),
      GRACE_MS,
    );

    expect(plan.updates.map((update) => update.scheduledAt)).toEqual([
      SEP_02_1600,
    ]);
  });

  it('leaves a cohort untouched when no slot exists inside the horizon', () => {
    const dayMs = 24 * 60 * 60_000;
    const startOfSep01Jst = Date.parse('2026-08-31T15:00:00.000Z');
    const occupied = Array.from({ length: 366 }).flatMap((_, day) =>
      SOCIAL_RELEASE_SLOTS.map((slot) => {
        const at0 = new Date(
          startOfSep01Jst +
            day * dayMs +
            (slot.hour * 60 + slot.minute) * 60_000,
        ).toISOString();
        const id = `occupied-${day}-${slot.hour}`;
        return row(id, id, {
          status: 'completed',
          scheduled_at: at0,
          next_attempt_at: at0,
          completed_at: at0,
        });
      }),
    );

    const plan = planPendingSocialReleaseCohorts(
      [...occupied, row(ARTICLE_A, 'a-rednote', at(LEGACY_REDNOTE_SLOT))],
      new Date('2026-09-01T04:00:00.000Z'),
      GRACE_MS,
    );

    expect(plan.updates).toEqual([]);
  });
});

describe('planPendingSocialReleaseCohorts · partial and settled articles', () => {
  it('anchors surviving lanes to the published lane and keeps later backoff', () => {
    const rows = [
      row(ARTICLE_A, 'published', {
        status: 'completed',
        scheduled_at: SLOT_AUG_31,
        next_attempt_at: SLOT_AUG_31,
        completed_at: '2026-08-31T03:01:00.000Z',
      }),
      row(ARTICLE_A, 'retrying', {
        status: 'failed',
        scheduled_at: '2026-08-31T08:15:00.000Z',
        next_attempt_at: '2026-09-01T02:00:00.000Z',
      }),
    ];

    const plan = planPendingSocialReleaseCohorts(
      rows,
      new Date('2026-09-01T04:00:00.000Z'),
      GRACE_MS,
    );

    expect(plan.recoveryEpisodes).toEqual([ARTICLE_A]);
    expect(plan.updates).toEqual([
      {
        id: 'retrying',
        episodeId: ARTICLE_A,
        status: 'failed',
        scheduledAt: SLOT_AUG_31,
        nextAttemptAt: '2026-09-01T02:00:00.000Z',
        reason: 'recovery',
      },
    ]);
  });

  it('anchors a recovery cohort to when the article actually went live', () => {
    // A lane published ahead of its slot: recovery follows the real release
    // moment, so the surviving lanes become due now instead of waiting for a
    // planned time the article already overtook.
    const rows = [
      row(ARTICLE_A, 'published', {
        status: 'completed',
        completed_at: '2026-08-31T10:00:00.000Z',
      }),
      row(ARTICLE_A, 'retrying', {
        status: 'failed',
        next_attempt_at: '2026-08-31T09:00:00.000Z',
      }),
    ];

    const plan = planPendingSocialReleaseCohorts(
      rows,
      new Date('2026-09-01T04:00:00.000Z'),
      GRACE_MS,
    );

    expect(plan.updates).toEqual([
      {
        id: 'retrying',
        episodeId: ARTICLE_A,
        status: 'failed',
        scheduledAt: '2026-08-31T10:00:00.000Z',
        nextAttemptAt: '2026-08-31T10:00:00.000Z',
        reason: 'recovery',
      },
    ]);
  });

  it('pulls an already-elapsed retry forward onto the recovery timestamp', () => {
    const rows = [
      row(ARTICLE_A, 'published', {
        status: 'completed',
        scheduled_at: SEP_01_1200,
        next_attempt_at: SEP_01_1200,
        completed_at: '2026-09-01T03:01:00.000Z',
      }),
      row(ARTICLE_A, 'retrying', {
        status: 'failed',
        scheduled_at: '2026-09-01T08:15:00.000Z',
        next_attempt_at: '2026-08-31T23:00:00.000Z',
      }),
    ];

    const plan = planPendingSocialReleaseCohorts(
      rows,
      new Date('2026-09-01T04:00:00.000Z'),
      GRACE_MS,
    );

    expect(plan.updates).toEqual([
      {
        id: 'retrying',
        episodeId: ARTICLE_A,
        status: 'failed',
        scheduledAt: SEP_01_1200,
        nextAttemptAt: SEP_01_1200,
        reason: 'recovery',
      },
    ]);
  });

  it('emits nothing for a partial article whose lanes already agree', () => {
    const rows = [
      row(ARTICLE_A, 'published', {
        status: 'completed',
        completed_at: '2026-09-01T03:01:00.000Z',
      }),
      row(ARTICLE_A, 'retrying', { status: 'failed' }),
    ];

    const plan = planPendingSocialReleaseCohorts(
      rows,
      new Date('2026-09-01T04:00:00.000Z'),
      GRACE_MS,
    );

    expect(plan.recoveryEpisodes).toEqual([ARTICLE_A]);
    expect(plan.updates).toEqual([]);
  });

  it('reports a fully published article as neither recovery nor pending work', () => {
    const rows = [
      row(ARTICLE_A, 'published-a', {
        status: 'completed',
        completed_at: '2026-09-01T03:01:00.000Z',
      }),
      row(ARTICLE_A, 'published-b', {
        status: 'completed',
        completed_at: '2026-09-01T03:02:00.000Z',
      }),
    ];

    const plan = planPendingSocialReleaseCohorts(
      rows,
      new Date('2026-09-01T04:00:00.000Z'),
      GRACE_MS,
    );

    expect(plan).toEqual({ updates: [], recoveryEpisodes: [] });
  });

  it('does not rewrite a lane of an article that holds a live lease', () => {
    const rows = [
      row(ARTICLE_A, 'leased', {
        status: 'processing',
        ...at('2026-09-01T08:15:00.000Z'),
      }),
      row(ARTICLE_A, 'waiting'),
    ];

    const plan = planPendingSocialReleaseCohorts(
      rows,
      new Date('2026-09-01T05:00:00.000Z'),
      GRACE_MS,
    );

    expect(plan.updates).toEqual([]);
    expect(plan.recoveryEpisodes).toEqual([]);
  });
});
