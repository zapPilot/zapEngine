import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_PUBLISH_ATTEMPTS } from './daemon-store.js';
import type { ReleaseScheduleRow } from './release-cohort-plan.js';

type ReleaseQueueFixture = ReleaseScheduleRow & { attempt_count: number };

interface ReadFixture {
  columns: string;
  statuses: string[];
  orderColumn: string;
  from: number;
  to: number;
}

// A flat Supabase double: each PostgREST stage is its own named function so the
// builder chain stays readable instead of nesting six closures deep.
const supabase = vi.hoisted(() => {
  const state = {
    rows: [] as ReleaseQueueFixture[],
    readError: null as unknown,
    updateError: null as unknown,
    /** Simulates a concurrent writer landing between the read and the writes. */
    afterRead: null as null | (() => void),
    reads: [] as ReadFixture[],
    writes: [] as Record<string, unknown>[],
    rpc: vi.fn(),
  };

  const readPage = async (read: { from: number; to: number }) => {
    const ordered = [...state.rows]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((row) => ({ ...row }));
    state.afterRead?.();
    if (state.readError) return { data: null, error: state.readError };
    return { data: ordered.slice(read.from, read.to + 1), error: null };
  };

  const selectStage = (columns: string) => {
    const read = {
      columns,
      statuses: [] as string[],
      orderColumn: '',
      from: 0,
      to: 0,
    };
    state.reads.push(read);
    const query = {
      in: (_column: string, statuses: string[]) => {
        read.statuses = statuses;
        return query;
      },
      order: (column: string) => {
        read.orderColumn = column;
        return query;
      },
      range: (from: number, to: number) => {
        read.from = from;
        read.to = to;
        return query;
      },
      returns: () => readPage(read),
    };
    return query;
  };

  const updateStage = (patch: Record<string, unknown>) => {
    state.writes.push(patch);
    const fence: { id?: string; status?: string } = {};
    const applyPatch = async () => {
      if (state.updateError) return { data: null, error: state.updateError };
      const row = state.rows.find(
        (candidate) =>
          candidate.id === fence.id && candidate.status === fence.status,
      );
      if (!row) return { data: null, error: null };
      Object.assign(row, patch);
      return { data: { id: row.id }, error: null };
    };
    const query = {
      eq: (column: string, value: string) => {
        if (column === 'id') fence.id = value;
        if (column === 'status') fence.status = value;
        return query;
      },
      select: () => ({ maybeSingle: applyPatch }),
    };
    return query;
  };

  const from = (table: string) => {
    if (table !== 'social_publish_jobs') {
      throw new Error(`Unexpected table: ${table}`);
    }
    return { select: selectStage, update: updateStage };
  };

  return { state, client: { from, rpc: state.rpc } };
});

vi.mock('../services/supabase-client.js', () => ({
  throwSupabaseError: (error: unknown) => {
    throw error;
  },
  getPipelineSupabase: () => supabase.client,
}));

import {
  alignPendingSocialReleaseCohorts,
  claimReleaseCohortJobs,
  listPartiallyPublishedCohorts,
} from './release-cohort-store.js';

const { state } = supabase;
const NOW = new Date('2026-09-01T05:00:00.000Z'); // 14:00 JST
const GRACE_MS = 90 * 60_000;
const ARTICLE_A = '123e4567-e89b-42d3-a456-426614174000';
const ARTICLE_B = '123e4567-e89b-42d3-a456-426614174111';
const ARTICLE_C = '123e4567-e89b-42d3-a456-426614174222';
const NEXT_SLOT = '2026-09-02T03:00:00.000Z';

function row(
  episodeId: string,
  id: string,
  overrides: Partial<ReleaseQueueFixture> = {},
): ReleaseQueueFixture {
  return {
    id,
    episode_id: episodeId,
    status: 'queued',
    scheduled_at: '2026-09-01T03:00:00.000Z',
    next_attempt_at: '2026-09-01T03:00:00.000Z',
    completed_at: null,
    attempt_count: 0,
    ...overrides,
  };
}

beforeEach(() => {
  state.rows = [];
  state.readError = null;
  state.updateError = null;
  state.afterRead = null;
  state.reads = [];
  state.writes = [];
  state.rpc.mockReset().mockResolvedValue({ data: [], error: null });
});

describe('alignPendingSocialReleaseCohorts', () => {
  it('reads every column the plan depends on across all live statuses', async () => {
    await alignPendingSocialReleaseCohorts(NOW, GRACE_MS);

    expect(state.reads).toEqual([
      {
        columns:
          'id,episode_id,status,scheduled_at,next_attempt_at,completed_at,attempt_count',
        statuses: ['queued', 'failed', 'processing', 'completed'],
        // Paged on the unique column: a cohort's lanes share `scheduled_at`,
        // so paging on it would shift rows between pages.
        orderColumn: 'id',
        from: 0,
        to: 999,
      },
    ]);
  });

  it('writes the planned slot to every movable lane and counts the article once', async () => {
    state.rows = [
      row(ARTICLE_A, 'rednote'),
      row(ARTICLE_A, 'threads', {
        scheduled_at: '2026-09-01T05:30:00.000Z',
        next_attempt_at: '2026-09-01T05:30:00.000Z',
      }),
    ];

    const result = await alignPendingSocialReleaseCohorts(NOW, GRACE_MS);

    expect(result).toEqual({
      alignedLanes: 2,
      rescheduledEpisodes: 1,
      recoveryEpisodes: [],
    });
    expect(state.rows.map((item) => item.scheduled_at)).toEqual([
      NEXT_SLOT,
      NEXT_SLOT,
    ]);
    expect(state.writes).toEqual([
      {
        scheduled_at: NEXT_SLOT,
        next_attempt_at: NEXT_SLOT,
        updated_at: NOW.toISOString(),
      },
      {
        scheduled_at: NEXT_SLOT,
        next_attempt_at: NEXT_SLOT,
        updated_at: NOW.toISOString(),
      },
    ]);
  });

  it('leaves a lane whose status changed after the read for the next tick', async () => {
    state.rows = [
      row(ARTICLE_A, 'rednote'),
      row(ARTICLE_A, 'threads', {
        scheduled_at: '2026-09-01T05:30:00.000Z',
        next_attempt_at: '2026-09-01T05:30:00.000Z',
      }),
    ];
    // Another daemon claims the first lane between the plan and its writes.
    state.afterRead = () => {
      state.rows[0]!.status = 'processing';
    };

    const result = await alignPendingSocialReleaseCohorts(NOW, GRACE_MS);

    expect(result.alignedLanes).toBe(1);
    expect(state.rows[0]).toMatchObject({
      status: 'processing',
      scheduled_at: '2026-09-01T03:00:00.000Z',
    });
    expect(state.rows[1]).toMatchObject({ scheduled_at: NEXT_SLOT });
  });

  it('reports recovery articles without touching their published lanes', async () => {
    state.rows = [
      row(ARTICLE_A, 'published', {
        status: 'completed',
        completed_at: '2026-09-01T03:01:00.000Z',
      }),
      row(ARTICLE_A, 'retrying', {
        status: 'failed',
        scheduled_at: '2026-09-01T08:15:00.000Z',
        next_attempt_at: '2026-09-01T08:15:00.000Z',
      }),
    ];

    const result = await alignPendingSocialReleaseCohorts(NOW, GRACE_MS);

    expect(result).toEqual({
      alignedLanes: 1,
      rescheduledEpisodes: 0,
      recoveryEpisodes: [ARTICLE_A],
    });
    expect(state.rows[0]).toMatchObject({
      status: 'completed',
      scheduled_at: '2026-09-01T03:00:00.000Z',
      completed_at: '2026-09-01T03:01:00.000Z',
    });
  });

  it('fails the tick when the queue read fails', async () => {
    state.readError = new Error('queue read down');

    await expect(
      alignPendingSocialReleaseCohorts(NOW, GRACE_MS),
    ).rejects.toThrow('queue read down');
  });

  it('fails the tick when a lane write fails', async () => {
    state.rows = [
      row(ARTICLE_A, 'rednote'),
      row(ARTICLE_A, 'threads', {
        scheduled_at: '2026-09-01T05:30:00.000Z',
        next_attempt_at: '2026-09-01T05:30:00.000Z',
      }),
    ];
    state.updateError = new Error('queue write down');

    await expect(
      alignPendingSocialReleaseCohorts(NOW, GRACE_MS),
    ).rejects.toThrow('queue write down');
  });
});

describe('listPartiallyPublishedCohorts', () => {
  it('returns only articles holding both a published and an unfinished lane', async () => {
    state.rows = [
      row(ARTICLE_A, 'a-done', {
        status: 'completed',
        completed_at: NOW.toISOString(),
      }),
      row(ARTICLE_A, 'a-pending'),
      row(ARTICLE_B, 'b-pending'),
      row(ARTICLE_B, 'b-retrying', { status: 'failed' }),
      row(ARTICLE_C, 'c-done', {
        status: 'completed',
        completed_at: NOW.toISOString(),
      }),
    ];

    expect(await listPartiallyPublishedCohorts()).toEqual([ARTICLE_A]);
  });

  it('ignores an article whose only unfinished lane can never be claimed again', async () => {
    state.rows = [
      // A: the surviving lane burned every attempt, so the claim RPC's
      // `attempt_count < 8` fence can never return it. Fencing the queue on
      // this article would stop every other article forever.
      row(ARTICLE_A, 'a-done', {
        status: 'completed',
        completed_at: NOW.toISOString(),
      }),
      row(ARTICLE_A, 'a-dead', {
        status: 'failed',
        attempt_count: MAX_PUBLISH_ATTEMPTS,
      }),
      // B: still has attempts left, so it is genuine recovery work.
      row(ARTICLE_B, 'b-done', {
        status: 'completed',
        completed_at: NOW.toISOString(),
      }),
      row(ARTICLE_B, 'b-retrying', {
        status: 'failed',
        attempt_count: MAX_PUBLISH_ATTEMPTS - 1,
      }),
    ];

    expect(await listPartiallyPublishedCohorts()).toEqual([ARTICLE_B]);
  });

  it('pages past the first response so a late article is not silently dropped', async () => {
    // A full first page is indistinguishable from a truncated one, so the read
    // has to ask for the next page before it can trust the queue it planned on.
    const settled = Array.from({ length: 1000 }, (_, index) =>
      row(`filler-${index}`, `filler-${String(index).padStart(4, '0')}`, {
        status: 'completed',
        completed_at: NOW.toISOString(),
      }),
    );
    state.rows = [
      ...settled,
      row(ARTICLE_A, 'z-done', {
        status: 'completed',
        completed_at: NOW.toISOString(),
      }),
      row(ARTICLE_A, 'z-pending'),
    ];

    expect(await listPartiallyPublishedCohorts()).toEqual([ARTICLE_A]);
    expect(state.reads.map((read) => [read.from, read.to])).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it('propagates a read failure instead of reporting an empty queue', async () => {
    state.readError = new Error('queue read down');

    await expect(listPartiallyPublishedCohorts()).rejects.toThrow(
      'queue read down',
    );
  });
});

describe('claimReleaseCohortJobs', () => {
  it('sends the episode fence only while recovering a partial article', async () => {
    await claimReleaseCohortJobs({
      owner: 'daemon',
      now: NOW,
      episodeId: ARTICLE_A,
    });
    expect(state.rpc).toHaveBeenLastCalledWith('claim_social_publish_batch', {
      p_owner: 'daemon',
      p_now: NOW.toISOString(),
      p_episode_id: ARTICLE_A,
    });

    await claimReleaseCohortJobs({ owner: 'daemon', now: NOW });
    expect(state.rpc).toHaveBeenLastCalledWith('claim_social_publish_batch', {
      p_owner: 'daemon',
      p_now: NOW.toISOString(),
    });
  });

  it('treats a null claim payload as an empty batch', async () => {
    state.rpc.mockResolvedValue({ data: null, error: null });

    expect(await claimReleaseCohortJobs({ owner: 'daemon', now: NOW })).toEqual(
      [],
    );
  });

  it('propagates a claim failure instead of publishing nothing quietly', async () => {
    state.rpc.mockResolvedValue({ data: null, error: new Error('claim down') });

    await expect(
      claimReleaseCohortJobs({ owner: 'daemon', now: NOW }),
    ).rejects.toThrow('claim down');
  });
});
