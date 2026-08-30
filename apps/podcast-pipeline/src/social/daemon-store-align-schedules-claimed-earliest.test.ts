import { describe, expect, it, vi } from 'vitest';

const supabase = vi.hoisted(() => ({
  getPipelineSupabase: vi.fn(),
  throwSupabaseError: vi.fn((error: unknown) => {
    throw error;
  }),
}));

vi.mock('../services/supabase-client.js', () => supabase);

import { alignPendingSocialPublishSchedules } from './daemon-store.js';
import {
  createAlignmentReadFixture,
  createAlignmentUpdateFixture,
} from './daemon-store-align-schedules.test-helper.js';

const NOW = new Date('2026-08-20T00:00:00.000Z');

describe('alignPendingSocialPublishSchedules recovery snapshot', () => {
  it('drops a stale earliest job after another worker claims it', async () => {
    const staleSnapshot = [
      {
        id: 'claimed-earliest',
        episode_id: 'episode-status-transition',
        status: 'queued',
        scheduled_at: '2026-08-20T01:00:00.000Z',
        next_attempt_at: '2026-08-20T01:00:00.000Z',
      },
      {
        id: 'target',
        episode_id: 'episode-status-transition',
        status: 'queued',
        scheduled_at: '2026-08-20T05:00:00.000Z',
        next_attempt_at: '2026-08-20T05:00:00.000Z',
      },
    ];
    const recoveredSnapshot = [
      {
        id: 'failed-new-earliest',
        episode_id: 'episode-status-transition',
        status: 'failed',
        scheduled_at: '2026-08-20T03:00:00.000Z',
        next_attempt_at: '2026-08-20T09:00:00.000Z',
      },
      staleSnapshot[1],
    ];
    const { update, updates } = createAlignmentUpdateFixture();
    let listAttempt = 0;
    const fixture = createAlignmentReadFixture(() => {
      listAttempt += 1;
      return listAttempt === 1
        ? {
            data: staleSnapshot,
            error: { message: 'alignment list failed before claim transition' },
          }
        : { data: recoveredSnapshot, error: null };
    }, update);
    supabase.getPipelineSupabase.mockReturnValue(fixture.client);

    await expect(alignPendingSocialPublishSchedules(NOW)).rejects.toMatchObject(
      {
        message: 'alignment list failed before claim transition',
      },
    );
    await expect(alignPendingSocialPublishSchedules(NOW)).resolves.toBe(1);

    expect(updates).toEqual([
      {
        id: 'target',
        status: 'queued',
        patch: {
          scheduled_at: '2026-08-20T03:00:00.000Z',
          next_attempt_at: '2026-08-20T03:00:00.000Z',
        },
      },
    ]);
  });
});
