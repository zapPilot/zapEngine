import { describe, expect, it, vi } from 'vitest';

const supabaseMocks = vi.hoisted(() => ({
  getPipelineSupabase: vi.fn(),
  throwSupabaseError: vi.fn((error: unknown) => {
    throw error;
  }),
}));

vi.mock('../services/supabase-client.js', () => supabaseMocks);

import { alignPendingSocialPublishSchedules } from './daemon-store.js';

describe('alignPendingSocialPublishSchedules status fence', () => {
  it('queries only queued and failed jobs so processing leases are never aligned', async () => {
    const returns = vi.fn(async () => ({ data: [], error: null }));
    const inFilter = vi.fn(() => ({ returns }));
    const select = vi.fn(() => ({ in: inFilter }));
    const update = vi.fn();
    const from = vi.fn(() => ({ select, update }));
    supabaseMocks.getPipelineSupabase.mockReturnValue({ from });

    await expect(alignPendingSocialPublishSchedules()).resolves.toBe(0);

    expect(from).toHaveBeenCalledOnce();
    expect(from).toHaveBeenCalledWith('social_publish_jobs');
    expect(select).toHaveBeenCalledWith(
      'id,episode_id,status,scheduled_at,next_attempt_at',
    );
    expect(inFilter).toHaveBeenCalledWith('status', ['queued', 'failed']);
    expect(update).not.toHaveBeenCalled();
  });
});
