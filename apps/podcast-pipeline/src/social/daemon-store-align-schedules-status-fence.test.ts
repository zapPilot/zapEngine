import { describe, expect, it, vi } from 'vitest';

const supabaseMocks = vi.hoisted(() => ({
  getPipelineSupabase: vi.fn(),
  throwSupabaseError: vi.fn((error: unknown) => {
    throw error;
  }),
}));

vi.mock('../services/supabase-client.js', () => supabaseMocks);

import { alignPendingSocialPublishSchedules } from './daemon-store.js';
import { createAlignmentReadFixture } from './daemon-store-align-schedules.test-helper.js';

describe('alignPendingSocialPublishSchedules status fence', () => {
  it('queries only queued and failed jobs so processing leases are never aligned', async () => {
    const fixture = createAlignmentReadFixture({ data: [], error: null });
    supabaseMocks.getPipelineSupabase.mockReturnValue(fixture.client);

    await expect(alignPendingSocialPublishSchedules()).resolves.toBe(0);

    expect(fixture.from).toHaveBeenCalledOnce();
    expect(fixture.from).toHaveBeenCalledWith('social_publish_jobs');
    expect(fixture.select).toHaveBeenCalledWith(
      'id,episode_id,status,scheduled_at,next_attempt_at',
    );
    expect(fixture.inFilter).toHaveBeenCalledWith('status', [
      'queued',
      'failed',
    ]);
    expect(fixture.update).not.toHaveBeenCalled();
  });

  it('treats a null Supabase snapshot as empty without attempting writes', async () => {
    const fixture = createAlignmentReadFixture({ data: null, error: null });
    supabaseMocks.getPipelineSupabase.mockReturnValue(fixture.client);

    await expect(alignPendingSocialPublishSchedules()).resolves.toBe(0);

    expect(fixture.returns).toHaveBeenCalledOnce();
    expect(fixture.update).not.toHaveBeenCalled();
  });
});
