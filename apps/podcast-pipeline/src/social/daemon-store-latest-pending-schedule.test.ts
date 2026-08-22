import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabase = vi.hoisted(() => ({
  getPipelineSupabase: vi.fn(),
  throwSupabaseError: vi.fn((error: unknown) => {
    throw error;
  }),
}));

vi.mock('../services/supabase-client.js', () => supabase);

import { latestPendingSocialPublishSchedule } from './daemon-store.js';

interface ScheduleQueryResult {
  data: { scheduled_at: string } | null;
  error: unknown;
}

function createScheduleQueryFixture(result: ScheduleQueryResult) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const limit = vi.fn(() => ({ maybeSingle }));
  const order = vi.fn(() => ({ limit }));
  const inFilter = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ in: inFilter }));
  const from = vi.fn(() => ({ select }));
  supabase.getPipelineSupabase.mockReturnValue({ from });
  return { from, select, inFilter, order, limit };
}

describe('latestPendingSocialPublishSchedule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps processing jobs in the pending scheduling horizon', async () => {
    const { from, select, inFilter, order, limit } = createScheduleQueryFixture(
      {
        data: { scheduled_at: '2026-08-21T12:00:00.000Z' },
        error: null,
      },
    );

    await expect(latestPendingSocialPublishSchedule()).resolves.toBe(
      '2026-08-21T12:00:00.000Z',
    );

    expect(from).toHaveBeenCalledWith('social_publish_jobs');
    expect(select).toHaveBeenCalledWith('scheduled_at');
    expect(inFilter).toHaveBeenCalledWith('status', [
      'queued',
      'failed',
      'processing',
    ]);
    expect(order).toHaveBeenCalledWith('scheduled_at', { ascending: false });
    expect(limit).toHaveBeenCalledWith(1);
  });

  it('returns null when there are no pending publish jobs', async () => {
    createScheduleQueryFixture({ data: null, error: null });

    await expect(latestPendingSocialPublishSchedule()).resolves.toBeNull();
    expect(supabase.throwSupabaseError).not.toHaveBeenCalled();
  });

  it('surfaces Supabase read errors', async () => {
    const databaseError = new Error('social publish schedule read failed');
    createScheduleQueryFixture({ data: null, error: databaseError });

    await expect(latestPendingSocialPublishSchedule()).rejects.toBe(
      databaseError,
    );
    expect(supabase.throwSupabaseError).toHaveBeenCalledWith(databaseError);
  });
});
