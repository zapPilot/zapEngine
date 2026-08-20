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

function makeListQuery(jobs: PendingJob[]) {
  return {
    select: vi.fn(() => ({
      in: vi.fn(() => ({
        returns: vi.fn(async () => ({ data: jobs, error: null })),
      })),
    })),
  };
}

function makeUpdateQuery(input: {
  attemptedPatches: Record<string, unknown>[];
  attemptedIds: string[];
  statusFences: string[];
}) {
  let updateAttempt = 0;
  return vi.fn((patch: Record<string, unknown>) => {
    input.attemptedPatches.push(patch);
    const builder = {
      eq(field: string, value: string) {
        if (field === 'id') input.attemptedIds.push(value);
        if (field === 'status') input.statusFences.push(value);
        return builder;
      },
      select() {
        return {
          async maybeSingle() {
            updateAttempt += 1;
            return {
              data: updateAttempt === 1 ? null : { id: 'queued-sibling' },
              error: null,
            };
          },
        };
      },
    };
    return builder;
  });
}

describe('alignPendingSocialPublishSchedules failed-earliest recovery', () => {
  it('preserves failed backoff and converges a queued sibling after a CAS miss', async () => {
    const failedEarliest: PendingJob = {
      id: 'failed-earliest',
      episode_id: 'episode-race',
      status: 'failed',
      scheduled_at: '2026-08-20T02:00:00.000Z',
      next_attempt_at: '2026-08-20T10:00:00.000Z',
    };
    const queuedSibling: PendingJob = {
      id: 'queued-sibling',
      episode_id: 'episode-race',
      status: 'queued',
      scheduled_at: '2026-08-20T04:00:00.000Z',
      next_attempt_at: '2026-08-20T04:00:00.000Z',
    };
    const jobs = [failedEarliest, queuedSibling];
    const attemptedPatches: Record<string, unknown>[] = [];
    const attemptedIds: string[] = [];
    const statusFences: string[] = [];
    const listQuery = makeListQuery(jobs);
    const update = makeUpdateQuery({
      attemptedPatches,
      attemptedIds,
      statusFences,
    });

    supabase.getPipelineSupabase.mockReturnValue({
      from: vi.fn(() => ({ ...listQuery, update })),
    });

    await expect(alignPendingSocialPublishSchedules()).resolves.toBe(0);
    await expect(alignPendingSocialPublishSchedules()).resolves.toBe(1);

    expect(attemptedIds).toEqual(['queued-sibling', 'queued-sibling']);
    expect(statusFences).toEqual(['queued', 'queued']);
    expect(attemptedPatches).toEqual([
      {
        scheduled_at: '2026-08-20T02:00:00.000Z',
        next_attempt_at: '2026-08-20T02:00:00.000Z',
      },
      {
        scheduled_at: '2026-08-20T02:00:00.000Z',
        next_attempt_at: '2026-08-20T02:00:00.000Z',
      },
    ]);
    expect(failedEarliest.next_attempt_at).toBe('2026-08-20T10:00:00.000Z');
  });
});
