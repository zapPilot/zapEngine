import { describe, expect, it, vi } from 'vitest';

const supabase = vi.hoisted(() => ({
  getPipelineSupabase: vi.fn(),
  throwSupabaseError: vi.fn((error: unknown) => {
    throw error;
  }),
}));

vi.mock('../services/supabase-client.js', () => supabase);

import { alignPendingSocialPublishSchedules } from './daemon-store.js';

const NOW = new Date('2026-08-19T00:00:00.000Z');

describe('alignPendingSocialPublishSchedules update failures', () => {
  it('recovers remaining alignments across a partial write and retry CAS miss', async () => {
    const jobs = [
      {
        id: 'earliest',
        episode_id: 'episode-1',
        status: 'queued',
        scheduled_at: '2026-08-19T01:00:00.000Z',
        next_attempt_at: '2026-08-19T01:00:00.000Z',
      },
      {
        id: 'aligned-before-error',
        episode_id: 'episode-1',
        status: 'queued',
        scheduled_at: '2026-08-19T02:00:00.000Z',
        next_attempt_at: '2026-08-19T02:00:00.000Z',
      },
      {
        id: 'update-errors',
        episode_id: 'episode-1',
        status: 'failed',
        scheduled_at: '2026-08-19T03:00:00.000Z',
        next_attempt_at: '2026-08-19T09:00:00.000Z',
      },
      {
        id: 'must-run-next-tick',
        episode_id: 'episode-1',
        status: 'queued',
        scheduled_at: '2026-08-19T04:00:00.000Z',
        next_attempt_at: '2026-08-19T04:00:00.000Z',
      },
    ];
    const attemptedIds: string[] = [];
    const attemptedPatches: Record<string, unknown>[] = [];
    const databaseError = { message: 'alignment write failed' };
    let failUpdateOnce = true;
    let missRecoveryCasOnce = true;

    const update = vi.fn((patch: Record<string, unknown>) => {
      attemptedPatches.push(patch);
      let id = '';
      const builder = {
        eq(field: string, value: string) {
          if (field === 'id') id = value;
          return builder;
        },
        select() {
          return {
            async maybeSingle() {
              attemptedIds.push(id);
              if (id === 'update-errors' && failUpdateOnce) {
                failUpdateOnce = false;
                return { data: null, error: databaseError };
              }
              if (id === 'update-errors' && missRecoveryCasOnce) {
                missRecoveryCasOnce = false;
                return { data: null, error: null };
              }
              const job = jobs.find((candidate) => candidate.id === id);
              if (job) Object.assign(job, patch);
              return { data: { id }, error: null };
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

    await expect(alignPendingSocialPublishSchedules(NOW)).rejects.toBe(
      databaseError,
    );

    expect(attemptedIds).toEqual(['aligned-before-error', 'update-errors']);
    expect(attemptedIds).not.toContain('must-run-next-tick');
    expect(attemptedPatches[1]).not.toHaveProperty('next_attempt_at');
    expect(supabase.throwSupabaseError).toHaveBeenCalledWith(databaseError);

    await expect(alignPendingSocialPublishSchedules(NOW)).resolves.toBe(1);

    expect(attemptedIds).toEqual([
      'aligned-before-error',
      'update-errors',
      'update-errors',
      'must-run-next-tick',
    ]);
    expect(jobs[2]?.scheduled_at).toBe('2026-08-19T03:00:00.000Z');
    expect(jobs[2]?.next_attempt_at).toBe('2026-08-19T09:00:00.000Z');
    expect(jobs[3]?.scheduled_at).toBe('2026-08-19T01:00:00.000Z');
    expect(jobs[3]?.next_attempt_at).toBe('2026-08-19T01:00:00.000Z');

    await expect(alignPendingSocialPublishSchedules(NOW)).resolves.toBe(1);

    expect(jobs[2]?.scheduled_at).toBe('2026-08-19T01:00:00.000Z');
    expect(jobs[2]?.next_attempt_at).toBe('2026-08-19T09:00:00.000Z');
  });

  it('converges after a failed-job CAS miss and queued sibling write error', async () => {
    const jobs = [
      {
        id: 'earliest',
        episode_id: 'episode-2',
        status: 'queued',
        scheduled_at: '2026-08-19T01:00:00.000Z',
        next_attempt_at: '2026-08-19T01:00:00.000Z',
      },
      {
        id: 'failed-cas-miss',
        episode_id: 'episode-2',
        status: 'failed',
        scheduled_at: '2026-08-19T03:00:00.000Z',
        next_attempt_at: '2026-08-19T09:00:00.000Z',
      },
      {
        id: 'queued-write-error',
        episode_id: 'episode-2',
        status: 'queued',
        scheduled_at: '2026-08-19T04:00:00.000Z',
        next_attempt_at: '2026-08-19T04:00:00.000Z',
      },
    ];
    const attemptedIds: string[] = [];
    const attemptedPatches: Record<string, unknown>[] = [];
    const databaseError = { message: 'queued alignment write failed' };
    let missFailedCasOnce = true;
    let failQueuedWriteOnce = true;

    const update = vi.fn((patch: Record<string, unknown>) => {
      attemptedPatches.push(patch);
      let id = '';
      const builder = {
        eq(field: string, value: string) {
          if (field === 'id') id = value;
          return builder;
        },
        select() {
          return {
            async maybeSingle() {
              attemptedIds.push(id);
              if (id === 'failed-cas-miss' && missFailedCasOnce) {
                missFailedCasOnce = false;
                return { data: null, error: null };
              }
              if (id === 'queued-write-error' && failQueuedWriteOnce) {
                failQueuedWriteOnce = false;
                return { data: null, error: databaseError };
              }
              const job = jobs.find((candidate) => candidate.id === id);
              if (job) Object.assign(job, patch);
              return { data: { id }, error: null };
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

    await expect(alignPendingSocialPublishSchedules(NOW)).rejects.toBe(
      databaseError,
    );

    expect(attemptedIds).toEqual(['failed-cas-miss', 'queued-write-error']);
    expect(attemptedPatches[0]).not.toHaveProperty('next_attempt_at');
    expect(attemptedPatches[1]).toMatchObject({
      scheduled_at: '2026-08-19T01:00:00.000Z',
      next_attempt_at: '2026-08-19T01:00:00.000Z',
    });

    await expect(alignPendingSocialPublishSchedules(NOW)).resolves.toBe(2);
    expect(jobs[1]?.next_attempt_at).toBe('2026-08-19T09:00:00.000Z');
    expect(jobs[2]?.next_attempt_at).toBe('2026-08-19T01:00:00.000Z');
  });

  it('recovers on the next run after the initial job list query fails', async () => {
    const jobs = [
      {
        id: 'earliest',
        episode_id: 'episode-3',
        status: 'queued',
        scheduled_at: '2026-08-19T01:00:00.000Z',
        next_attempt_at: '2026-08-19T01:00:00.000Z',
      },
      {
        id: 'align-after-read-recovery',
        episode_id: 'episode-3',
        status: 'queued',
        scheduled_at: '2026-08-19T05:00:00.000Z',
        next_attempt_at: '2026-08-19T05:00:00.000Z',
      },
    ];
    const databaseError = { message: 'alignment list failed' };
    let failListOnce = true;

    const update = vi.fn((patch: Record<string, unknown>) => {
      let id = '';
      const builder = {
        eq(field: string, value: string) {
          if (field === 'id') id = value;
          return builder;
        },
        select() {
          return {
            async maybeSingle() {
              const job = jobs.find((candidate) => candidate.id === id);
              if (job) Object.assign(job, patch);
              return { data: { id }, error: null };
            },
          };
        },
      };
      return builder;
    });
    const select = vi.fn(() => ({
      in: vi.fn(() => ({
        returns: vi.fn(async () => {
          if (failListOnce) {
            failListOnce = false;
            return { data: null, error: databaseError };
          }
          return { data: jobs, error: null };
        }),
      })),
    }));
    supabase.getPipelineSupabase.mockReturnValue({
      from: vi.fn(() => ({ select, update })),
    });

    await expect(alignPendingSocialPublishSchedules(NOW)).rejects.toBe(
      databaseError,
    );
    expect(update).not.toHaveBeenCalled();
    expect(supabase.throwSupabaseError).toHaveBeenCalledWith(databaseError);

    await expect(alignPendingSocialPublishSchedules(NOW)).resolves.toBe(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(jobs[1]).toMatchObject({
      scheduled_at: '2026-08-19T01:00:00.000Z',
      next_attempt_at: '2026-08-19T01:00:00.000Z',
    });
  });

  it('uses a fresh job snapshot after a failed list query', async () => {
    const firstSnapshot = [
      {
        id: 'stale-earliest',
        episode_id: 'episode-4',
        status: 'queued',
        scheduled_at: '2026-08-19T01:00:00.000Z',
        next_attempt_at: '2026-08-19T01:00:00.000Z',
      },
      {
        id: 'target',
        episode_id: 'episode-4',
        status: 'queued',
        scheduled_at: '2026-08-19T05:00:00.000Z',
        next_attempt_at: '2026-08-19T05:00:00.000Z',
      },
    ];
    const recoveredSnapshot = [
      {
        id: 'new-earliest',
        episode_id: 'episode-4',
        status: 'queued',
        scheduled_at: '2026-08-19T03:00:00.000Z',
        next_attempt_at: '2026-08-19T03:00:00.000Z',
      },
      firstSnapshot[1],
    ];
    const databaseError = { message: 'initial alignment list failed' };
    const patches: Record<string, unknown>[] = [];
    let listAttempt = 0;

    const update = vi.fn((patch: Record<string, unknown>) => {
      patches.push(patch);
      const builder = {
        eq() {
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
            return { data: firstSnapshot, error: databaseError };
          }
          return { data: recoveredSnapshot, error: null };
        }),
      })),
    }));
    supabase.getPipelineSupabase.mockReturnValue({
      from: vi.fn(() => ({ select, update })),
    });

    await expect(alignPendingSocialPublishSchedules(NOW)).rejects.toBe(
      databaseError,
    );
    expect(update).not.toHaveBeenCalled();

    await expect(alignPendingSocialPublishSchedules(NOW)).resolves.toBe(1);
    expect(patches).toEqual([
      {
        scheduled_at: '2026-08-19T03:00:00.000Z',
        next_attempt_at: '2026-08-19T03:00:00.000Z',
      },
    ]);
  });
});
