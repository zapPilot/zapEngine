import { beforeEach, describe, expect, it, vi } from 'vitest';

type Status = 'queued' | 'failed' | 'processing' | 'completed';
interface Row {
  id: string;
  episode_id: string;
  status: Status;
  scheduled_at: string;
  next_attempt_at: string;
  completed_at: string | null;
}

const state = vi.hoisted(() => ({
  rows: [] as Row[],
  updates: [] as Array<{ id: string; patch: Partial<Row> }>,
  rpc: vi.fn(),
}));

vi.mock('../services/supabase-client.js', () => ({
  throwSupabaseError: (error: unknown) => {
    throw error;
  },
  getPipelineSupabase: () => ({
    from: (table: string) => {
      if (table !== 'social_publish_jobs') throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          in: () => ({
            order: () => ({
              returns: async () => ({ data: state.rows.map((row) => ({ ...row })), error: null }),
            }),
          }),
        }),
        update: (patch: Partial<Row>) => {
          let id: string | null = null;
          let status: Status | null = null;
          const chain = {
            eq: (column: string, value: string) => {
              if (column === 'id') id = value;
              if (column === 'status') status = value as Status;
              return chain;
            },
            select: () => ({
              maybeSingle: async () => {
                const row = state.rows.find(
                  (candidate) => candidate.id === id && candidate.status === status,
                );
                if (!row) return { data: null, error: null };
                Object.assign(row, patch);
                state.updates.push({ id: row.id, patch: { ...patch } });
                return { data: { id: row.id }, error: null };
              },
            }),
          };
          return chain;
        },
      };
    },
    rpc: state.rpc,
  }),
}));

import {
  alignPendingSocialReleaseCohorts,
  claimReleaseCohortJobs,
  listPartiallyPublishedCohorts,
} from './release-cohort-store.js';

const NOW = new Date('2026-09-01T01:00:00.000Z'); // 10:00 JST
const A = '123e4567-e89b-42d3-a456-426614174000';
const B = '123e4567-e89b-42d3-a456-426614174111';

function row(input: Partial<Row> & Pick<Row, 'id' | 'episode_id'>): Row {
  return {
    status: 'queued',
    scheduled_at: '2026-09-01T03:00:00.000Z',
    next_attempt_at: '2026-09-01T03:00:00.000Z',
    completed_at: null,
    ...input,
  };
}

beforeEach(() => {
  state.rows = [];
  state.updates = [];
  state.rpc.mockReset().mockResolvedValue({ data: [], error: null });
});

describe('alignPendingSocialReleaseCohorts', () => {
  it('collapses a legacy staggered unpublished episode to one article timestamp', async () => {
    state.rows = [
      row({ id: 'a-rednote', episode_id: A, scheduled_at: '2026-09-01T03:00:00.000Z', next_attempt_at: '2026-09-01T03:00:00.000Z' }),
      row({ id: 'a-threads', episode_id: A, scheduled_at: '2026-09-01T05:30:00.000Z', next_attempt_at: '2026-09-01T05:30:00.000Z' }),
      row({ id: 'a-x', episode_id: A, scheduled_at: '2026-09-01T08:00:00.000Z', next_attempt_at: '2026-09-01T08:00:00.000Z' }),
      row({ id: 'a-youtube', episode_id: A, scheduled_at: '2026-09-01T08:15:00.000Z', next_attempt_at: '2026-09-01T08:15:00.000Z' }),
    ];

    const result = await alignPendingSocialReleaseCohorts(NOW, 90 * 60_000);

    expect(result.rescheduledEpisodes).toBe(1);
    expect(new Set(state.rows.map((item) => item.scheduled_at))).toEqual(
      new Set(['2026-09-01T03:00:00.000Z']),
    );
    expect(new Set(state.rows.map((item) => item.next_attempt_at))).toEqual(
      new Set(['2026-09-01T03:00:00.000Z']),
    );
  });

  it('serializes separate unpublished episodes as one article per JST day', async () => {
    state.rows = [
      row({ id: 'a-1', episode_id: A, scheduled_at: '2026-09-01T05:30:00.000Z', next_attempt_at: '2026-09-01T05:30:00.000Z' }),
      row({ id: 'b-1', episode_id: B, scheduled_at: '2026-09-01T08:15:00.000Z', next_attempt_at: '2026-09-01T08:15:00.000Z' }),
    ];

    await alignPendingSocialReleaseCohorts(NOW, 90 * 60_000);

    expect(state.rows.find((item) => item.episode_id === A)?.scheduled_at).toBe(
      '2026-09-02T03:00:00.000Z',
    );
    expect(state.rows.find((item) => item.episode_id === B)?.scheduled_at).toBe(
      '2026-09-03T03:00:00.000Z',
    );
  });

  it('keeps a correctly aligned cohort in the catch-up grace window', async () => {
    const justMissed = '2026-09-01T00:30:00.000Z';
    state.rows = [
      row({ id: 'a-1', episode_id: A, scheduled_at: justMissed, next_attempt_at: justMissed }),
      row({ id: 'a-2', episode_id: A, scheduled_at: justMissed, next_attempt_at: justMissed }),
    ];

    const result = await alignPendingSocialReleaseCohorts(
      new Date('2026-09-01T01:00:00.000Z'),
      90 * 60_000,
    );

    // 09:30 JST is not the configured article slot, so legacy timing is still
    // repaired rather than being grandfathered merely because it is recent.
    expect(result.rescheduledEpisodes).toBe(1);
    expect(new Set(state.rows.map((item) => item.scheduled_at))).toEqual(
      new Set(['2026-09-01T03:00:00.000Z']),
    );
  });

  it('leaves an aligned 12:00 cohort untouched while it is within grace', async () => {
    state.rows = [
      row({ id: 'a-1', episode_id: A }),
      row({ id: 'a-2', episode_id: A }),
    ];

    const result = await alignPendingSocialReleaseCohorts(
      new Date('2026-09-01T03:30:00.000Z'),
      90 * 60_000,
    );

    expect(result).toEqual({
      alignedLanes: 0,
      rescheduledEpisodes: 0,
      recoveryEpisodes: [],
    });
    expect(state.updates).toHaveLength(0);
  });

  it('moves an actually missed unpublished cohort as a whole to the next article slot', async () => {
    const old = '2026-08-31T03:00:00.000Z';
    state.rows = [
      row({ id: 'a-1', episode_id: A, scheduled_at: old, next_attempt_at: old }),
      row({ id: 'a-2', episode_id: A, scheduled_at: old, next_attempt_at: old }),
    ];

    await alignPendingSocialReleaseCohorts(NOW, 90 * 60_000);

    expect(new Set(state.rows.map((item) => item.scheduled_at))).toEqual(
      new Set(['2026-09-01T03:00:00.000Z']),
    );
  });

  it('does not resend completed lanes and preserves failed retry backoff in a partial cohort', async () => {
    const publishedAt = '2026-08-31T03:00:00.000Z';
    const retryAt = '2026-09-01T02:00:00.000Z';
    state.rows = [
      row({
        id: 'a-rednote',
        episode_id: A,
        status: 'completed',
        scheduled_at: publishedAt,
        next_attempt_at: publishedAt,
        completed_at: '2026-08-31T03:01:00.000Z',
      }),
      row({
        id: 'a-youtube',
        episode_id: A,
        status: 'failed',
        scheduled_at: '2026-08-31T08:15:00.000Z',
        next_attempt_at: retryAt,
      }),
    ];

    const result = await alignPendingSocialReleaseCohorts(NOW, 90 * 60_000);

    expect(result.recoveryEpisodes).toEqual([A]);
    expect(state.rows.find((item) => item.id === 'a-rednote')).toMatchObject({
      status: 'completed',
      scheduled_at: publishedAt,
      completed_at: '2026-08-31T03:01:00.000Z',
    });
    expect(state.rows.find((item) => item.id === 'a-youtube')).toMatchObject({
      status: 'failed',
      scheduled_at: publishedAt,
      next_attempt_at: retryAt,
    });
    expect(state.updates.map((update) => update.id)).toEqual(['a-youtube']);
  });

  it('never rewrites a processing row underneath its lease', async () => {
    state.rows = [
      row({ id: 'a-queued', episode_id: A }),
      row({
        id: 'a-processing',
        episode_id: A,
        status: 'processing',
        scheduled_at: '2026-09-01T08:15:00.000Z',
        next_attempt_at: '2026-09-01T08:15:00.000Z',
      }),
    ];

    await alignPendingSocialReleaseCohorts(NOW, 90 * 60_000);

    expect(state.updates.map((update) => update.id)).not.toContain('a-processing');
  });
});

describe('partial cohort claim fence', () => {
  it('identifies a completed + unfinished episode', async () => {
    state.rows = [
      row({ id: 'a-done', episode_id: A, status: 'completed', completed_at: NOW.toISOString() }),
      row({ id: 'a-pending', episode_id: A }),
      row({ id: 'b-pending', episode_id: B }),
    ];

    expect(await listPartiallyPublishedCohorts()).toEqual([A]);
  });

  it('passes p_episode_id only when recovering a partial cohort', async () => {
    await claimReleaseCohortJobs({ owner: 'daemon', now: NOW, episodeId: A });
    expect(state.rpc).toHaveBeenLastCalledWith('claim_social_publish_batch', {
      p_owner: 'daemon',
      p_now: NOW.toISOString(),
      p_episode_id: A,
    });

    await claimReleaseCohortJobs({ owner: 'daemon', now: NOW });
    expect(state.rpc).toHaveBeenLastCalledWith('claim_social_publish_batch', {
      p_owner: 'daemon',
      p_now: NOW.toISOString(),
    });
  });
});
