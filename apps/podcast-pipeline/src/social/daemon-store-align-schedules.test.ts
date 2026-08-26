import { beforeEach, describe, expect, it, vi } from 'vitest';

interface PendingJob {
  id: string;
  episode_id: string;
  status: 'queued' | 'failed';
  scheduled_at: string;
  next_attempt_at: string;
}

interface UpdateRecord {
  id: string | undefined;
  status: string | undefined;
  patch: Record<string, unknown>;
}

const state = vi.hoisted(() => ({
  jobs: [] as PendingJob[],
  updates: [] as UpdateRecord[],
  updateResults: [] as boolean[],
}));

const supabaseMocks = vi.hoisted(() => ({
  getPipelineSupabase: vi.fn(),
  throwSupabaseError: vi.fn((error: unknown) => {
    throw error;
  }),
}));

vi.mock('../services/supabase-client.js', () => supabaseMocks);

import { alignPendingSocialPublishSchedules } from './daemon-store.js';

const NOW = new Date('2026-08-19T00:00:00.000Z');

function createSelectBuilder() {
  const returns = vi.fn(async () => ({ data: state.jobs, error: null }));
  const inFilter = vi.fn(() => ({ returns }));
  return vi.fn(() => ({ in: inFilter }));
}

function createUpdateBuilder(patch: Record<string, unknown>) {
  let id: string | undefined;
  let status: string | undefined;

  const maybeSingle = vi.fn(async () => {
    state.updates.push({ id, status, patch });
    const updated = state.updateResults.shift() ?? true;
    return { data: updated && id ? { id } : null, error: null };
  });
  const select = vi.fn(() => ({ maybeSingle }));
  const builder = {
    eq(field: string, value: string) {
      if (field === 'id') id = value;
      if (field === 'status') status = value;
      return builder;
    },
    select,
  };
  return builder;
}

function createSupabaseClient() {
  const select = createSelectBuilder();
  const update = vi.fn((patch: Record<string, unknown>) =>
    createUpdateBuilder(patch),
  );
  const from = vi.fn(() => ({ select, update }));
  return { from };
}

describe('alignPendingSocialPublishSchedules', () => {
  beforeEach(() => {
    state.jobs = [];
    state.updates = [];
    state.updateResults = [];
    supabaseMocks.getPipelineSupabase.mockReturnValue(createSupabaseClient());
  });

  it('aligns each episode independently without erasing failed-job retry backoff', async () => {
    state.jobs = [
      {
        id: 'failed-earliest',
        episode_id: 'episode-1',
        status: 'failed',
        scheduled_at: '2026-08-19T01:00:00.000Z',
        next_attempt_at: '2026-08-19T05:00:00.000Z',
      },
      {
        id: 'queued-later',
        episode_id: 'episode-1',
        status: 'queued',
        scheduled_at: '2026-08-19T02:00:00.000Z',
        next_attempt_at: '2026-08-19T02:00:00.000Z',
      },
      {
        id: 'failed-later',
        episode_id: 'episode-1',
        status: 'failed',
        scheduled_at: '2026-08-19T03:00:00.000Z',
        next_attempt_at: '2026-08-19T08:00:00.000Z',
      },
      {
        id: 'other-earliest',
        episode_id: 'episode-2',
        status: 'queued',
        scheduled_at: '2026-08-19T04:00:00.000Z',
        next_attempt_at: '2026-08-19T04:00:00.000Z',
      },
      {
        id: 'other-later',
        episode_id: 'episode-2',
        status: 'queued',
        scheduled_at: '2026-08-19T06:00:00.000Z',
        next_attempt_at: '2026-08-19T06:00:00.000Z',
      },
    ];

    await expect(alignPendingSocialPublishSchedules(NOW)).resolves.toBe(3);

    expect(state.updates).toEqual([
      {
        id: 'queued-later',
        status: 'queued',
        patch: {
          scheduled_at: '2026-08-19T01:00:00.000Z',
          next_attempt_at: '2026-08-19T01:00:00.000Z',
        },
      },
      {
        id: 'failed-later',
        status: 'failed',
        patch: {
          scheduled_at: '2026-08-19T01:00:00.000Z',
        },
      },
      {
        id: 'other-later',
        status: 'queued',
        patch: {
          scheduled_at: '2026-08-19T04:00:00.000Z',
          next_attempt_at: '2026-08-19T04:00:00.000Z',
        },
      },
    ]);
  });

  it('derives the earliest schedule independently of snapshot row order', async () => {
    state.jobs = [
      {
        id: 'queued-latest',
        episode_id: 'episode-unordered',
        status: 'queued',
        scheduled_at: '2026-08-19T05:00:00.000Z',
        next_attempt_at: '2026-08-19T05:00:00.000Z',
      },
      {
        id: 'failed-middle',
        episode_id: 'episode-unordered',
        status: 'failed',
        scheduled_at: '2026-08-19T03:00:00.000Z',
        next_attempt_at: '2026-08-19T09:00:00.000Z',
      },
      {
        id: 'queued-earliest-last',
        episode_id: 'episode-unordered',
        status: 'queued',
        scheduled_at: '2026-08-19T01:00:00.000Z',
        next_attempt_at: '2026-08-19T01:00:00.000Z',
      },
    ];

    await expect(alignPendingSocialPublishSchedules(NOW)).resolves.toBe(2);

    expect(state.updates).toEqual([
      {
        id: 'queued-latest',
        status: 'queued',
        patch: {
          scheduled_at: '2026-08-19T01:00:00.000Z',
          next_attempt_at: '2026-08-19T01:00:00.000Z',
        },
      },
      {
        id: 'failed-middle',
        status: 'failed',
        patch: {
          scheduled_at: '2026-08-19T01:00:00.000Z',
        },
      },
    ]);
  });

  it('does not count a queued job that is concurrently claimed before alignment', async () => {
    state.jobs = [
      {
        id: 'earliest',
        episode_id: 'episode-1',
        status: 'failed',
        scheduled_at: '2026-08-19T01:00:00.000Z',
        next_attempt_at: '2026-08-19T05:00:00.000Z',
      },
      {
        id: 'claimed-before-update',
        episode_id: 'episode-1',
        status: 'queued',
        scheduled_at: '2026-08-19T02:00:00.000Z',
        next_attempt_at: '2026-08-19T02:00:00.000Z',
      },
    ];
    state.updateResults = [false];

    await expect(alignPendingSocialPublishSchedules(NOW)).resolves.toBe(0);

    expect(state.updates).toEqual([
      {
        id: 'claimed-before-update',
        status: 'queued',
        patch: {
          scheduled_at: '2026-08-19T01:00:00.000Z',
          next_attempt_at: '2026-08-19T01:00:00.000Z',
        },
      },
    ]);
  });

  it('counts only successful alignment updates after a partial CAS miss', async () => {
    state.jobs = [
      {
        id: 'earliest',
        episode_id: 'episode-1',
        status: 'failed',
        scheduled_at: '2026-08-19T01:00:00.000Z',
        next_attempt_at: '2026-08-19T05:00:00.000Z',
      },
      {
        id: 'claimed-before-update',
        episode_id: 'episode-1',
        status: 'queued',
        scheduled_at: '2026-08-19T02:00:00.000Z',
        next_attempt_at: '2026-08-19T02:00:00.000Z',
      },
      {
        id: 'still-queued',
        episode_id: 'episode-1',
        status: 'queued',
        scheduled_at: '2026-08-19T03:00:00.000Z',
        next_attempt_at: '2026-08-19T03:00:00.000Z',
      },
    ];
    state.updateResults = [false, true];

    await expect(alignPendingSocialPublishSchedules(NOW)).resolves.toBe(1);

    expect(state.updates).toEqual([
      {
        id: 'claimed-before-update',
        status: 'queued',
        patch: {
          scheduled_at: '2026-08-19T01:00:00.000Z',
          next_attempt_at: '2026-08-19T01:00:00.000Z',
        },
      },
      {
        id: 'still-queued',
        status: 'queued',
        patch: {
          scheduled_at: '2026-08-19T01:00:00.000Z',
          next_attempt_at: '2026-08-19T01:00:00.000Z',
        },
      },
    ]);
  });

  it('preserves failed retry backoff when a queued alignment update loses its CAS race', async () => {
    state.jobs = [
      {
        id: 'earliest',
        episode_id: 'episode-1',
        status: 'queued',
        scheduled_at: '2026-08-19T01:00:00.000Z',
        next_attempt_at: '2026-08-19T01:00:00.000Z',
      },
      {
        id: 'queued-cas-miss',
        episode_id: 'episode-1',
        status: 'queued',
        scheduled_at: '2026-08-19T02:00:00.000Z',
        next_attempt_at: '2026-08-19T02:00:00.000Z',
      },
      {
        id: 'failed-still-retrying',
        episode_id: 'episode-1',
        status: 'failed',
        scheduled_at: '2026-08-19T03:00:00.000Z',
        next_attempt_at: '2026-08-19T09:00:00.000Z',
      },
    ];
    state.updateResults = [false, true];

    await expect(alignPendingSocialPublishSchedules(NOW)).resolves.toBe(1);

    expect(state.updates).toEqual([
      {
        id: 'queued-cas-miss',
        status: 'queued',
        patch: {
          scheduled_at: '2026-08-19T01:00:00.000Z',
          next_attempt_at: '2026-08-19T01:00:00.000Z',
        },
      },
      {
        id: 'failed-still-retrying',
        status: 'failed',
        patch: {
          scheduled_at: '2026-08-19T01:00:00.000Z',
        },
      },
    ]);
    expect(state.updates[1]?.patch).not.toHaveProperty('next_attempt_at');
  });

  it('counts a queued sibling when the failed alignment loses its CAS race', async () => {
    state.jobs = [
      {
        id: 'earliest',
        episode_id: 'episode-1',
        status: 'queued',
        scheduled_at: '2026-08-19T01:00:00.000Z',
        next_attempt_at: '2026-08-19T01:00:00.000Z',
      },
      {
        id: 'failed-cas-miss',
        episode_id: 'episode-1',
        status: 'failed',
        scheduled_at: '2026-08-19T02:00:00.000Z',
        next_attempt_at: '2026-08-19T09:00:00.000Z',
      },
      {
        id: 'queued-success',
        episode_id: 'episode-1',
        status: 'queued',
        scheduled_at: '2026-08-19T03:00:00.000Z',
        next_attempt_at: '2026-08-19T03:00:00.000Z',
      },
    ];
    state.updateResults = [false, true];

    await expect(alignPendingSocialPublishSchedules(NOW)).resolves.toBe(1);

    expect(state.updates).toEqual([
      {
        id: 'failed-cas-miss',
        status: 'failed',
        patch: {
          scheduled_at: '2026-08-19T01:00:00.000Z',
        },
      },
      {
        id: 'queued-success',
        status: 'queued',
        patch: {
          scheduled_at: '2026-08-19T01:00:00.000Z',
          next_attempt_at: '2026-08-19T01:00:00.000Z',
        },
      },
    ]);
    expect(state.updates[0]?.patch).not.toHaveProperty('next_attempt_at');
  });

  it('isolates failed-job backoff and count across a partial failed CAS miss', async () => {
    state.jobs = [
      {
        id: 'earliest',
        episode_id: 'episode-1',
        status: 'queued',
        scheduled_at: '2026-08-19T01:00:00.000Z',
        next_attempt_at: '2026-08-19T01:00:00.000Z',
      },
      {
        id: 'failed-cas-miss',
        episode_id: 'episode-1',
        status: 'failed',
        scheduled_at: '2026-08-19T02:00:00.000Z',
        next_attempt_at: '2026-08-19T09:00:00.000Z',
      },
      {
        id: 'failed-success',
        episode_id: 'episode-1',
        status: 'failed',
        scheduled_at: '2026-08-19T03:00:00.000Z',
        next_attempt_at: '2026-08-19T11:00:00.000Z',
      },
    ];
    state.updateResults = [false, true];

    await expect(alignPendingSocialPublishSchedules(NOW)).resolves.toBe(1);

    expect(state.updates).toEqual([
      {
        id: 'failed-cas-miss',
        status: 'failed',
        patch: {
          scheduled_at: '2026-08-19T01:00:00.000Z',
        },
      },
      {
        id: 'failed-success',
        status: 'failed',
        patch: {
          scheduled_at: '2026-08-19T01:00:00.000Z',
        },
      },
    ]);
    expect(state.updates[0]?.patch).not.toHaveProperty('next_attempt_at');
    expect(state.updates[1]?.patch).not.toHaveProperty('next_attempt_at');
  });
});
