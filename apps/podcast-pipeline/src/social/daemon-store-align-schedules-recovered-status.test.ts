import { describe, expect, it, vi } from 'vitest';

const supabase = vi.hoisted(() => ({
  getPipelineSupabase: vi.fn(),
  throwSupabaseError: vi.fn((error: unknown) => {
    throw error;
  }),
}));

vi.mock('../services/supabase-client.js', () => supabase);

import { alignPendingSocialPublishSchedules } from './daemon-store.js';

interface StatusRecoveryCase {
  initialStatus: 'queued' | 'failed';
  recoveredStatus: 'queued' | 'failed';
  recoveredNextAttemptAt: string;
  expectedPatch: Record<string, unknown>;
}

async function runStatusRecoveryCase({
  initialStatus,
  recoveredStatus,
  recoveredNextAttemptAt,
  expectedPatch,
}: StatusRecoveryCase) {
  const failedReadSnapshot = [
    {
      id: 'earliest',
      episode_id: 'episode-status-change',
      status: 'queued',
      scheduled_at: '2026-08-19T01:00:00.000Z',
      next_attempt_at: '2026-08-19T01:00:00.000Z',
    },
    {
      id: 'target',
      episode_id: 'episode-status-change',
      status: initialStatus,
      scheduled_at: '2026-08-19T05:00:00.000Z',
      next_attempt_at: '2026-08-19T09:00:00.000Z',
    },
  ];
  const recoveredTarget = {
    id: 'target',
    episode_id: 'episode-status-change',
    status: recoveredStatus,
    scheduled_at: '2026-08-19T05:00:00.000Z',
    next_attempt_at: recoveredNextAttemptAt,
  } as const;
  const recoveredSnapshot = [
    {
      id: 'new-earliest',
      episode_id: 'episode-status-change',
      status: 'queued',
      scheduled_at: '2026-08-19T03:00:00.000Z',
      next_attempt_at: '2026-08-19T03:00:00.000Z',
    },
    recoveredTarget,
  ];
  const databaseError = { message: 'initial alignment list failed' };
  const attemptedPatches: Record<string, unknown>[] = [];
  const statusFences: string[] = [];
  let listAttempt = 0;

  const update = vi.fn((patch: Record<string, unknown>) => {
    attemptedPatches.push(patch);
    const builder = {
      eq(field: string, value: string) {
        if (field === 'status') statusFences.push(value);
        return builder;
      },
      select() {
        return {
          async maybeSingle() {
            return { data: { id: 'target' }, error: null };
          },
        };
      },
    };
    return builder;
  });
  const select = vi.fn(() => ({
    in: vi.fn(() => ({
      returns: vi.fn(async () => {
        listAttempt += 1;
        if (listAttempt === 1) {
          return { data: failedReadSnapshot, error: databaseError };
        }
        return { data: recoveredSnapshot, error: null };
      }),
    })),
  }));
  supabase.getPipelineSupabase.mockReturnValue({
    from: vi.fn(() => ({ select, update })),
  });

  await expect(alignPendingSocialPublishSchedules()).rejects.toBe(
    databaseError,
  );
  expect(update).not.toHaveBeenCalled();

  await expect(alignPendingSocialPublishSchedules()).resolves.toBe(1);

  expect(statusFences).toEqual([recoveredStatus]);
  expect(attemptedPatches).toEqual([expectedPatch]);
  return recoveredTarget;
}

describe('alignPendingSocialPublishSchedules recovered status changes', () => {
  it('preserves retry backoff when a queued target recovers as failed', async () => {
    const recoveredTarget = await runStatusRecoveryCase({
      initialStatus: 'queued',
      recoveredStatus: 'failed',
      recoveredNextAttemptAt: '2026-08-19T09:00:00.000Z',
      expectedPatch: {
        scheduled_at: '2026-08-19T03:00:00.000Z',
      },
    });

    expect(recoveredTarget.next_attempt_at).toBe('2026-08-19T09:00:00.000Z');
  });

  it('resets retry timing when a failed target recovers as queued', async () => {
    await runStatusRecoveryCase({
      initialStatus: 'failed',
      recoveredStatus: 'queued',
      recoveredNextAttemptAt: '2026-08-19T09:00:00.000Z',
      expectedPatch: {
        scheduled_at: '2026-08-19T03:00:00.000Z',
        next_attempt_at: '2026-08-19T03:00:00.000Z',
      },
    });
  });

  it('does not mutate a queued job after another worker claims it', async () => {
    const snapshots = [
      [
        {
          id: 'earliest',
          episode_id: 'episode-claim-race',
          status: 'queued',
          scheduled_at: '2026-08-19T03:00:00.000Z',
          next_attempt_at: '2026-08-19T03:00:00.000Z',
        },
        {
          id: 'target',
          episode_id: 'episode-claim-race',
          status: 'queued',
          scheduled_at: '2026-08-19T05:00:00.000Z',
          next_attempt_at: '2026-08-19T05:00:00.000Z',
        },
      ],
      [
        {
          id: 'new-earliest',
          episode_id: 'episode-claim-race',
          status: 'failed',
          scheduled_at: '2026-08-19T04:00:00.000Z',
          next_attempt_at: '2026-08-19T08:00:00.000Z',
        },
        {
          id: 'sibling',
          episode_id: 'episode-claim-race',
          status: 'queued',
          scheduled_at: '2026-08-19T06:00:00.000Z',
          next_attempt_at: '2026-08-19T06:00:00.000Z',
        },
      ],
    ];
    const attemptedIds: string[] = [];
    const attemptedPatches: Record<string, unknown>[] = [];
    let listAttempt = 0;
    let mutationAttempt = 0;

    const update = vi.fn((patch: Record<string, unknown>) => {
      attemptedPatches.push(patch);
      const builder = {
        eq(field: string, value: string) {
          if (field === 'id') attemptedIds.push(value);
          return builder;
        },
        select() {
          return {
            async maybeSingle() {
              mutationAttempt += 1;
              return {
                data: mutationAttempt === 1 ? null : { id: 'sibling' },
                error: null,
              };
            },
          };
        },
      };
      return builder;
    });
    const select = vi.fn(() => ({
      in: vi.fn(() => ({
        returns: vi.fn(async () => {
          const snapshot = snapshots[listAttempt] ?? [];
          listAttempt += 1;
          return { data: snapshot, error: null };
        }),
      })),
    }));
    supabase.getPipelineSupabase.mockReturnValue({
      from: vi.fn(() => ({ select, update })),
    });

    await expect(alignPendingSocialPublishSchedules()).resolves.toBe(0);
    await expect(alignPendingSocialPublishSchedules()).resolves.toBe(1);

    expect(attemptedIds).toEqual(['target', 'sibling']);
    expect(attemptedPatches).toEqual([
      {
        scheduled_at: '2026-08-19T03:00:00.000Z',
        next_attempt_at: '2026-08-19T03:00:00.000Z',
      },
      {
        scheduled_at: '2026-08-19T04:00:00.000Z',
        next_attempt_at: '2026-08-19T04:00:00.000Z',
      },
    ]);
  });
});
