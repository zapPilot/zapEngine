import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabase = vi.hoisted(() => ({
  getPipelineSupabase: vi.fn(),
  throwSupabaseError: vi.fn((error: unknown) => {
    throw error;
  }),
}));

vi.mock('../services/supabase-client.js', () => supabase);

import { listUnfinishedSocialPublishJobs } from './daemon-store.js';

interface UnfinishedJobsResult {
  data: unknown;
  error: unknown;
}

function createUnfinishedJobsFixture(result?: UnfinishedJobsResult) {
  const rows = [
    {
      id: 'queued-job',
      episode_id: 'episode-queued',
      platform: 'threads' as const,
      status: 'queued' as const,
    },
    {
      id: 'failed-job',
      episode_id: 'episode-failed',
      platform: 'x' as const,
      status: 'failed' as const,
    },
  ];
  const returns = vi
    .fn()
    .mockResolvedValue(result ?? { data: rows, error: null });
  const statusFilter = vi.fn(() => ({ returns }));
  const select = vi.fn(() => ({ in: statusFilter }));
  const from = vi.fn(() => ({ select }));
  supabase.getPipelineSupabase.mockReturnValue({ from });
  return { rows, from, select, statusFilter };
}

describe('listUnfinishedSocialPublishJobs query', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps both queued and failed jobs eligible while excluding processing leases', async () => {
    const fixture = createUnfinishedJobsFixture();

    await expect(listUnfinishedSocialPublishJobs()).resolves.toEqual(
      fixture.rows,
    );

    expect(fixture.from).toHaveBeenCalledWith('social_publish_jobs');
    expect(fixture.select).toHaveBeenCalledWith(
      'id,episode_id,platform,status',
    );
    expect(fixture.statusFilter).toHaveBeenCalledWith('status', [
      'queued',
      'failed',
    ]);
  });

  it('treats a null row set as an empty unfinished queue', async () => {
    createUnfinishedJobsFixture({ data: null, error: null });

    await expect(listUnfinishedSocialPublishJobs()).resolves.toEqual([]);
    expect(supabase.throwSupabaseError).not.toHaveBeenCalled();
  });

  it('fails closed when the unfinished-job read returns a database error', async () => {
    const databaseError = { message: 'unfinished jobs read failed' };
    createUnfinishedJobsFixture({ data: null, error: databaseError });

    await expect(listUnfinishedSocialPublishJobs()).rejects.toBe(databaseError);
    expect(supabase.throwSupabaseError).toHaveBeenCalledOnce();
    expect(supabase.throwSupabaseError).toHaveBeenCalledWith(databaseError);
  });
});
