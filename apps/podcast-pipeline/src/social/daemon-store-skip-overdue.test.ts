import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  update: vi.fn(),
  in: vi.fn(),
  lt: vi.fn(),
  select: vi.fn(),
  returns: vi.fn(),
}));

vi.mock('../services/supabase-client.js', () => ({
  getPipelineSupabase: () => ({ from: mocks.from }),
  throwSupabaseError: (error: unknown) => {
    throw error instanceof Error ? error : new Error(String(error));
  },
}));

import { skipOverdueSocialPublishJobs } from './daemon-store.js';

beforeEach(() => {
  vi.clearAllMocks();
  const builder = {
    update: mocks.update,
    in: mocks.in,
    lt: mocks.lt,
    select: mocks.select,
    returns: mocks.returns,
  };
  mocks.from.mockReturnValue(builder);
  mocks.update.mockReturnValue(builder);
  mocks.in.mockReturnValue(builder);
  mocks.lt.mockReturnValue(builder);
  mocks.select.mockReturnValue(builder);
  mocks.returns.mockResolvedValue({ data: [], error: null });
});

describe('skipOverdueSocialPublishJobs', () => {
  const now = new Date('2026-08-16T10:00:00.000Z');
  const graceMs = 60 * 60_000;

  it('atomically completes only queued and failed jobs older than the cutoff', async () => {
    mocks.returns.mockResolvedValue({
      data: [{ id: 'queued-job' }, { id: 'failed-job' }],
      error: null,
    });

    await expect(skipOverdueSocialPublishJobs({ now, graceMs })).resolves.toBe(
      2,
    );

    expect(mocks.from).toHaveBeenCalledWith('social_publish_jobs');
    expect(mocks.update).toHaveBeenCalledWith({
      status: 'completed',
      completed_at: now.toISOString(),
      lease_owner: null,
      lease_expires_at: null,
      last_error:
        'skipped: overdue; grace_ms=3600000; cutoff=2026-08-16T09:00:00.000Z',
      updated_at: now.toISOString(),
    });
    expect(mocks.in).toHaveBeenCalledWith('status', ['queued', 'failed']);
    expect(mocks.lt).toHaveBeenCalledWith(
      'scheduled_at',
      '2026-08-16T09:00:00.000Z',
    );
    expect(mocks.select).toHaveBeenCalledWith('id');
  });

  it('returns zero when no row is strictly older than the cutoff', async () => {
    await expect(skipOverdueSocialPublishJobs({ now, graceMs })).resolves.toBe(
      0,
    );

    expect(mocks.lt).toHaveBeenCalledWith(
      'scheduled_at',
      '2026-08-16T09:00:00.000Z',
    );
  });

  it('surfaces database errors', async () => {
    mocks.returns.mockResolvedValue({
      data: null,
      error: new Error('update unavailable'),
    });

    await expect(
      skipOverdueSocialPublishJobs({ now, graceMs }),
    ).rejects.toThrow('update unavailable');
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid grace %s before querying',
    async (invalidGraceMs) => {
      await expect(
        skipOverdueSocialPublishJobs({ now, graceMs: invalidGraceMs }),
      ).rejects.toThrow(
        'Social publish overdue grace must be a positive integer.',
      );
      expect(mocks.from).not.toHaveBeenCalled();
    },
  );
});
