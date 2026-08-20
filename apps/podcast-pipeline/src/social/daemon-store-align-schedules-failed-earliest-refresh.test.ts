import { describe, expect, it, vi } from 'vitest';

const supabase = vi.hoisted(() => ({
  getPipelineSupabase: vi.fn(),
  throwSupabaseError: vi.fn((error: unknown) => {
    throw error;
  }),
}));

vi.mock('../services/supabase-client.js', () => supabase);

import { alignPendingSocialPublishSchedules } from './daemon-store.js';

interface PendingJob {
  id: string;
  episode_id: string;
  status: 'queued' | 'failed';
  scheduled_at: string;
  next_attempt_at: string;
}

interface AlignmentFixture {
  snapshots: PendingJob[][];
  attemptedPatches: Record<string, unknown>[];
  attemptedIds: string[];
  statusFences: string[];
}

interface QueryAttempts {
  list: number;
  update: number;
}

function makeAlignmentFixture(
  refreshedSchedule = '2026-08-20T03:00:00.000Z',
  refreshedBackoff = '2026-08-20T12:00:00.000Z',
): AlignmentFixture {
  return {
    snapshots: [
      [
        {
          id: 'failed-earliest',
          episode_id: 'episode-refresh',
          status: 'failed',
          scheduled_at: '2026-08-20T02:00:00.000Z',
          next_attempt_at: '2026-08-20T10:00:00.000Z',
        },
        {
          id: 'queued-sibling',
          episode_id: 'episode-refresh',
          status: 'queued',
          scheduled_at: '2026-08-20T04:00:00.000Z',
          next_attempt_at: '2026-08-20T04:00:00.000Z',
        },
      ],
      [
        {
          id: 'failed-earliest',
          episode_id: 'episode-refresh',
          status: 'failed',
          scheduled_at: refreshedSchedule,
          next_attempt_at: refreshedBackoff,
        },
        {
          id: 'queued-sibling',
          episode_id: 'episode-refresh',
          status: 'queued',
          scheduled_at: '2026-08-20T04:00:00.000Z',
          next_attempt_at: '2026-08-20T04:00:00.000Z',
        },
      ],
    ],
    attemptedPatches: [],
    attemptedIds: [],
    statusFences: [],
  };
}

function makeListQuery(fixture: AlignmentFixture, attempts: QueryAttempts) {
  const returns = vi.fn(async () => {
    const snapshot = fixture.snapshots[attempts.list] ?? [];
    attempts.list += 1;
    return { data: snapshot, error: null };
  });
  const inStatuses = vi.fn(() => ({ returns }));
  return vi.fn(() => ({ in: inStatuses }));
}

function makeUpdateQuery(fixture: AlignmentFixture, attempts: QueryAttempts) {
  return vi.fn((patch: Record<string, unknown>) => {
    fixture.attemptedPatches.push(patch);
    const maybeSingle = vi.fn(async () => {
      attempts.update += 1;
      return {
        data: attempts.update === 1 ? null : { id: 'queued-sibling' },
        error: null,
      };
    });
    const builder = {
      eq(field: string, value: string) {
        if (field === 'id') fixture.attemptedIds.push(value);
        if (field === 'status') fixture.statusFences.push(value);
        return builder;
      },
      select() {
        return { maybeSingle };
      },
    };
    return builder;
  });
}

function installSupabaseFixture(fixture: AlignmentFixture) {
  const attempts: QueryAttempts = { list: 0, update: 0 };
  const select = makeListQuery(fixture, attempts);
  const update = makeUpdateQuery(fixture, attempts);
  const from = vi.fn(() => ({ select, update }));
  supabase.getPipelineSupabase.mockReturnValue({ from });
}

describe('alignPendingSocialPublishSchedules refreshed failed earliest', () => {
  it('uses the latest failed schedule and preserves its refreshed backoff after a sibling CAS miss', async () => {
    const fixture = makeAlignmentFixture();
    installSupabaseFixture(fixture);

    await expect(alignPendingSocialPublishSchedules()).resolves.toBe(0);
    await expect(alignPendingSocialPublishSchedules()).resolves.toBe(1);

    expect(fixture.attemptedIds).toEqual(['queued-sibling', 'queued-sibling']);
    expect(fixture.statusFences).toEqual(['queued', 'queued']);
    expect(fixture.attemptedPatches).toEqual([
      {
        scheduled_at: '2026-08-20T02:00:00.000Z',
        next_attempt_at: '2026-08-20T02:00:00.000Z',
      },
      {
        scheduled_at: '2026-08-20T03:00:00.000Z',
        next_attempt_at: '2026-08-20T03:00:00.000Z',
      },
    ]);
    expect(fixture.snapshots[1]?.[0]?.next_attempt_at).toBe(
      '2026-08-20T12:00:00.000Z',
    );
  });

  it('recomputes from an earlier refreshed failed schedule without shortening its backoff', async () => {
    const fixture = makeAlignmentFixture(
      '2026-08-20T01:00:00.000Z',
      '2026-08-20T11:00:00.000Z',
    );
    installSupabaseFixture(fixture);

    await expect(alignPendingSocialPublishSchedules()).resolves.toBe(0);
    await expect(alignPendingSocialPublishSchedules()).resolves.toBe(1);

    expect(fixture.attemptedIds).toEqual(['queued-sibling', 'queued-sibling']);
    expect(fixture.statusFences).toEqual(['queued', 'queued']);
    expect(fixture.attemptedPatches).toEqual([
      {
        scheduled_at: '2026-08-20T02:00:00.000Z',
        next_attempt_at: '2026-08-20T02:00:00.000Z',
      },
      {
        scheduled_at: '2026-08-20T01:00:00.000Z',
        next_attempt_at: '2026-08-20T01:00:00.000Z',
      },
    ]);
    expect(fixture.snapshots[1]?.[0]?.next_attempt_at).toBe(
      '2026-08-20T11:00:00.000Z',
    );
  });
});
