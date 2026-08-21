import { describe, expect, it, vi } from 'vitest';

const supabase = vi.hoisted(() => ({
  getPipelineSupabase: vi.fn(),
  throwSupabaseError: vi.fn((error: unknown) => {
    throw error;
  }),
}));

vi.mock('../services/supabase-client.js', () => supabase);

import { alignPendingSocialPublishSchedules } from './daemon-store.js';
import { createAlignmentReadFixture } from './daemon-store-align-schedules.test-helper.js';

describe('alignPendingSocialPublishSchedules no-op behavior', () => {
  it('does not write or count jobs that already share the earliest schedule', async () => {
    const fixture = createAlignmentReadFixture({
      data: [
        {
          id: 'threads-job',
          episode_id: 'episode-same-time',
          status: 'queued',
          scheduled_at: '2026-08-21T01:00:00.000Z',
          next_attempt_at: '2026-08-21T01:00:00.000Z',
        },
        {
          id: 'x-job',
          episode_id: 'episode-same-time',
          status: 'failed',
          scheduled_at: '2026-08-21T01:00:00.000Z',
          next_attempt_at: '2026-08-21T07:00:00.000Z',
        },
      ],
      error: null,
    });
    supabase.getPipelineSupabase.mockReturnValue(fixture.client);

    await expect(alignPendingSocialPublishSchedules()).resolves.toBe(0);

    expect(fixture.update).not.toHaveBeenCalled();
    expect(fixture.returns).toHaveBeenCalledOnce();
  });
});
