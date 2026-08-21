import { describe, expect, it, vi } from 'vitest';

const supabase = vi.hoisted(() => ({
  getPipelineSupabase: vi.fn(),
  throwSupabaseError: vi.fn((error: unknown) => {
    throw error;
  }),
}));

vi.mock('../services/supabase-client.js', () => supabase);

import { alignPendingSocialPublishSchedules } from './daemon-store.js';

describe('alignPendingSocialPublishSchedules claim recovery', () => {
  it('uses the latest failed status and preserves backoff after a claimed job returns', async () => {
    const snapshots = [
      [
        {
          id: 'earliest-before-claim',
          episode_id: 'episode-claim-recovery',
          status: 'queued',
          scheduled_at: '2026-08-20T03:00:00.000Z',
          next_attempt_at: '2026-08-20T03:00:00.000Z',
        },
        {
          id: 'target',
          episode_id: 'episode-claim-recovery',
          status: 'queued',
          scheduled_at: '2026-08-20T05:00:00.000Z',
          next_attempt_at: '2026-08-20T05:00:00.000Z',
        },
      ],
      [
        {
          id: 'only-eligible-job',
          episode_id: 'episode-claim-recovery',
          status: 'queued',
          scheduled_at: '2026-08-20T04:00:00.000Z',
          next_attempt_at: '2026-08-20T04:00:00.000Z',
        },
      ],
      [
        {
          id: 'new-earliest',
          episode_id: 'episode-claim-recovery',
          status: 'queued',
          scheduled_at: '2026-08-20T04:00:00.000Z',
          next_attempt_at: '2026-08-20T04:00:00.000Z',
        },
        {
          id: 'target',
          episode_id: 'episode-claim-recovery',
          status: 'failed',
          scheduled_at: '2026-08-20T05:00:00.000Z',
          next_attempt_at: '2026-08-20T10:00:00.000Z',
        },
      ],
    ];
    const attemptedPatches: Record<string, unknown>[] = [];
    const attemptedIds: string[] = [];
    const statusFences: string[] = [];
    let listAttempt = 0;
    let updateAttempt = 0;

    const update = vi.fn((patch: Record<string, unknown>) => {
      attemptedPatches.push(patch);
      const builder = {
        eq(field: string, value: string) {
          if (field === 'id') attemptedIds.push(value);
          if (field === 'status') statusFences.push(value);
          return builder;
        },
        select() {
          return {
            async maybeSingle() {
              updateAttempt += 1;
              return {
                data: updateAttempt === 1 ? null : { id: 'target' },
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
    await expect(alignPendingSocialPublishSchedules()).resolves.toBe(0);
    await expect(alignPendingSocialPublishSchedules()).resolves.toBe(1);

    expect(attemptedIds).toEqual(['target', 'target']);
    expect(statusFences).toEqual(['queued', 'failed']);
    expect(attemptedPatches).toEqual([
      {
        scheduled_at: '2026-08-20T03:00:00.000Z',
        next_attempt_at: '2026-08-20T03:00:00.000Z',
      },
      {
        scheduled_at: '2026-08-20T04:00:00.000Z',
      },
    ]);
  });

  it('recomputes queued timing from the latest snapshot after a claim ends', async () => {
    const snapshots = [
      [
        {
          id: 'stale-earliest-before-claim',
          episode_id: 'episode-queued-recovery',
          status: 'queued',
          scheduled_at: '2026-08-20T03:00:00.000Z',
          next_attempt_at: '2026-08-20T03:00:00.000Z',
        },
        {
          id: 'target',
          episode_id: 'episode-queued-recovery',
          status: 'queued',
          scheduled_at: '2026-08-20T05:00:00.000Z',
          next_attempt_at: '2026-08-20T05:00:00.000Z',
        },
      ],
      [
        {
          id: 'only-eligible-while-target-processing',
          episode_id: 'episode-queued-recovery',
          status: 'queued',
          scheduled_at: '2026-08-20T04:00:00.000Z',
          next_attempt_at: '2026-08-20T04:00:00.000Z',
        },
      ],
      [
        {
          id: 'new-earliest-after-claim',
          episode_id: 'episode-queued-recovery',
          status: 'queued',
          scheduled_at: '2026-08-20T06:00:00.000Z',
          next_attempt_at: '2026-08-20T06:00:00.000Z',
        },
        {
          id: 'target',
          episode_id: 'episode-queued-recovery',
          status: 'queued',
          scheduled_at: '2026-08-20T09:00:00.000Z',
          next_attempt_at: '2026-08-20T11:00:00.000Z',
        },
      ],
    ];
    const attemptedPatches: Record<string, unknown>[] = [];
    const attemptedIds: string[] = [];
    const statusFences: string[] = [];
    let listAttempt = 0;
    let updateAttempt = 0;

    const update = vi.fn((patch: Record<string, unknown>) => {
      attemptedPatches.push(patch);
      const builder = {
        eq(field: string, value: string) {
          if (field === 'id') attemptedIds.push(value);
          if (field === 'status') statusFences.push(value);
          return builder;
        },
        select() {
          return {
            async maybeSingle() {
              updateAttempt += 1;
              return {
                data: updateAttempt === 1 ? null : { id: 'target' },
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
    await expect(alignPendingSocialPublishSchedules()).resolves.toBe(0);
    await expect(alignPendingSocialPublishSchedules()).resolves.toBe(1);

    expect(attemptedIds).toEqual(['target', 'target']);
    expect(statusFences).toEqual(['queued', 'queued']);
    expect(attemptedPatches).toEqual([
      {
        scheduled_at: '2026-08-20T03:00:00.000Z',
        next_attempt_at: '2026-08-20T03:00:00.000Z',
      },
      {
        scheduled_at: '2026-08-20T06:00:00.000Z',
        next_attempt_at: '2026-08-20T06:00:00.000Z',
      },
    ]);
  });

  it('uses a recovered target as the new earliest schedule for its siblings', async () => {
    const snapshots = [
      [
        {
          id: 'earliest-before-claim',
          episode_id: 'episode-recovered-earliest',
          status: 'queued',
          scheduled_at: '2026-08-20T03:00:00.000Z',
          next_attempt_at: '2026-08-20T03:00:00.000Z',
        },
        {
          id: 'target',
          episode_id: 'episode-recovered-earliest',
          status: 'queued',
          scheduled_at: '2026-08-20T05:00:00.000Z',
          next_attempt_at: '2026-08-20T05:00:00.000Z',
        },
      ],
      [
        {
          id: 'sibling',
          episode_id: 'episode-recovered-earliest',
          status: 'queued',
          scheduled_at: '2026-08-20T04:00:00.000Z',
          next_attempt_at: '2026-08-20T04:00:00.000Z',
        },
      ],
      [
        {
          id: 'target',
          episode_id: 'episode-recovered-earliest',
          status: 'queued',
          scheduled_at: '2026-08-20T02:00:00.000Z',
          next_attempt_at: '2026-08-20T02:00:00.000Z',
        },
        {
          id: 'sibling',
          episode_id: 'episode-recovered-earliest',
          status: 'queued',
          scheduled_at: '2026-08-20T04:00:00.000Z',
          next_attempt_at: '2026-08-20T04:00:00.000Z',
        },
      ],
    ];
    const attemptedPatches: Record<string, unknown>[] = [];
    const attemptedIds: string[] = [];
    const statusFences: string[] = [];
    let listAttempt = 0;
    let updateAttempt = 0;

    const update = vi.fn((patch: Record<string, unknown>) => {
      attemptedPatches.push(patch);
      const builder = {
        eq(field: string, value: string) {
          if (field === 'id') attemptedIds.push(value);
          if (field === 'status') statusFences.push(value);
          return builder;
        },
        select() {
          return {
            async maybeSingle() {
              updateAttempt += 1;
              return {
                data: updateAttempt === 1 ? null : { id: 'sibling' },
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
    await expect(alignPendingSocialPublishSchedules()).resolves.toBe(0);
    await expect(alignPendingSocialPublishSchedules()).resolves.toBe(1);

    expect(attemptedIds).toEqual(['target', 'sibling']);
    expect(statusFences).toEqual(['queued', 'queued']);
    expect(attemptedPatches).toEqual([
      {
        scheduled_at: '2026-08-20T03:00:00.000Z',
        next_attempt_at: '2026-08-20T03:00:00.000Z',
      },
      {
        scheduled_at: '2026-08-20T02:00:00.000Z',
        next_attempt_at: '2026-08-20T02:00:00.000Z',
      },
    ]);
  });

  it('uses a recovered failed target as earliest without erasing its retry backoff', async () => {
    const jobs = [
      {
        id: 'recovered-failed-earliest',
        episode_id: 'episode-failed-earliest',
        status: 'failed',
        scheduled_at: '2026-08-20T02:00:00.000Z',
        next_attempt_at: '2026-08-20T10:00:00.000Z',
      },
      {
        id: 'queued-sibling',
        episode_id: 'episode-failed-earliest',
        status: 'queued',
        scheduled_at: '2026-08-20T04:00:00.000Z',
        next_attempt_at: '2026-08-20T04:00:00.000Z',
      },
    ];
    const attemptedIds: string[] = [];
    const attemptedPatches: Record<string, unknown>[] = [];

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
              return { data: { id: 'queued-sibling' }, error: null };
            },
          };
        },
      };
      return builder;
    });
    const select = vi.fn(() => ({
      in: vi.fn(() => ({
        returns: vi.fn(async () => ({ data: jobs, error: null })),
      })),
    }));
    supabase.getPipelineSupabase.mockReturnValue({
      from: vi.fn(() => ({ select, update })),
    });

    await expect(alignPendingSocialPublishSchedules()).resolves.toBe(1);

    expect(attemptedIds).toEqual(['queued-sibling']);
    expect(attemptedPatches).toEqual([
      {
        scheduled_at: '2026-08-20T02:00:00.000Z',
        next_attempt_at: '2026-08-20T02:00:00.000Z',
      },
    ]);
    expect(jobs[0]?.next_attempt_at).toBe('2026-08-20T10:00:00.000Z');
  });
});
