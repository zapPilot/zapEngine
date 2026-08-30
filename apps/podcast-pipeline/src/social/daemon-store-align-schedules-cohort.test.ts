import { describe, expect, it, vi } from 'vitest';

interface CohortJob {
  id: string;
  episode_id: string;
  status: 'queued' | 'failed' | 'processing' | 'completed';
  scheduled_at: string;
  next_attempt_at: string;
}

const state = vi.hoisted(() => ({
  jobs: [] as CohortJob[],
  updates: [] as AlignmentUpdateRecord[],
}));

const supabaseMocks = vi.hoisted(() => ({
  getPipelineSupabase: vi.fn(),
  throwSupabaseError: vi.fn((error: unknown) => {
    throw error;
  }),
}));

vi.mock('../services/supabase-client.js', () => supabaseMocks);

import { alignPendingSocialPublishSchedules } from './daemon-store.js';
import {
  type AlignmentUpdateRecord,
  createAlignmentReadFixture,
  createAlignmentUpdateFixture,
} from './daemon-store-align-schedules.test-helper.js';

function installFixture(jobs: CohortJob[]): void {
  state.jobs = jobs;
  const mutation = createAlignmentUpdateFixture();
  state.updates = mutation.updates;
  const fixture = createAlignmentReadFixture<CohortJob>(
    () => ({ data: state.jobs, error: null }),
    mutation.update,
  );
  supabaseMocks.getPipelineSupabase.mockReturnValue(fixture.client);
}

const NOW = new Date('2026-08-26T00:00:00.000Z');

describe('alignPendingSocialPublishSchedules release cohort behavior', () => {
  it('pulls a lagging pending lane to a completed sibling in the past, making it immediately due', async () => {
    installFixture([
      {
        id: 'completed-sibling',
        episode_id: 'episode-1',
        status: 'completed',
        scheduled_at: '2026-08-25T03:00:00.000Z',
        next_attempt_at: '2026-08-25T03:00:00.000Z',
      },
      {
        id: 'lagging-lane',
        episode_id: 'episode-1',
        status: 'queued',
        scheduled_at: '2026-08-27T00:30:00.000Z',
        next_attempt_at: '2026-08-27T00:30:00.000Z',
      },
    ]);

    await expect(alignPendingSocialPublishSchedules(NOW)).resolves.toBe(1);

    expect(state.updates).toEqual([
      {
        id: 'lagging-lane',
        status: 'queued',
        patch: {
          scheduled_at: '2026-08-25T03:00:00.000Z',
          next_attempt_at: '2026-08-25T03:00:00.000Z',
        },
      },
    ]);
  });

  it('does not rewrite a pending lane that is already due, even if a different anchor exists', async () => {
    installFixture([
      {
        id: 'completed-sibling',
        episode_id: 'episode-2',
        status: 'completed',
        scheduled_at: '2026-08-20T00:00:00.000Z',
        next_attempt_at: '2026-08-20T00:00:00.000Z',
      },
      {
        id: 'already-due-lane',
        episode_id: 'episode-2',
        status: 'queued',
        scheduled_at: '2026-08-25T00:00:00.000Z',
        next_attempt_at: '2026-08-25T00:00:00.000Z',
      },
    ]);

    await expect(alignPendingSocialPublishSchedules(NOW)).resolves.toBe(0);

    expect(state.updates).toEqual([]);
  });

  it('pulls a failed lane to a past completed sibling without erasing its retry backoff', async () => {
    installFixture([
      {
        id: 'completed-sibling',
        episode_id: 'episode-3',
        status: 'completed',
        scheduled_at: '2026-08-24T00:00:00.000Z',
        next_attempt_at: '2026-08-24T00:00:00.000Z',
      },
      {
        id: 'failed-lane',
        episode_id: 'episode-3',
        status: 'failed',
        scheduled_at: '2026-08-27T00:00:00.000Z',
        next_attempt_at: '2026-08-27T05:00:00.000Z',
      },
    ]);

    await expect(alignPendingSocialPublishSchedules(NOW)).resolves.toBe(1);

    expect(state.updates).toEqual([
      {
        id: 'failed-lane',
        status: 'failed',
        patch: { scheduled_at: '2026-08-24T00:00:00.000Z' },
      },
    ]);
  });

  it('lets a processing row anchor the cohort without ever writing to it', async () => {
    installFixture([
      {
        id: 'processing-lane',
        episode_id: 'episode-4',
        status: 'processing',
        scheduled_at: '2026-08-24T00:00:00.000Z',
        next_attempt_at: '2026-08-24T00:00:00.000Z',
      },
      {
        id: 'lagging-lane',
        episode_id: 'episode-4',
        status: 'queued',
        scheduled_at: '2026-08-27T00:00:00.000Z',
        next_attempt_at: '2026-08-27T00:00:00.000Z',
      },
    ]);

    await expect(alignPendingSocialPublishSchedules(NOW)).resolves.toBe(1);

    expect(state.updates).toEqual([
      {
        id: 'lagging-lane',
        status: 'queued',
        patch: {
          scheduled_at: '2026-08-24T00:00:00.000Z',
          next_attempt_at: '2026-08-24T00:00:00.000Z',
        },
      },
    ]);
  });
});

describe('alignPendingSocialPublishSchedules claim-gate recovery', () => {
  // Production case: a hand-rescheduled cohort left one lane's
  // `next_attempt_at` a day ahead of its own `scheduled_at`. The lane looked
  // overdue, was never claimable, and held the partial-cohort fence shut for
  // every other article.
  it('pulls back a queued lane stranded by a next_attempt_at past its cohort slot', async () => {
    installFixture([
      {
        id: 'completed-sibling',
        episode_id: 'episode-stranded',
        status: 'completed',
        scheduled_at: '2026-08-25T08:21:00.000Z',
        next_attempt_at: '2026-08-25T08:30:00.000Z',
      },
      {
        id: 'stranded-lane',
        episode_id: 'episode-stranded',
        status: 'queued',
        scheduled_at: '2026-08-25T08:21:00.000Z',
        next_attempt_at: '2026-08-27T00:30:00.000Z',
      },
    ]);

    await expect(alignPendingSocialPublishSchedules(NOW)).resolves.toBe(1);

    expect(state.updates).toEqual([
      {
        id: 'stranded-lane',
        status: 'queued',
        patch: {
          scheduled_at: '2026-08-25T08:21:00.000Z',
          next_attempt_at: '2026-08-25T08:21:00.000Z',
        },
      },
    ]);
  });

  it('leaves an already-due failed lane serving its retry backoff untouched', async () => {
    installFixture([
      {
        id: 'completed-sibling',
        episode_id: 'episode-backoff',
        status: 'completed',
        scheduled_at: '2026-08-25T00:00:00.000Z',
        next_attempt_at: '2026-08-25T00:00:00.000Z',
      },
      {
        id: 'backoff-lane',
        episode_id: 'episode-backoff',
        status: 'failed',
        scheduled_at: '2026-08-25T08:00:00.000Z',
        next_attempt_at: '2026-08-27T00:00:00.000Z',
      },
    ]);

    await expect(alignPendingSocialPublishSchedules(NOW)).resolves.toBe(0);

    expect(state.updates).toEqual([]);
  });
});
