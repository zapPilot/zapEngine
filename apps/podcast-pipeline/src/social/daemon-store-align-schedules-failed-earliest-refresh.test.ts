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

function makeAlignmentFixture(): AlignmentFixture {
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
          scheduled_at: '2026-08-20T03:00:00.000Z',
          next_attempt_at: '2026-08-20T12:00:00.000Z',
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

function installSupabaseFixture(fixture: AlignmentFixture) {
  let listAttempt = 0;
  let updateAttempt = 0;

  const from = vi.fn(() => ({
    select: vi.fn(() => ({
      in: vi.fn(() => ({
        returns: vi.fn(async () => {
          const snapshot = fixture.snapshots[listAttempt] ?? [];
          listAttempt += 1;
          return { data: snapshot, error: null };
        }),
      })),
    })),
    update: vi.fn((patch: Record<string, unknown>) => {
      fixture.attemptedPatches.push(patch);
      const builder = {
        eq(field: string, value: string) {
          if (field === 'id') fixture.attemptedIds.push(value);
          if (field === 'status') fixture.statusFences.push(value);
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
    }),
  }));

  supabase.getPipelineSupabase.mockReturnValue({ from });
}

describe('alignPendingSocialPublishSchedules refreshed failed earliest', () => {
  it('uses the latest failed schedule and preserves its refreshed backoff after a sibling CAS miss', async () => {
    const fixture = makeAlignmentFixture();
    installSupabaseFixture(fixture);

    await expect(alignPendingSocialPublishSchedules()).resolves.toBe(0);
    await expect(alignPendingSocialPublishSchedules()).resolves.toBe(1);

    expect(fixture.attemptedIds).toEqual([
      'queued-sibling',
      'queued-sibling',
    ]);
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
});
